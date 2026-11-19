import AVFoundation
import Observation
import OSLog
import Speech

/// Dictation for the dock's mic. The web app uses the browser's Web Speech API with `lang = 'en-US'`
/// and interim results (FloatingMicrophone.tsx:70-123).
@Observable
@MainActor
final class SpeechRecognizer {
    /// The Web Speech `onerror` codes that FloatingMicrophone.tsx:54-68 turns into messages.
    enum Failure: Equatable {
        case notAllowed, noSpeech, audioCapture, network, unavailable

        /// FloatingMicrophone.tsx `speechErrorMessage`, verbatim.
        var message: String {
            switch self {
            case .notAllowed: "Microphone access is blocked. You can type your request instead."
            case .noSpeech: "We didn't catch that. Try again, or type your request below."
            case .audioCapture: "No microphone was found. You can type your request instead."
            case .network: "Voice recognition needs a network connection. You can type your request instead."
            case .unavailable: "Voice input is not available right now. You can type your request instead."
            }
        }
    }

    enum Status: Equatable {
        case idle, starting, listening, finished
        case failed(Failure)
    }

    private(set) var transcript = ""
    private(set) var status: Status = .idle

    @ObservationIgnored private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    @ObservationIgnored private var engine: AVAudioEngine?
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?
    @ObservationIgnored private var sessionActive = false
    /// Bumped on every teardown so late callbacks from an old recognition task are ignored.
    @ObservationIgnored private var generation = 0

    /// Audio-session calls block, so they run off the main thread, on one serial queue so a
    /// deactivate from the last session can never land after the next session's activate.
    nonisolated private static let sessionQueue = DispatchQueue(label: "com.payd.voice.audio-session")
    nonisolated private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "voice")

    private struct VoiceError: Error {
        let failure: Failure
    }

    func start() async {
        guard status != .starting, status != .listening else { return }
        status = .starting
        transcript = ""
        do {
            let recognizer = try await checkPermissionsAndAvailability()
            try await Self.activateSession()
            sessionActive = true
            // The card may have closed, or Stop been tapped, while we were waiting
            try Task.checkCancellation()
            guard status == .starting else { return teardown() }
            try begin(with: recognizer)
            status = .listening
        } catch is CancellationError {
            teardown()
            status = .idle
        } catch let error as VoiceError {
            teardown()
            status = .failed(error.failure)
        } catch {
            Self.logger.error("Couldn't start listening: \(error.localizedDescription, privacy: .public)")
            teardown()
            status = .failed(.audioCapture)
        }
    }

    /// Stops listening; the latest partial result is kept as the transcript (web `recognition.stop()`).
    func stop() {
        switch status {
        case .starting:
            status = .idle // start() sees this after its await and tears down
        case .listening:
            request?.endAudio()
            teardown()
            status = .finished
        default:
            break
        }
    }

    /// Cancels listening and drops the transcript (web `recognition.abort()`, whose "aborted" error is ignored).
    func abort() {
        switch status {
        case .starting:
            status = .idle
        case .listening:
            teardown()
            status = .idle
        default:
            break
        }
    }

    // MARK: - Private

    private func checkPermissionsAndAvailability() async throws -> SFSpeechRecognizer {
        guard await Self.speechAuthorized() else { throw VoiceError(failure: .notAllowed) }
        guard await AVAudioApplication.requestRecordPermission() else { throw VoiceError(failure: .notAllowed) }
        guard let recognizer, recognizer.isAvailable else {
            // Server-based recognition needs the network; the on-device model doesn't.
            throw VoiceError(failure: recognizer?.supportsOnDeviceRecognition == false ? .network : .unavailable)
        }
        return recognizer
    }

    private func begin(with recognizer: SFSpeechRecognizer) throws {
        let engine = AVAudioEngine()
        let format = engine.inputNode.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            // No input device (on the Simulator, pick one under I/O › Audio Input)
            throw VoiceError(failure: .audioCapture)
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        // Offline and private when the device has the on-device model
        request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition

        Self.installTap(on: engine.inputNode, format: format, feeding: request)
        engine.prepare()
        do {
            try engine.start()
        } catch {
            Self.logger.error("Audio engine failed to start: \(error.localizedDescription, privacy: .public)")
            throw VoiceError(failure: .audioCapture)
        }

        self.engine = engine
        self.request = request
        let current = generation
        task = Self.recognize(request, with: recognizer) { [weak self] text, error, isFinal in
            Task { @MainActor in
                self?.handle(text: text, error: error, isFinal: isFinal, generation: current)
            }
        }
    }

    private func handle(text: String?, error: RecognitionError?, isFinal: Bool, generation: Int) {
        guard generation == self.generation, status == .listening else { return }
        if let text, !text.isEmpty { transcript = text }
        guard error != nil || isFinal else { return }

        teardown()
        if let error, transcript.isEmpty {
            Self.logger.error("Recognition failed (\(error.domain, privacy: .public) \(error.code)): \(error.message, privacy: .public)")
            if error.code == 1110 { // no speech detected
                status = .failed(.noSpeech)
            } else if error.domain == NSURLErrorDomain || error.code == 203 { // server recognition lost the network
                status = .failed(.network)
            } else { // e.g. 300: missing speech assets, typical on the Simulator
                status = .failed(.unavailable)
            }
        } else {
            status = .finished
        }
    }

    /// Stops the engine and recognition task but keeps the audio session.
    private func stopRecognition() {
        generation += 1
        task?.cancel()
        engine?.stop()
        engine?.inputNode.removeTap(onBus: 0)
        engine = nil
        request = nil
        task = nil
    }

    private func teardown() {
        stopRecognition()
        if sessionActive {
            sessionActive = false
            Self.sessionQueue.async { Self.deactivateSession() }
        }
    }

    // Everything below runs off the main actor: the audio tap and recognition callbacks
    // fire on background threads and only hand plain values back.

    private struct RecognitionError: Sendable {
        let domain: String
        let code: Int
        let message: String
    }

    nonisolated private static func activateSession() async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            sessionQueue.async {
                do {
                    let session = AVAudioSession.sharedInstance()
                    try session.setCategory(.record, mode: .measurement, options: .duckOthers)
                    try session.setActive(true, options: .notifyOthersOnDeactivation)
                    continuation.resume()
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    nonisolated private static func deactivateSession() {
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            logger.error("Audio session deactivation failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    nonisolated private static func installTap(on input: AVAudioInputNode, format: AVAudioFormat,
                                               feeding request: SFSpeechAudioBufferRecognitionRequest) {
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }
    }

    nonisolated private static func recognize(
        _ request: SFSpeechAudioBufferRecognitionRequest, with recognizer: SFSpeechRecognizer,
        onUpdate: @escaping @Sendable (String?, RecognitionError?, Bool) -> Void
    ) -> SFSpeechRecognitionTask {
        recognizer.recognitionTask(with: request) { result, error in
            let nsError = error as NSError?
            onUpdate(result?.bestTranscription.formattedString,
                     nsError.map { RecognitionError(domain: $0.domain, code: $0.code, message: $0.localizedDescription) },
                     result?.isFinal ?? false)
        }
    }

    nonisolated private static func speechAuthorized() async -> Bool {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) }
        }
    }
}
