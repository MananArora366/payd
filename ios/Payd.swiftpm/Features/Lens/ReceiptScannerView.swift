import PaydCore
import PhotosUI
import SwiftUI

/// Port of web/src/components/modals/ReceiptScannerModal.tsx (Payd Lens): capture or upload a receipt, check its
/// orientation, scan it (server or on-device Vision OCR), split it equally or item by item and save it.
struct ReceiptScannerView: View {
    init() {}

    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router
    @Environment(AppSettings.self) private var settings

    @State private var session: LensSession?
    @State private var isPickingPhoto = false
    @State private var pickedItem: PhotosPickerItem?
    @State private var scanTask: Task<Void, Never>?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                LensHeader(onClose: close)
                if let session {
                    content(session)
                }
            }
            .padding(24)
        }
        .scrollDismissesKeyboard(.interactively)
        .foregroundStyle(.white)
        .onAppear {
            if session == nil { session = LensSession.fresh(state: store.state) }
        }
        .onDisappear { scanTask?.cancel() }
        .photosPicker(isPresented: $isPickingPhoto, selection: $pickedItem, matching: .images)
        .onChange(of: pickedItem) { _, item in
            guard let item else { return }
            pickedItem = nil
            Task { await loadPicked(item) }
        }
    }

    @ViewBuilder
    private func content(_ s: LensSession) -> some View {
        if let error = s.error {
            LensErrorBanner(message: error, showsActions: s.scanFailed && s.receipt == nil,
                            onTryAnother: { update { $0.tryingAnotherPhoto() } },
                            onManual: startManualEntry)
                .padding(.top, 16)
        }
        if s.receipt == nil && !s.isScanning && !s.isReadyToScan {
            captureStage.padding(.top, 24)
        }
        if s.isReadyToScan, let image = s.image, !s.isScanning {
            LensOrientationStage(image: image.preview, onRotate: rotate, onRetake: { update { $0.retaking() } },
                                 onScan: scan)
                .padding(.top, 24)
        }
        if s.isScanning {
            LensScanningStage().padding(.top, 32)
        }
        if s.receipt != nil && !s.isScanning {
            LensReceiptStage(session: Binding(get: { session ?? s }, set: { session = $0 }), state: store.state,
                             onScanAnother: { update { $0.scanningAnother() } }, onSave: save)
                .padding(.top, 24)
        }
    }

    /// State 1: camera, upload and manual entry.
    private var captureStage: some View {
        VStack(spacing: 12) {
            LensCameraViewer(onCapture: { image in update { $0.staging(image) } },
                             onUploadClick: { isPickingPhoto = true })
            Text("Point at any UAE restaurant or grocery bill. Payd Lens extracts merchant, TRN, line items, and 5% VAT.")
                .font(.payd(size: 12))
                .foregroundStyle(PaydTheme.slate400)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 384)
                .frame(maxWidth: .infinity)
            Button("No photo? Enter the bill manually", action: startManualEntry)
                .font(.payd(size: 12, bold: true))
                .foregroundStyle(PaydTheme.emerald500)
                .buttonStyle(PressScaleButtonStyle())
                .frame(maxWidth: .infinity)
        }
    }

    // MARK: - Actions

    private func update(_ transform: (LensSession) -> LensSession) {
        guard let session else { return }
        self.session = transform(session)
    }

    private func close() {
        scanTask?.cancel()
        router.dismissSheet()
    }

    private func startManualEntry() {
        update { $0.startingManualEntry(now: Date()) }
    }

    /// handleFileChange: images only, 8 MB cap, unreadable files reported.
    private func loadPicked(_ item: PhotosPickerItem) async {
        update { $0.clearingError() }
        let contentType = item.supportedContentTypes.first
        guard ReceiptImageCoder.isImage(contentType) else {
            update { $0.showingError("Please choose a photo of the receipt (JPEG, PNG, WebP or HEIC).") }
            return
        }
        let data: Data?
        do {
            data = try await item.loadTransferable(type: Data.self)
        } catch {
            data = nil
        }
        guard let data else {
            update { $0.showingError("Couldn't read that file. Please try another photo.") }
            return
        }
        guard data.count <= LensSession.maxUploadBytes else {
            update { $0.showingError("That photo is too large. Please use one under 8 MB.") }
            return
        }
        guard let image = ReceiptImageCoder.uploaded(data, contentType: contentType) else {
            update { $0.showingError("Couldn't read that file. Please try another photo.") }
            return
        }
        update { $0.staging(image) }
    }

    private func rotate(_ degrees: Int) {
        guard let image = session?.image, let rotated = ReceiptImageCoder.rotated(image, degrees: degrees) else { return }
        update { $0.replacingImage(rotated) }
    }

    /// executeReceiptScan.
    private func scan() {
        guard let image = session?.image else { return }
        update { $0.startingScan() }
        let api = settings.api
        let aiEnabled = settings.aiEnabled
        scanTask = Task {
            let result = await ReceiptScanService.scan(image, api: api, aiEnabled: aiEnabled)
            guard !Task.isCancelled else { return }
            switch result {
            case let .success(receipt): update { $0.finishingScan(receipt) }
            case let .failure(failure): update { $0.failingScan(failure.message) }
            }
        }
    }

    /// handleSaveToLedger.
    private func save() {
        guard let session, let input = session.saveInput(categories: store.state.categories) else { return }
        do {
            try store.addTransaction(input)
            self.session = session.saved()
            close()
        } catch {
            self.session = session.savingFailed(LensSession.friendlySaveError(error))
        }
    }
}

