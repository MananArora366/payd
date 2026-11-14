import AVFoundation
import Observation
import OSLog
import PaydCore
import UIKit

/// The camera behind LensCameraViewer.tsx: prefers the back wide camera, lists every camera so the user can
/// switch, times out after 10 s, maps failures to the web's messages, mirrors only the preview of front cameras
/// and never the captured photo.
@Observable
@MainActor
final class LensCameraController {
    enum State: Equatable {
        case idle, starting, live, error
    }

    struct CameraOption: Identifiable, Hashable {
        let id: String
        let label: String
    }

    private(set) var state: State = .idle
    private(set) var error: String?
    private(set) var devices: [CameraOption] = []
    private(set) var deviceId: String?
    private(set) var mirrored = false

    @ObservationIgnored let session = AVCaptureSession()
    @ObservationIgnored private let photoOutput = AVCapturePhotoOutput()
    @ObservationIgnored private var input: AVCaptureDeviceInput?
    /// Bumped on every start/stop; a start that finishes after it was superseded releases the camera.
    @ObservationIgnored private var attempt = 0
    @ObservationIgnored private var captureDelegate: PhotoCaptureDelegate?
    @ObservationIgnored nonisolated(unsafe) private var observers: [NSObjectProtocol] = []

    static let startTimeout: Duration = .seconds(10)

