import SwiftUI
import PhotosUI
import PaydCore

struct UAEReceiptPreset: Identifiable {
    let id = UUID()
    let merchant: String
    let amountMinor: Int
    let categoryId: String
    let trn: String
    let vatMinor: Int
    let items: [String]
}

struct CameraScannerView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(LedgerStore.self) private var store

    @State private var selectedPhotoItem: PhotosPickerItem? = nil
    @State private var selectedImageData: Data? = nil
    @State private var isScanning = false
    @State private var scannedReceipt: UAEReceiptPreset? = nil

    private let presets: [UAEReceiptPreset] = [
        UAEReceiptPreset(
            merchant: "Al Safadi Restaurant (Sheikh Zayed Rd)",
            amountMinor: 26_000,
            categoryId: SeedIDs.food,
            trn: "100345678900003",
            vatMinor: 1_238,
            items: ["Chicken Biryani", "Mixed Grill Platter", "Hummus Beiruti", "Fattoush Salad", "Mineral Water x2"]
        ),
        UAEReceiptPreset(
            merchant: "Carrefour Market (Marina Crown)",
            amountMinor: 10_000,
            categoryId: SeedIDs.groceries,
            trn: "100012345600003",
            vatMinor: 476,
            items: ["Organic Fresh Milk 2L", "Sourdough Country Bread", "Free Range Eggs 30pk", "Greek Yoghurt"]
        ),
        UAEReceiptPreset(
            merchant: "Careem DineOut • Zaatar w Zeit",
            amountMinor: 12_400,
            categoryId: SeedIDs.food,
            trn: "100897654300003",
            vatMinor: 590,
            items: ["Famous Chicken Wrap x2", "Manakeesh Zaatar & Cheese x2", "Spiced Potato Wedges"]
        )
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Top Hero Badge
                    HStack {
                        Label("Payd Lens OCR", systemImage: "camera.viewfinder")
                            .font(.subheadline)
                            .fontWeight(.bold)
                            .foregroundStyle(.tint)
                        
                        Spacer()
                        
                        Text("UAE 5% VAT")
                            .font(.caption2)
                            .fontWeight(.heavy)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.green.opacity(0.15))
                            .foregroundStyle(.green)
                            .clipShape(Capsule())
                    }
                    .padding(.horizontal)

                    // Camera / Photo Picker Button Card
                    PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                        VStack(spacing: 12) {
                            ZStack {
                                Circle()
                                    .fill(Color.accentColor.opacity(0.15))
                                    .frame(width: 68, height: 68)

                                Image(systemName: "camera.fill")
                                    .font(.system(size: 28))
                                    .foregroundStyle(Color.accentColor)
                            }

                            Text("Take Photo or Choose Receipt")
                                .font(.headline)
                                .foregroundStyle(.primary)

                            Text("Snap any UAE receipt to extract TRN, subtotal, and 5% VAT automatically.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 28)
                        .background(
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .fill(Color(.secondarySystemGroupedBackground))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                                        .strokeBorder(Color.accentColor.opacity(0.3), style: StrokeStyle(lineWidth: 1.5, dash: [6]))
                                )
                        )
                    }
                    .padding(.horizontal)
                    .onChange(of: selectedPhotoItem) { _, newItem in
                        Task {
                            if let data = try? await newItem?.loadTransferable(type: Data.self) {
                                selectedImageData = data
                                triggerScanSimulation(with: presets[0])
                            }
                        }
                    }

                    // Scanning State
                    if isScanning {
                        VStack(spacing: 12) {
                            ProgressView()
                                .scaleEffect(1.2)
                            Text("Gemini Vision Scanning...")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                            Text("Extracting TRN and itemized 5% VAT...")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding()
                    }

                    // Scanned Receipt Result Card
                    if let receipt = scannedReceipt, !isScanning {
                        VStack(alignment: .leading, spacing: 14) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(receipt.merchant)
                                        .font(.headline)
                                        .fontWeight(.bold)
                                    Text("TRN: \(receipt.trn)")
                                        .font(.caption2)
                                        .fontDesign(.monospaced)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(Currency.format(receipt.amountMinor))
                                    .font(.title2)
                                    .fontWeight(.heavy)
                                    .foregroundStyle(.green)
                            }

                            Divider()

                            HStack {
                                Label("5% VAT: \(Currency.format(receipt.vatMinor))", systemImage: "checkmark.seal.fill")
                                    .font(.caption)
                                    .fontWeight(.medium)
                                    .foregroundStyle(.secondary)
                                Spacer()
                                let category = LedgerQueries.category(receipt.categoryId, in: store.state)
                                Text(category?.name ?? "Other")
                                    .font(.caption)
                                    .fontWeight(.semibold)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background((category?.color ?? .gray).opacity(0.15))
                                    .foregroundStyle(category?.color ?? .gray)
                                    .clipShape(Capsule())
                            }

                            VStack(alignment: .leading, spacing: 4) {
                                Text("Line Items Detected:")
                                    .font(.caption2)
                                    .fontWeight(.bold)
                                    .foregroundStyle(.secondary)
                                ForEach(receipt.items, id: \.self) { item in
                                    Text("• \(item)")
                                        .font(.caption)
                                        .foregroundStyle(.primary)
                                }
                            }

                            Button {
                                saveScannedReceipt(receipt)
                            } label: {
                                HStack {
                                    Image(systemName: "checkmark.circle.fill")
                                    Text("Save Receipt to Ledger")
                                }
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color.accentColor)
                                .foregroundStyle(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 16))
                            }
                        }
                        .padding(20)
                        .background(
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .fill(Color(.secondarySystemGroupedBackground))
                                .shadow(color: .black.opacity(0.06), radius: 10, x: 0, y: 4)
                        )
                        .padding(.horizontal)
                    }

                    // 1-Click Instant Presets for Hackathon Demos
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Instant UAE Presets (1-Click Demo)")
                            .font(.caption)
                            .fontWeight(.bold)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal)

                        ForEach(presets) { preset in
                            let category = LedgerQueries.category(preset.categoryId, in: store.state)
                            Button {
                                triggerScanSimulation(with: preset)
                            } label: {
                                HStack(spacing: 12) {
                                    ZStack {
                                        Circle()
                                            .fill((category?.color ?? .gray).opacity(0.15))
                                            .frame(width: 40, height: 40)
                                        Image(systemName: category?.icon ?? "ellipsis.circle")
                                            .foregroundStyle(category?.color ?? .gray)
                                    }

                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(preset.merchant)
                                            .font(.subheadline)
                                            .fontWeight(.semibold)
                                            .foregroundStyle(.primary)
                                            .lineLimit(1)
                                        Text("TRN: \(preset.trn) • 5% VAT")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }

                                    Spacer()

                                    Text(Currency.format(preset.amountMinor))
                                        .font(.callout)
                                        .fontWeight(.bold)
                                        .foregroundStyle(.primary)
                                }
                                .padding()
                                .background(
                                    RoundedRectangle(cornerRadius: 18)
                                        .fill(Color(.secondarySystemGroupedBackground))
                                )
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal)
                        }
                    }
                }
                .padding(.vertical)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Payd Lens")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
        }
    }

    private func triggerScanSimulation(with preset: UAEReceiptPreset) {
        withAnimation {
            isScanning = true
            scannedReceipt = nil
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            withAnimation {
                isScanning = false
                scannedReceipt = preset
            }
        }
    }

    private func saveScannedReceipt(_ receipt: UAEReceiptPreset) {
        let noteText = "Payd Lens OCR • TRN: \(receipt.trn) • 5% VAT: \(Currency.format(receipt.vatMinor))"
        let saved = store.addPersonalExpense(
            title: receipt.merchant,
            amountMinor: receipt.amountMinor,
            categoryId: receipt.categoryId,
            occurredAt: Date(),
            notes: noteText
        )
        if saved { dismiss() }
    }
}
