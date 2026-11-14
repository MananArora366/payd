import AVFoundation
import Observation
import OSLog
import Speech

/// Dictation for the dock's mic (the web app uses the browser's Web Speech API).
@Observable
@MainActor
final class SpeechRecognizer {
    enum Status: Equatable {
        case idle, starting, listening, finished
        case failed(String)
    }

    private(set) var transcript = ""
    private(set) var status: Status = .idle

    @ObservationIgnored private let recognizer = SFSpeechRecognizer(locale: Locale.current) ?? SFSpeechRecognizer()
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
        let message: String
    }

    func start() async {
        guard status != .starting, status != .listening else { return }
        status = .starting
        transcript = ""
        do {
            let recognizer = try await checkPermissionsAndAvailability()
            try await Self.activateSession()
            sessionActive = true
            // The sheet may have closed, or Stop been tapped, while we were waiting
            try Task.checkCancellation()
            guard status == .starting else { return teardown() }
            try begin(with: recognizer)
            status = .listening
        } catch is CancellationError {
            teardown()
            status = .idle
        } catch let error as VoiceError {
            teardown()
            status = .failed(error.message)
        } catch {
            teardown()
            status = .failed("Couldn't start listening: \(error.localizedDescription)")
        }
    }

    /// Stops listening; the latest partial result is kept as the transcript.
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

    // MARK: - Private

    private func checkPermissionsAndAvailability() async throws -> SFSpeechRecognizer {
        guard await Self.speechAuthorized() else {
            throw VoiceError(message: "Speech recognition is off for Payd. Turn it on in Settings › Privacy › Speech Recognition.")
        }
        guard await AVAudioApplication.requestRecordPermission() else {
            throw VoiceError(message: "Microphone access is off for Payd. Turn it on in Settings › Privacy › Microphone.")
        }
        guard let recognizer, recognizer.isAvailable else {
            throw VoiceError(message: "Speech recognition isn't available right now. Type the expense instead.")
        }
        return recognizer
    }

    private func begin(with recognizer: SFSpeechRecognizer) throws {
        let engine = AVAudioEngine()
        let format = engine.inputNode.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            throw VoiceError(message: "No microphone input found. On the Simulator, pick one under I/O › Audio Input.")
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        // Offline and private when the device has the on-device model
        request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition

        Self.installTap(on: engine.inputNode, format: format, feeding: request)
        engine.prepare()
        try engine.start()

        self.engine = engine
        self.request = request
        let current = generation
        task = Self.recognize(request, with: recognizer) { [weak self] text, error, isFinal in
            Task { @MainActor in
                self?.handle(text: text, error: error, isFinal: isFinal, generation: current)
            }
        }
    }

    private func handle(text: String?, error: (code: Int, message: String)?, isFinal: Bool, generation: Int) {
        guard generation == self.generation, status == .listening else { return }
        if let text, !text.isEmpty { transcript = text }
        guard error != nil || isFinal else { return }

        teardown()
        if let error, transcript.isEmpty {
            Self.logger.error("Recognition failed (\(error.code)): \(error.message, privacy: .public)")
            switch error.code {
            case 1110: // no speech detected
                status = .failed("Didn't hear anything. Tap the mic and try again.")
            case 300: // recognizer couldn't start: missing speech assets, typical on the Simulator
                status = .failed("Speech recognition isn't working on this device right now.")
            default:
                status = .failed("Couldn't recognise that: \(error.message)")
            }
        } else {
            status = .finished
        }
    }

    /// Stops the engine and recognition task but keeps the audio session (used for the retry).
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
        onUpdate: @escaping @Sendable (String?, (code: Int, message: String)?, Bool) -> Void
    ) -> SFSpeechRecognitionTask {
        recognizer.recognitionTask(with: request) { result, error in
            let nsError = error as NSError?
            onUpdate(result?.bestTranscription.formattedString,
                     nsError.map { ($0.code, $0.localizedDescription) },
                     result?.isFinal ?? false)
        }
    }

    nonisolated private static func speechAuthorized() async -> Bool {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) }
        }
    }
}
