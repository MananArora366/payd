import AVFoundation
import SwiftUI
import UIKit

/// Port of web/src/components/modals/LensCameraViewer.tsx: 4:3 dashed viewfinder, camera picker and switch,
/// "Capture Receipt" and "Upload Photo".
struct LensCameraViewer: View {
    let onCapture: (LensImage) -> Void
    let onUploadClick: () -> Void

    @State private var camera = LensCameraController()

    var body: some View {
        VStack(spacing: 12) {
            viewfinder
            HStack(spacing: 12) {
                if isLive {
                    Button {
                        camera.capture(onCapture)
                    } label: {
                        Label("Capture Receipt", systemImage: "camera")
                    }
                    .buttonStyle(LensBlockButtonStyle(fill: PaydTheme.emerald600, text: .white))
                }
                Button {
                    camera.reset()
                    onUploadClick()
                } label: {
                    Label("Upload Photo", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(LensBlockButtonStyle(fill: LensColors.slate800, text: PaydTheme.slate300))
            }
        }
        .onDisappear { camera.reset() }
    }

    private var isLive: Bool { camera.state == .live }

    private var viewfinder: some View {
        ZStack {
            LensColors.slate900
            if isLive {
                LensPreviewLayerView(session: camera.session, mirrored: camera.mirrored)
                liveFrame
                if camera.devices.count > 1 { cameraPicker }
            } else if camera.state == .error {
                errorContent
            } else {
                openButton
            }
        }
        .aspectRatio(4 / 3, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .strokeBorder(PaydTheme.slate700, style: StrokeStyle(lineWidth: 2, dash: [6, 4])))
    }

    /// `absolute inset-6 border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]`.
    private var liveFrame: some View {
        GeometryReader { proxy in
            let inner = CGRect(origin: .zero, size: proxy.size).insetBy(dx: 24, dy: 24)
            ZStack {
                Path { path in
                    path.addRect(CGRect(origin: .zero, size: proxy.size))
                    path.addRoundedRect(in: inner, cornerSize: CGSize(width: 16, height: 16), style: .continuous)
                }
                .fill(Color.black.opacity(0.25), style: FillStyle(eoFill: true))
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(PaydTheme.emerald400.opacity(0.8), lineWidth: 2)
                    .frame(width: inner.width, height: inner.height)
                    .position(x: inner.midX, y: inner.midY)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private var cameraPicker: some View {
        VStack {
            HStack(spacing: 8) {
                Menu {
                    Picker("Camera", selection: Binding(
                        get: { camera.deviceId ?? "" },
                        set: { id in Task { await camera.start(id) } }
                    )) {
                        ForEach(camera.devices) { option in
                            Text(option.label).tag(option.id)
                        }
                    }
                } label: {
                    Text(camera.devices.first { $0.id == camera.deviceId }?.label ?? "")
                        .font(.payd(size: 12))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.black.opacity(0.6), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .accessibilityLabel("Camera")
                Button {
                    Task { await camera.switchToNext() }
                } label: {
                    Image(systemName: "arrow.triangle.2.circlepath.camera")
                        .font(.system(size: 16))
                        .foregroundStyle(.white)
                        .padding(8)
                        .background(.black.opacity(0.6), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(PressScaleButtonStyle())
                .accessibilityLabel("Switch camera")
            }
            .padding(12)
            Spacer()
        }
    }

    private var errorContent: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.circle")
                .font(.system(size: 32))
                .foregroundStyle(PaydTheme.amber500)
                .accessibilityHidden(true)
            Text(camera.error ?? "")
                .font(.payd(size: 12))
                .foregroundStyle(PaydTheme.slate300)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
            Button {
                Task { await camera.start(camera.deviceId) }
            } label: {
                Label("Try again", systemImage: "arrow.clockwise")
                    .font(.payd(size: 12, bold: true))
                    .foregroundStyle(PaydTheme.emerald400)
            }
            .buttonStyle(PressScaleButtonStyle())
        }
        .padding(24)
    }

    private var openButton: some View {
        let isStarting = camera.state == .starting
        return Button {
            Task { await camera.start(camera.deviceId) }
        } label: {
            VStack(spacing: 12) {
                Image(systemName: "camera")
                    .font(.system(size: 30))
                    .foregroundStyle(PaydTheme.emerald400)
                    .frame(width: 64, height: 64)
                    .background(PaydTheme.emerald950.opacity(0.5),
                                in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                Text(isStarting ? "Starting camera…" : "Open Payd Lens Camera")
                    .font(.payd(size: 14, bold: true))
                    .foregroundStyle(.white)
            }
            .opacity(isStarting ? 0.6 : 1)
        }
        .buttonStyle(PressScaleButtonStyle())
        .disabled(isStarting)
        .padding(24)
    }
}

/// `<video>` element: the session's live preview, mirrored only when `mirrored` (front cameras).
private struct LensPreviewLayerView: UIViewRepresentable {
    let session: AVCaptureSession
    let mirrored: Bool

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ view: PreviewView, context: Context) {
        guard let connection = view.previewLayer.connection else { return }
        if connection.isVideoRotationAngleSupported(90) { connection.videoRotationAngle = 90 }
        if connection.isVideoMirroringSupported {
            connection.automaticallyAdjustsVideoMirroring = false
            connection.isVideoMirrored = mirrored
        }
    }

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }

        var previewLayer: AVCaptureVideoPreviewLayer {
            // layerClass guarantees the type; fall back to a detached layer rather than crash.
            layer as? AVCaptureVideoPreviewLayer ?? AVCaptureVideoPreviewLayer()
        }
    }
}