    nonisolated private static let sessionQueue = DispatchQueue(label: "com.payd.lens.camera-session")
    nonisolated private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "lens")

    static let timeoutMessage = "The camera is taking too long to start. Check the permission prompt, or upload a photo instead."
    static let deniedMessage = "Camera permission denied. Allow access or upload a photo instead."
    static let notFoundMessage = "No camera found. Upload a photo instead."
    static let inUseMessage = "Camera is in use by another app (e.g. Zoom or FaceTime). Close it and try again."
    static let genericMessage = "Could not start the camera. Upload a photo instead."

    init() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: AVCaptureSession.wasInterruptedNotification, object: session,
                                            queue: .main) { [weak self] note in
            let raw = note.userInfo?[AVCaptureSessionInterruptionReasonKey] as? Int
            let inUse = raw.flatMap(AVCaptureSession.InterruptionReason.init(rawValue:)) == .videoDeviceInUseByAnotherClient
            MainActor.assumeIsolated { self?.fail(inUse ? Self.inUseMessage : Self.genericMessage) }
        })
        observers.append(center.addObserver(forName: AVCaptureSession.runtimeErrorNotification, object: session,
                                            queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.fail(Self.genericMessage) }
        })
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    // MARK: - Start / stop

    /// startCamera(requestedId): a specific camera, else the back wide camera.
    func start(_ requestedId: String?) async {
        state = .starting
        error = nil
        stop()
        let current = attempt
        let timeout = Task { [weak self] in
            try await Task.sleep(for: Self.startTimeout)
            guard let self, self.attempt == current, self.state == .starting else { return }
            self.attempt += 1 // the late start releases the camera on arrival
            self.fail(Self.timeoutMessage)
        }
        defer { timeout.cancel() }

        guard await Self.requestAccess() else {
            if attempt == current { fail(Self.deniedMessage) }
            return
        }
        guard attempt == current else { return }
        let all = Self.discoverDevices()
        guard let device = all.first(where: { $0.uniqueID == requestedId }) ?? Self.preferredDevice(in: all) else {
            fail(Self.notFoundMessage)
            return
        }
        let newInput: AVCaptureDeviceInput
        do {
            newInput = try AVCaptureDeviceInput(device: device)
        } catch {
            Self.logger.error("Camera input failed: \(error.localizedDescription, privacy: .public)")
            fail(Self.genericMessage)
            return
        }
        guard configure(with: newInput) else {
            fail(Self.genericMessage)
            return
        }
        await Self.run(session, start: true)
        guard attempt == current else {
            await Self.run(session, start: false) // superseded while starting
            return
        }
        guard session.isRunning else {
            fail(Self.genericMessage)
            return
        }
        deviceId = device.uniqueID
        mirrored = LensMirror.shouldMirrorPreview(facingMode: Self.facingMode(device), label: device.localizedName)
        devices = all.enumerated().map { index, d in
            CameraOption(id: d.uniqueID, label: d.localizedName.isEmpty ? "Camera \(index + 1)" : d.localizedName)
        }
        state = .live
    }

    /// stopCamera: releases the camera and invalidates any start in flight.
    func stop() {
        attempt += 1
        guard session.isRunning || input != nil else { return }
        let box = SessionBox(session: session)
        Self.sessionQueue.async { box.session.stopRunning() }
    }

    /// Stop and go back to the idle button (unmount, upload click).
    func reset() {
        stop()
        state = .idle
    }

    /// switchToNext.
    func switchToNext() async {
        guard devices.count >= 2 else { return }
        let index = devices.firstIndex { $0.id == deviceId } ?? -1
        await start(devices[(index + 1) % devices.count].id)
    }

    // MARK: - Capture

    /// Captures the raw (never mirrored) frame as an upright JPEG 0.92, then stops the camera.
    func capture(_ onCapture: @escaping (LensImage) -> Void) {
        guard state == .live, captureDelegate == nil else { return }
        let settings = photoOutput.availablePhotoCodecTypes.contains(.jpeg)
            ? AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
            : AVCapturePhotoSettings()
        if let connection = photoOutput.connection(with: .video) {
            if connection.isVideoMirroringSupported {
                connection.automaticallyAdjustsVideoMirroring = false
                connection.isVideoMirrored = false
            }
            if connection.isVideoRotationAngleSupported(90) { connection.videoRotationAngle = 90 }
        }
        let delegate = PhotoCaptureDelegate { [weak self] data in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.captureDelegate = nil
                guard let data, let photo = UIImage(data: data), let image = ReceiptImageCoder.jpeg(photo) else {
                    self.fail(Self.genericMessage)
                    return
                }
                self.reset()
                onCapture(image)
            }
        }
        captureDelegate = delegate
        photoOutput.capturePhoto(with: settings, delegate: delegate)
    }

    // MARK: - Private

    private func fail(_ message: String) {
        guard state == .starting || state == .live else { return }
        stop()
        state = .error
        error = message
    }

    private func configure(with newInput: AVCaptureDeviceInput) -> Bool {
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        if let input { session.removeInput(input) }
        input = nil
        guard session.canAddInput(newInput) else { return false }
        session.addInput(newInput)
        input = newInput
        if session.canSetSessionPreset(.photo) { session.sessionPreset = .photo }
        if !session.outputs.contains(photoOutput) {
            guard session.canAddOutput(photoOutput) else { return false }
            session.addOutput(photoOutput)
        }
        return true
    }

    private static func run(_ session: AVCaptureSession, start: Bool) async {
        let box = SessionBox(session: session)
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            sessionQueue.async {
                if start { box.session.startRunning() } else { box.session.stopRunning() }
                continuation.resume()
            }
        }
    }

    private static func requestAccess() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: true
        case .notDetermined: await AVCaptureDevice.requestAccess(for: .video)
        default: false
        }
    }

    private static func discoverDevices() -> [AVCaptureDevice] {
        AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .builtInUltraWideCamera, .builtInTelephotoCamera, .external],
            mediaType: .video, position: .unspecified
        ).devices
    }

    /// `facingMode: { ideal: 'environment' }`: the back wide camera, else any camera.
    private static func preferredDevice(in devices: [AVCaptureDevice]) -> AVCaptureDevice? {
        devices.first { $0.position == .back && $0.deviceType == .builtInWideAngleCamera }
            ?? devices.first { $0.position == .back } ?? devices.first
    }

    private static func facingMode(_ device: AVCaptureDevice) -> String? {
        switch device.position {
        case .front: "user"
        case .back: "environment"
        default: nil
        }
    }
}

/// AVCaptureSession is safe to start/stop from its dedicated serial queue (Apple's AVCam pattern); the box carries
/// it across the queue hop.
private struct SessionBox: @unchecked Sendable {
    let session: AVCaptureSession
}

/// Retained by the controller until the photo arrives.
private final class PhotoCaptureDelegate: NSObject, AVCapturePhotoCaptureDelegate {
    private let completion: (Data?) -> Void
    private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "lens")

    init(completion: @escaping (Data?) -> Void) {
        self.completion = completion
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        if let error { Self.logger.error("Capture failed: \(error.localizedDescription, privacy: .public)") }
        let data = error == nil ? photo.fileDataRepresentation() : nil
        DispatchQueue.main.async { self.completion(data) }
    }
}
