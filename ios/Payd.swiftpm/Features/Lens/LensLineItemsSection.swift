import PaydCore
import SwiftUI

/// Itemized mode of ReceiptScannerModal.tsx (852-995): line items with "Claimed by" chips, editing,
/// "Add Item", "Split All Equally", "All to Payer" and the VAT note.
struct LensLineItemsSection: View {
    @Binding var session: LensSession
    let receipt: ReceiptScanResult
    let users: [User]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ViewThatFits(in: .horizontal) {
                HStack {
                    title
                    Spacer(minLength: 8)
                    tools
                }
                VStack(alignment: .leading, spacing: 8) {
                    title
                    tools
                }
            }
            if !receipt.lineItems.isEmpty {
                VStack(spacing: 0) {
                    ForEach(receipt.lineItems.indices, id: \.self) { index in
                        if index > 0 { Rectangle().fill(LensColors.slate800).frame(height: 1) }
                        row(index, item: receipt.lineItems[index])
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(LensColors.slate800))
            }
            Text("5% UAE VAT & unlisted tips are auto-distributed proportionally to individual item totals.")
                .font(.payd(size: 11))
                .foregroundStyle(PaydTheme.slate500)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
                .background(PaydTheme.slate850.opacity(0.7), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(LensColors.slate800))
        }
    }

    private var title: some View {
        Text("Line Items (\(receipt.lineItems.count))")
            .font(.payd(size: 12, bold: true))
            .textCase(.uppercase)
            .tracking(0.6)
            .foregroundStyle(PaydTheme.slate400)
            .lineLimit(1)
    }

    private var tools: some View {
        HStack(spacing: 6) {
            if session.isEditingReceipt {
                Button {
                    session = session.addingItem()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus").font(.system(size: 10, weight: .bold))
                        Text("Add Item")
                    }
                    .font(.payd(size: 11, bold: true))
                    .foregroundStyle(PaydTheme.emerald600)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(PaydTheme.emerald500.opacity(0.1), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(PressScaleButtonStyle())
            }
            toolButton("Split All Equally") { session = session.assigningAllToEveryone() }
            toolButton("All to Payer") { session = session.assigningAllToPayer() }
        }
    }

    private func toolButton(_ text: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text)
                .font(.payd(size: 11))
                .lineLimit(1)
                .foregroundStyle(PaydTheme.slate300)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(LensColors.slate800, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle())
    }

    private func row(_ index: Int, item: ReceiptItem) -> some View {
        let assigned = session.itemAssignments[index] ?? []
        return VStack(alignment: .leading, spacing: 10) {
            if session.isEditingReceipt {
                editRow(index, item: item)
            } else {
                summary(item, assigned: assigned)
                claimedBy(index, assigned: assigned)
            }
        }
        .font(.payd(size: 12))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(LensColors.slate900)
    }

    private func editRow(_ index: Int, item: ReceiptItem) -> some View {
        HStack(spacing: 8) {
            LensTextInput(placeholder: "", text: Binding(get: { item.name },
                                                         set: { session = session.withItemName(index, $0) }))
            HStack(spacing: 4) {
                Text("AED")
                    .font(.payd(size: 11))
                    .foregroundStyle(PaydTheme.slate400)
                LensMoneyInput(minor: item.priceMinor, onChange: { session = session.withItemPrice(index, $0) },
                               accessibilityLabel: "\(item.name) price")
                    .frame(width: 64)
            }
            Button {
                session = session.deletingItem(index)
            } label: {
                Image(systemName: "trash")
                    .font(.system(size: 13))
                    .foregroundStyle(PaydTheme.rose400)
                    .padding(4)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleButtonStyle())
            .accessibilityLabel("Delete Item")
        }
    }

    private func summary(_ item: ReceiptItem, assigned: [String]) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
                Text("\(item.quantity > 1 ? "\(item.quantity)x " : "")\(item.name)")
                    .font(.payd(size: 12, bold: true))
                    .foregroundStyle(PaydTheme.slate200)
                if assigned.count > 1 {
                    let each = PaydMath.roundedDiv(item.priceMinor, assigned.count)
                    Text("¹/\(assigned.count) (\(Currency.format(each, currency: "AED")) each)")
                        .font(.payd(size: 10, bold: true))
                        .foregroundStyle(PaydTheme.emerald400)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(PaydTheme.emerald500.opacity(0.1), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
            }
            Text("Subtotal: \(Currency.format(item.priceMinor, currency: "AED"))")
                .font(.payd(size: 11))
                .foregroundStyle(PaydTheme.slate400)
        }
    }

    private func claimedBy(_ index: Int, assigned: [String]) -> some View {
        LensFlowLayout(spacing: 6) {
            Text("Claimed by:")
                .font(.payd(size: 10))
                .foregroundStyle(PaydTheme.slate400)
            ForEach(session.selectedUserIds, id: \.self) { uid in
                if let user = users.first(where: { $0.id == uid }) {
                    let isAssigned = assigned.contains(uid)
                    Button {
                        session = session.togglingItemUser(index, uid)
                    } label: {
                        HStack(spacing: 4) {
                            if isAssigned { Image(systemName: "checkmark").font(.system(size: 10, weight: .heavy)) }
                            Text(user.name).lineLimit(1)
                        }
                        .font(.payd(size: 11, bold: isAssigned))
                        .foregroundStyle(isAssigned ? .white : PaydTheme.slate500)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(isAssigned ? PaydTheme.emerald600 : LensColors.slate800,
                                    in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    .buttonStyle(PressScaleButtonStyle())
                    .accessibilityAddTraits(isAssigned ? .isSelected : [])
                }
            }
        }
    }
}
