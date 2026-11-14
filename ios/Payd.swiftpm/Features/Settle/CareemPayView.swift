import OSLog
import PaydCore
import SwiftUI

/// Receipts for transfers that Careem Pay charged but Payd could not record yet, keyed by settlement
/// (CareemPayModal.tsx:57-62). Process-lifetime so closing/reopening the sheet can never lead to a
/// second charge for the same settlement.
@MainActor
enum CareemPayPendingCharges {
    private static var receipts: [String: CareemPayReceipt] = [:]

    static func receipt(for key: String) -> CareemPayReceipt? { receipts[key] }
    static func set(_ receipt: CareemPayReceipt, for key: String) { receipts[key] = receipt }
    static func remove(_ key: String) { receipts[key] = nil }
}

/// Port of web/src/components/modals/CareemPayModal.tsx ("Settle with Careem Pay").
struct CareemPayView: View {
    let request: CareemPayRequest

    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router
    @Environment(AppSettings.self) private var settings
    @Environment(\.openURL) private var openURL

    @State private var copiedLink = false
    @State private var isProcessing = false
    @State private var isSuccess = false
    @State private var error: String?
    @State private var warning: String?
    @State private var receipt: CareemPayReceipt?
    @State private var inFlight = false
    @State private var closeTimer: Task<Void, Never>?
    @State private var copyTimer: Task<Void, Never>?