/// Header: zinc-700 camera tile, "Payd Lens" + "UAE OCR • 5% VAT" badge, subtitle, close.
private struct LensHeader: View {
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "camera")
                    .font(.system(size: 18))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(PaydTheme.zinc700, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text("Payd Lens")
                            .font(.paydHeading(size: 18))
                            .foregroundStyle(.white)
                            .accessibilityAddTraits(.isHeader)
                        Text("UAE OCR • 5% VAT")
                            .font(.paydHeading(size: 10))
                            .textCase(.uppercase)
                            .lineLimit(1)
                            .foregroundStyle(PaydTheme.brand300)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(PaydTheme.brand500.opacity(0.2), in: Capsule())
                            .overlay(Capsule().strokeBorder(PaydTheme.brand500.opacity(0.3)))
                    }
                    Text("Snap a receipt and split it item by item")
                        .font(.payd(size: 12))
                        .foregroundStyle(PaydTheme.zinc400)
                }
                Spacer(minLength: 8)
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 18))
                        .foregroundStyle(PaydTheme.zinc400)
                        .frame(width: 36, height: 36)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close Payd Lens")
            }
            .padding(.bottom, 16)
            Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1)
        }
    }
}

/// `role="alert"` error box with the scan-failed actions.
private struct LensErrorBanner: View {
    let message: String
    let showsActions: Bool
    let onTryAnother: () -> Void
    let onManual: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.circle")
                    .font(.system(size: 14))
                    .accessibilityHidden(true)
                Text(message)
                    .font(.payd(size: 12))
                    .fixedSize(horizontal: false, vertical: true)
            }
            if showsActions {
                HStack(spacing: 8) {
                    actionButton("Try another photo", fill: Color.white.opacity(0.1), color: PaydTheme.zinc200,
                                 action: onTryAnother)
                    actionButton("Enter manually", fill: PaydTheme.emerald500.opacity(0.15), color: PaydTheme.emerald400,
                                 action: onManual)
                }
                .padding(.leading, 24)
            }
        }
        .foregroundStyle(PaydTheme.rose400)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(PaydTheme.rose500.opacity(0.1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(PaydTheme.rose500.opacity(0.2)))
        .accessibilityElement(children: .contain)
    }

    private func actionButton(_ title: String, fill: Color, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.payd(size: 12, bold: true))
                .foregroundStyle(color)
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(fill, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle())
    }
}

/// State 1.5: orientation check with rotate ±90°.
private struct LensOrientationStage: View {
    let image: UIImage
    let onRotate: (Int) -> Void
    let onRetake: () -> Void
    let onScan: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            ZStack(alignment: .topTrailing) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 320)
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel("Receipt Preview")
                HStack(spacing: 6) {
                    rotateButton(-90, systemName: "arrow.counterclockwise", label: "Rotate Left 90°")
                    Text("Rotate")
                        .font(.payd(size: 10))
                        .foregroundStyle(PaydTheme.slate300)
                    rotateButton(90, systemName: "arrow.clockwise", label: "Rotate Right 90°")
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(PaydTheme.slate900.opacity(0.8), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.white.opacity(0.1)))
                .padding(8)
            }
            .frame(maxWidth: .infinity, maxHeight: 320)
            .background(LensColors.slate950)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(PaydTheme.slate700))

            Text("Is the receipt upright? Use the rotate buttons above if taken sideways or upside-down.")
                .font(.payd(size: 12))
                .foregroundStyle(PaydTheme.slate400)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)

            LensWeightedRow(weights: [1, 2], spacing: 12) {
                Button("Retake", action: onRetake)
                    .buttonStyle(LensBlockButtonStyle(fill: LensColors.slate800, text: PaydTheme.slate300))
                Button(action: onScan) {
                    Label("Scan receipt", systemImage: "text.viewfinder")
                }
                .buttonStyle(LensBlockButtonStyle(fill: PaydTheme.emerald600, text: .white))
            }
        }
    }

    private func rotateButton(_ degrees: Int, systemName: String, label: String) -> some View {
        Button {
            onRotate(degrees)
        } label: {
            Image(systemName: systemName)
                .font(.system(size: 14))
                .foregroundStyle(.white)
                .padding(6)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle())
        .accessibilityLabel(label)
    }
}

/// State 2: pinging receipt tile.
private struct LensScanningStage: View {
    @State private var animate = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 16) {
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(PaydTheme.emerald500.opacity(0.2))
                    .scaleEffect(animate ? 2 : 1)
                    .opacity(animate ? 0 : 1)
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(PaydTheme.emerald500)
                Image(systemName: "receipt")
                    .font(.system(size: 36))
                    .foregroundStyle(.white)
                    .opacity(animate ? 0.5 : 1)
            }
            .frame(width: 80, height: 80)
            .accessibilityHidden(true)
            VStack(spacing: 4) {
                Text("Payd Lens Scanning Receipt...")
                    .font(.payd(size: 16, bold: true))
                Text("Reading line items, merchant TRN, and verifying UAE 5% VAT calculations.")
                    .font(.payd(size: 12))
                    .foregroundStyle(PaydTheme.slate400)
            }
            .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeOut(duration: 1).repeatForever(autoreverses: false)) { animate = true }
        }
    }
}
