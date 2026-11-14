import PaydCore
import SwiftUI

/// State 3 of ReceiptScannerModal.tsx (643-1077): merchant & tax card, payer/group, split strategy,
/// participants, line items, "EACH PERSON PAYS", share row and save.
struct LensReceiptStage: View {
    @Binding var session: LensSession
    let state: LedgerState
    let onScanAnother: () -> Void
    let onSave: () -> Void

    @State private var copyReset: Task<Void, Never>?

    var body: some View {
        if let receipt = session.receipt {
            VStack(alignment: .leading, spacing: 24) {
                merchantCard(receipt)
                strategyRow
                participants
                if session.splitMode == .itemized {
                    LensLineItemsSection(session: $session, receipt: receipt, users: state.users)
                }
                sharesSummary(receipt)
                shareRow
                actions
            }
            .onDisappear { copyReset?.cancel() }
        }
    }

    // MARK: - Merchant & tax card

    private func merchantCard(_ receipt: ReceiptScanResult) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                merchantColumn(receipt)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.trailing, 16)
                totalColumn(receipt)
            }
            if let warnings = receipt.warnings, !warnings.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(warnings.indices, id: \.self) { index in
                        HStack(alignment: .top, spacing: 6) {
                            Image(systemName: "exclamationmark.circle")
                                .font(.system(size: 12))
                                .padding(.top, 1)
                                .accessibilityHidden(true)
                            Text(warnings[index])
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .font(.payd(size: 11))
                .foregroundStyle(PaydTheme.amber400)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
                .background(PaydTheme.amber500.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(PaydTheme.amber500.opacity(0.2)))
            }
            selectors
        }
        .padding(16)
        .background(PaydTheme.slate800.opacity(0.6), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(PaydTheme.slate700))
    }

    @ViewBuilder
    private func merchantColumn(_ receipt: ReceiptScanResult) -> some View {
        if session.isEditingReceipt {
            VStack(alignment: .leading, spacing: 6) {
                fieldCaption("Merchant Name")
                LensTextInput(placeholder: "e.g. Blue Oasis Bistro",
                              text: Binding(get: { session.receipt?.merchantName ?? "" },
                                            set: { session = session.withMerchant($0) }),
                              fontSize: 14, bold: true, fill: LensColors.slate900)
            }
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text(receipt.merchantName)
                    .font(.payd(size: 16, bold: true))
                    .foregroundStyle(.white)
                LensFlowLayout(spacing: 8) {
                    if let trn = receipt.trn, !trn.isEmpty {
                        LensTag(text: "TRN: \(trn)", fill: PaydTheme.slate700, color: PaydTheme.slate300, monospaced: true)
                    }
                    if let date = receipt.date, !date.isEmpty {
                        LensTag(text: date, fill: PaydTheme.slate700, color: PaydTheme.slate300)
                    }
                    if receipt.engine != "manual" {
                        let percent = lensConfidencePercent(receipt.confidence)
                        if let warnings = receipt.warnings, !warnings.isEmpty {
                            LensTag(text: "Needs review • \(percent)% confidence", fill: PaydTheme.amber500.opacity(0.1),
                                    color: PaydTheme.amber400, bold: true)
                        } else {
                            LensTag(text: "Totals reconcile • \(percent)% confidence",
                                    fill: PaydTheme.emerald500.opacity(0.1), color: PaydTheme.emerald400, bold: true)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func totalColumn(_ receipt: ReceiptScanResult) -> some View {
        if session.isEditingReceipt {
            VStack(alignment: .trailing, spacing: 6) {
                fieldCaption("Total AED")
                LensMoneyInput(minor: receipt.totalMinor, onChange: { session = session.withTotal($0) },
                               fontSize: 16, color: PaydTheme.emerald600, fill: LensColors.slate900,
                               accessibilityLabel: "Total AED")
                    .frame(width: 96)
            }
        } else {
            VStack(alignment: .trailing, spacing: 2) {
                Text(Currency.format(receipt.totalMinor, currency: "AED"))
                    .font(.payd(size: 24, bold: true))
                    .foregroundStyle(PaydTheme.emerald400)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(subtotalLine(receipt))
                    .font(.payd(size: 11))
                    .foregroundStyle(PaydTheme.slate400)
                    .multilineTextAlignment(.trailing)
            }
        }
    }

    private func subtotalLine(_ receipt: ReceiptScanResult) -> String {
        var line = "Subtotal: \(Currency.format(receipt.subtotalMinor, currency: "AED")) • VAT: \(Currency.format(receipt.vatMinor, currency: "AED"))"
        if let charges = receipt.chargesMinor, charges != 0 {
            line += " • Charges: \(Currency.format(charges, currency: "AED"))"
        }
        return line
    }

    private func fieldCaption(_ text: String) -> some View {
        Text(text)
            .font(.payd(size: 10, bold: true))
            .textCase(.uppercase)
            .foregroundStyle(PaydTheme.slate400)
    }

    private var selectors: some View {
        let pool = LensSession.participantPool(groupId: session.selectedGroup, state: state)
        let payerOptions = pool.map { (value: $0.id, label: "\($0.name) \($0.id == state.currentUserId ? "(You)" : "")") }
        let groupOptions = [(value: String?.none, label: "Personal (No group)")]
            + state.groups.map { (value: Optional($0.id), label: $0.name) }
        return VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                selectorLabel("Payer (Who paid)")
                LensSelect(selection: Binding(get: { session.payerId }, set: { session = session.withPayer($0) }),
                           options: payerOptions, accessibilityLabel: "Payer (Who paid)")
            }
            VStack(alignment: .leading, spacing: 4) {
                selectorLabel("Group Ledger")
                LensSelect(selection: Binding(get: { session.selectedGroup },
                                              set: { session = session.applyingGroup($0, state: state) }),
                           options: groupOptions, accessibilityLabel: "Group Ledger")
            }
        }
        .padding(.top, 12)
        .overlay(alignment: .top) { Rectangle().fill(PaydTheme.slate700.opacity(0.6)).frame(height: 1) }
    }

    private func selectorLabel(_ text: String) -> some View {
        Text(text)
            .font(.payd(size: 12))
            .foregroundStyle(PaydTheme.slate400)
    }

    // MARK: - Split strategy & participants

    private var strategyRow: some View {
        ViewThatFits(in: .horizontal) {
            HStack {
                strategyTitle
                Spacer(minLength: 8)
                strategyControls
            }
            VStack(alignment: .leading, spacing: 8) {
                strategyTitle
                strategyControls
            }
        }
    }

    private var strategyTitle: some View {
        Text("Split Strategy")
            .font(.payd(size: 12, bold: true))
            .textCase(.uppercase)
            .tracking(0.6)
            .foregroundStyle(PaydTheme.slate400)
            .lineLimit(1)
    }

    private var strategyControls: some View {
        HStack(spacing: 8) {
            Button {
                session = session.togglingEditing()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "square.and.pencil").font(.system(size: 12))
                    Text(session.isEditingReceipt ? "Done Editing" : "Edit Items")
                }
                .font(.payd(size: 12, bold: true))
                .lineLimit(1)
                .foregroundStyle(session.isEditingReceipt ? PaydTheme.emerald600 : PaydTheme.slate500)
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(session.isEditingReceipt ? PaydTheme.emerald950.opacity(0.4) : .clear,
                            in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(session.isEditingReceipt ? PaydTheme.emerald500 : PaydTheme.slate700))
            }
            .buttonStyle(PressScaleButtonStyle())
            HStack(spacing: 0) {
                modeButton("Split Equally", mode: .equal)
                modeButton("Itemized (\"Who Had What?\")", mode: .itemized)
            }
            .padding(4)
            .background(LensColors.slate800, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    private func modeButton(_ title: String, mode: LensSplitMode) -> some View {
        let isSelected = session.splitMode == mode
        return Button {
            session = session.withSplitMode(mode)
        } label: {
            Text(title)
                .font(.payd(size: 12, bold: true))
                .lineLimit(1)
                .foregroundStyle(isSelected ? PaydTheme.emerald400 : PaydTheme.slate500)
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(isSelected ? LensColors.slate900 : .clear,
                            in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .shadow(color: isSelected ? .black.opacity(0.05) : .clear, radius: 1, y: 1)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var participants: some View {
        let pool = LensSession.participantPool(groupId: session.selectedGroup, state: state)
        return VStack(alignment: .leading, spacing: 8) {
            Text("Include Participants (\(session.selectedUserIds.count))")
                .font(.payd(size: 12))
                .foregroundStyle(PaydTheme.slate400)
            LensFlowLayout(spacing: 8) {
                ForEach(pool) { user in
                    participantChip(user, isSelected: session.selectedUserIds.contains(user.id))
                }
            }
        }
    }

    private func participantChip(_ user: User, isSelected: Bool) -> some View {
        Button {
            session = session.togglingUser(user.id)
        } label: {
            HStack(spacing: 6) {
                Circle().frame(width: 6, height: 6)
                Text(user.name).lineLimit(1)
            }
            .font(.payd(size: 12))
            .foregroundStyle(isSelected ? PaydTheme.emerald400 : PaydTheme.slate500)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(isSelected ? PaydTheme.emerald950.opacity(0.4) : LensColors.slate900, in: Capsule())
            .overlay(Capsule().strokeBorder(isSelected ? PaydTheme.emerald500 : LensColors.slate800))
        }
        .buttonStyle(PressScaleButtonStyle())
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    // MARK: - Shares, share row, actions

    private func sharesSummary(_ receipt: ReceiptScanResult) -> some View {
        let shares = Array(session.computedShares)
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.shield")
                        .font(.system(size: 14))
                        .foregroundStyle(PaydTheme.emerald400)
                        .accessibilityHidden(true)
                    Text("EACH PERSON PAYS")
                }
                Spacer(minLength: 8)
                Text("Sum: \(Currency.format(receipt.totalMinor, currency: "AED"))")
            }
            .font(.paydHeading(size: 12))
            .foregroundStyle(PaydTheme.brand300)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                ForEach(shares.indices, id: \.self) { index in
                    let entry = shares[index]
                    VStack(alignment: .leading, spacing: 0) {
                        Text(state.users.first { $0.id == entry.key }.map { $0.name.isEmpty ? "User" : $0.name } ?? "User")
                            .font(.payd(size: 11))
                            .foregroundStyle(PaydTheme.zinc400)
                            .lineLimit(1)
                        Text(Currency.format(entry.value, currency: "AED"))
                            .font(.payd(size: 14, bold: true))
                            .foregroundStyle(.white)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(10)
                    .background(PaydTheme.surface202025, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.white.opacity(0.08)))
                }
            }
            .padding(.top, 4)
        }
        .padding(16)
        .background(PaydTheme.brand950.opacity(0.3), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(PaydTheme.brand500.opacity(0.2)))
    }

    private var shareRow: some View {
        HStack(spacing: 8) {
            Button {
                if let url = ShareActions.whatsAppURL(text: session.breakdownText(users: state.users)) {
                    UIApplication.shared.open(url)
                }
            } label: {
                Label("Share WhatsApp", systemImage: "square.and.arrow.up").labelStyle(LensCompactLabelStyle())
            }
            .buttonStyle(LensBlockButtonStyle(fill: PaydTheme.emerald500.opacity(0.15), text: PaydTheme.emerald400,
                                              cornerRadius: 12, verticalPadding: 10,
                                              stroke: PaydTheme.emerald500.opacity(0.3)))
            Button(action: copySummary) {
                HStack(spacing: 6) {
                    Image(systemName: session.copiedBreakdown ? "checkmark" : "doc.on.doc")
                        .font(.system(size: 13))
                        .foregroundStyle(session.copiedBreakdown ? PaydTheme.emerald400 : PaydTheme.zinc200)
                    Text(session.copiedBreakdown ? "Copied to Clipboard!" : "Copy Summary")
                }
            }
            .buttonStyle(LensBlockButtonStyle(fill: PaydTheme.cardSubtle, text: PaydTheme.zinc200, cornerRadius: 12,
                                              verticalPadding: 10))
        }
    }

    private func copySummary() {
        ShareActions.copy(session.breakdownText(users: state.users))
        session = session.withCopied(true)
        copyReset?.cancel()
        copyReset = Task {
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            session = session.withCopied(false)
        }
    }

    private var actions: some View {
        LensWeightedRow(weights: [1, 2], spacing: 12) {
            Button("Scan Another", action: onScanAnother)
                .buttonStyle(LensBlockButtonStyle(fill: PaydTheme.cardSubtle, text: PaydTheme.zinc200, fontSize: 14))
            Button(action: onSave) {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark").font(.system(size: 14, weight: .heavy))
                    Text(session.isSaved ? "Saved" : session.isSaving ? "Saving…" : "Save Receipt to Ledger")
                }
            }
            .buttonStyle(LensBlockButtonStyle(fill: PaydTheme.brand400, text: PaydTheme.zinc950, fontSize: 14))
            .disabled(!session.canSave)
        }
        .padding(.top, 8)
    }
}

/// Icon + title with the web's `gap-1.5` and `w-3.5 h-3.5` icon.
struct LensCompactLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.icon.font(.system(size: 13))
            configuration.title
        }
    }
}