    private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "careem-pay")

    init(request: CareemPayRequest) {
        self.request = request
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if isSuccess { successSplash } else { content }
            }
            .padding(24)
            .frame(maxWidth: .infinity)
            .overlay(alignment: .topTrailing) { closeButton }
        }
        .onChange(of: settlementKey, initial: true) { _, _ in resetForOpen() }
        .onDisappear(perform: clearTimers)
        .accessibilityLabel("Settle with Careem Pay")
    }

    // MARK: - Derived values (94-157)

    private var amountMinor: Int { request.amountMinor }
    private var groupId: String? { SettleText.nonEmpty(request.groupId) }
    private var reference: String { request.reference }
    private var actualSenderId: String { SettleText.nonEmpty(request.senderId) ?? store.currentUser.id }
    private var actualRecipientId: String {
        SettleText.nonEmpty(request.recipientId)
            ?? store.state.users.first { $0.id != store.currentUser.id }?.id ?? ""
    }
    private var settlementKey: String { "\(actualSenderId)|\(actualRecipientId)|\(amountMinor)|\(groupId ?? "")" }

    private var senderUser: User? { store.state.users.first { $0.id == actualSenderId } }
    private var recipientUser: User? { store.state.users.first { $0.id == actualRecipientId } }
    private var groupName: String? { groupId.flatMap { gid in SettleText.nonEmpty(store.state.groups.first { $0.id == gid }?.name) } }

    private var formattedAmount: String { Currency.format(amountMinor, currency: "AED") }
    private var careemTag: String { CareemPay.tag(for: recipientUser?.name) }
    private var paymentLink: String { CareemPay.payLink(tag: careemTag, amountMinor: amountMinor) }

    private var pendingReceipt: CareemPayReceipt? { isSuccess ? nil : receipt }
    /// Same check the ledger runs, against the same debt the UI showed. Done before charging.
    private var preCheck: SettlementValidationResult {
        store.validateSettlement(SettlementValidationInput(
            senderId: actualSenderId, recipientId: actualRecipientId, amountMinor: amountMinor, groupId: groupId))
    }
    private var canSettle: Bool { !isSuccess && (pendingReceipt != nil || preCheck.isOK) }

    // MARK: - Lifecycle (99-139)

    /// Fresh state every time the sheet opens (and cancel any pending auto-close).
    private func resetForOpen() {
        clearTimers()
        let pending = CareemPayPendingCharges.receipt(for: settlementKey)
        copiedLink = false
        isProcessing = false
        isSuccess = false
        error = nil
        receipt = pending
        warning = pending.map {
            "A Careem Pay transfer for this settlement already went through (ref \($0.transactionRef)) but wasn't "
                + "saved. Tap \"Retry saving\" — you won't be charged again."
        }
        inFlight = false
    }

    private func clearTimers() {
        closeTimer?.cancel()
        copyTimer?.cancel()
        closeTimer = nil
        copyTimer = nil
    }

    private func handleClose() {
        clearTimers()
        isSuccess = false
        error = nil
        router.dismissSheet()
    }

    // MARK: - Actions (159-238)

    private func handleCopyLink() {
        ShareActions.copy(paymentLink)
        copiedLink = true
        copyTimer?.cancel()
        copyTimer = Task {
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            copiedLink = false
        }
    }

    private func handleShareWhatsApp() {
        let text = "Salam \(recipientUser?.name ?? "")! 👋\n\n"
            + "Here is the settlement for \(reference):\n"
            + "💰 Amount: \(formattedAmount)\n"
            + "⚡ Pay via Careem Pay: \(paymentLink)\n\n"
            + "Tracked instantly on Payd Ledger 💚"
        guard let url = ShareActions.whatsAppURL(text: text) else {
            Self.logger.error("Could not build the WhatsApp share URL")
            return
        }
        openURL(url)
    }

    private func handleConfirmSettlement() {
        guard canSettle, !inFlight, !isSuccess else { return }
        inFlight = true
        isProcessing = true
        error = nil
        let key = settlementKey
        let sender = actualSenderId
        let recipient = actualRecipientId
        let amount = amountMinor
        let group = groupId
        let note = reference
        let tag = careemTag
        let recipientName = recipientUser?.name
        let api = settings.api
        let prior = pendingReceipt
        // `CareemPay.run` is nonisolated and calls `validate`/`record` synchronously off the main actor, so the
        // main-actor store is read before and written after it; the sequencing (validate → charge → record,
        // never re-charge) is unchanged.
        let check = prior == nil
            ? store.validateSettlement(SettlementValidationInput(
                senderId: sender, recipientId: recipient, amountMinor: amount, groupId: group))
            : .ok(debtMinor: 0)
        Task {
            var outcome = await CareemPay.run(
                validate: { check },
                charge: { () async throws(CareemPayFailure) -> CareemPayReceipt in
                    try await api.careemPaySettle(recipientTag: tag, recipientName: recipientName,
                                                  amountMinor: amount, note: note)
                },
                record: { _ in },
                priorReceipt: prior)
            if case let .recorded(charged) = outcome {
                do {
                    try store.recordSettlement(NewSettlement(
                        groupId: group, senderId: sender, recipientId: recipient, amountMinor: amount,
                        currency: "AED", method: "Careem Pay",
                        reference: "Careem Pay \(charged.transactionRef): \(note)",
                        // Validated before charging; the money has moved, so the ledger must reflect it.
                        allowOverpayment: true))
                } catch {
                    outcome = .chargedNotRecorded(receipt: charged, message: CareemPay.friendlyRecordWarning(charged))
                }
            }
            apply(outcome, key: key)
            inFlight = false
            isProcessing = false
        }
    }

    private func apply(_ outcome: CareemPayOutcome, key: String) {
        switch outcome {
        case let .invalid(message), let .chargeFailed(message):
            error = message
        case let .chargedNotRecorded(chargedReceipt, message):
            Self.logger.error("Careem Pay charged but the ledger write failed")
            CareemPayPendingCharges.set(chargedReceipt, for: key)
            receipt = chargedReceipt
            warning = message
        case let .recorded(recordedReceipt):
            CareemPayPendingCharges.remove(key)
            receipt = recordedReceipt
            warning = nil
            isSuccess = true
            clearTimers()
            closeTimer = Task {
                try? await Task.sleep(for: .seconds(2.4))
                guard !Task.isCancelled else { return }
                handleClose()
            }
        }
    }

    // MARK: - Views (240-400)

    private var closeButton: some View {
        Button(action: handleClose) {
            Image(systemName: "xmark")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(PaydTheme.zinc400)
                .frame(width: 36, height: 36)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Close")
        .padding(.top, 12)
        .padding(.trailing, 12)
    }

    private var successSplash: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.circle")
                .font(.system(size: 40))
                .foregroundStyle(PaydTheme.emerald400)
                .frame(width: 64, height: 64)
                .background(PaydTheme.emerald500.opacity(0.15), in: Circle())
                .accessibilityHidden(true)
            Text("SETTLEMENT CONFIRMED!")
                .paydHeadingFont(size: 18)
                .foregroundStyle(.white)
            Text("\(formattedAmount) successfully settled between \(senderUser?.name ?? "") and "
                 + "\(recipientUser?.name ?? "") via Careem Pay. Ledger updated.")
                .font(.payd(size: 12))
                .foregroundStyle(PaydTheme.zinc400)
                .frame(maxWidth: 320)
                .fixedSize(horizontal: false, vertical: true)
            if let receipt {
                Text("Ref \(receipt.transactionRef)\(receipt.simulated ? " · sandbox (no real money moved)" : "")")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(PaydTheme.zinc500)
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .transition(.scale(scale: 0.95).combined(with: .opacity))
    }

    @ViewBuilder private var content: some View {
        header
        amountCard
        recipientRow
        quickActions
        confirmArea
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "bolt")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(PaydTheme.careemGreen)
                .padding(10)
                .background(PaydTheme.careemGreen.opacity(0.2), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) {
                    Text("Careem pay")
                        .font(.paydHeading(size: 16))
                        .tracking(0.4)
                        .foregroundStyle(.white)
                        .accessibilityAddTraits(.isHeader)
                    PaydBadge("Instant UAE", tint: PaydTheme.careemGreen, bordered: true, size: 9)
                }
                Text("Instant settlement with Careem Pay")
                    .font(.payd(size: 12))
                    .foregroundStyle(PaydTheme.zinc400)
            }
            Spacer(minLength: 44)
        }
    }

    private var amountCard: some View {
        VStack(spacing: 8) {
            Text("Amount to settle")
                .paydHeadingFont(size: 10)
                .foregroundStyle(PaydTheme.zinc400)
            Text(formattedAmount)
                .font(.payd(size: 30, bold: true))
                .tracking(-0.75)
                .foregroundStyle(.white)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            HStack(spacing: 8) {
                Text(senderUser?.name ?? "You")
                    .foregroundStyle(.white)
                Image(systemName: "arrow.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PaydTheme.careemGreen)
                    .accessibilityHidden(true)
                Text(recipientUser?.name ?? "Friend")
                    .foregroundStyle(.white)
            }
            .font(.payd(size: 12))
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(16)
        .background(PaydTheme.emerald500.opacity(0.06), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(PaydTheme.emerald500.opacity(0.2)))
    }

    private var recipientRow: some View {
        HStack(spacing: 12) {
            Text("C")
                .font(.payd(size: 14, bold: true))
                .foregroundStyle(.black)
                .frame(width: 40, height: 40)
                .background(PaydTheme.careemGreen, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("Paying \(recipientUser?.name ?? "Friend") on Careem Pay")
                    .font(.payd(size: 12, bold: true))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(careemTag)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(PaydTheme.zinc400)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .paydCard(padding: 16, fill: PaydTheme.surface202025)
    }

    private var quickActions: some View {
        HStack(spacing: 8) {
            Button(action: handleShareWhatsApp) {
                HStack(spacing: 6) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 12, weight: .semibold))
                        .accessibilityHidden(true)
                    Text("Share WhatsApp").font(.payd(size: 12, bold: true))
                }
            }
            .buttonStyle(SettleButtonStyle(fill: PaydTheme.emerald500.opacity(0.15), text: PaydTheme.emerald400,
                                           stroke: PaydTheme.emerald500.opacity(0.3), height: 36))
            Button(action: handleCopyLink) {
                HStack(spacing: 6) {
                    Image(systemName: copiedLink ? "checkmark" : "doc.on.doc")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(copiedLink ? PaydTheme.emerald400 : PaydTheme.zinc200)
                        .accessibilityHidden(true)
                    Text(copiedLink ? "Link Copied!" : "Copy Pay Link").font(.payd(size: 12, bold: true))
                }
            }
            .buttonStyle(SettleButtonStyle(fill: PaydTheme.cardSubtle, text: PaydTheme.zinc200, height: 36))
        }
    }

    private var confirmArea: some View {
        let check = preCheck
        return VStack(spacing: 8) {
            if let error {
                SettleIconBanner(text: error, systemName: "exclamationmark.circle", tint: PaydTheme.red300,
                                 textColor: PaydTheme.red300, fill: PaydTheme.red500.opacity(0.1),
                                 stroke: PaydTheme.red500.opacity(0.3))
            }
            if let warning { WarningBanner(warning) }
            if pendingReceipt == nil, let reason = check.reason, amountMinor > 0 {
                SettleIconBanner(text: reason, systemName: "exclamationmark.circle", tint: PaydTheme.zinc300,
                                 textColor: PaydTheme.zinc300, fill: PaydTheme.zinc500.opacity(0.1),
                                 stroke: Color.white.opacity(0.1))
            }
            Button(action: handleConfirmSettlement) {
                HStack(spacing: 8) {
                    if isProcessing {
                        ProgressView()
                            .controlSize(.small)
                            .tint(.white)
                        Text(pendingReceipt != nil ? "Saving..." : "Settling via Careem Pay...")
                    } else {
                        Image(systemName: "checkmark.shield")
                            .font(.system(size: 14, weight: .semibold))
                            .accessibilityHidden(true)
                        Text(confirmTitle)
                    }
                }
                .font(.payd(size: 14, bold: true))
            }
            .buttonStyle(PaydFilledButtonStyle(fill: PaydTheme.emerald600, text: .white, height: 50))
            .disabled(isProcessing || !canSettle)
            .padding(.top, 4)
            Text("\(groupName.map { "Recorded in \($0). " } ?? "")"
                 + "Your balances update as soon as Careem Pay confirms the transfer.")
                .font(.payd(size: 10))
                .foregroundStyle(PaydTheme.zinc400)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var confirmTitle: String {
        if pendingReceipt != nil { return "Retry saving to Payd" }
        if canSettle { return "Settle \(formattedAmount) with Careem Pay" }
        return amountMinor > 0 ? "Can't settle this amount" : "Nothing to settle"
    }
}
