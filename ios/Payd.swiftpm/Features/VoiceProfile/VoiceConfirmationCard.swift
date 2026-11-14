import OSLog
import PaydCore
import SwiftUI

/// Port of web/src/components/voice/ConfirmationCard.tsx: review and save what the voice command means.
struct VoiceConfirmationCard: View {
    let intent: VoiceIntent
    let onConfirm: () -> Void
    let onCancel: () -> Void

    @Environment(LedgerStore.self) private var store

    /// Payd is an AED-only ledger: everything is recorded in AED.
    private static let ledgerCurrency = "AED"
    private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "voice")

    @State private var title: String
    @State private var amountMajor: String
    @State private var selectedCategory: String
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    init(intent: VoiceIntent, categories: [PaydCore.Category], onConfirm: @escaping () -> Void,
         onCancel: @escaping () -> Void) {
        self.intent = intent
        self.onConfirm = onConfirm
        self.onCancel = onCancel
        let wanted = (intent.category ?? "").lowercased()
        let defaultCategory = categories.first { $0.name.lowercased() == wanted }?.name
            ?? categories.first { $0.name == "Other" }?.name
            ?? categories.first?.name
            ?? ""
        _title = State(initialValue: VoiceRules.buildShortDescription(intent))
        // `intent.amount ? intent.amount.toString() : '0'` (0 is falsy)
        let amountText = intent.amount.flatMap { $0 == 0 ? nil : PaydMath.jsNumberString($0) } ?? "0"
        _amountMajor = State(initialValue: amountText)
        _selectedCategory = State(initialValue: defaultCategory)
    }

    // MARK: - Derived (ConfirmationCard.tsx:19-82)

    private var spokenCurrency: String { (intent.currency.flatMap { $0.isEmpty ? nil : $0 } ?? Self.ledgerCurrency).uppercased() }
    private var currencyMismatch: Bool { spokenCurrency != Self.ledgerCurrency }
    private var isRepayment: Bool { intent.intent == .recordRepayment }
    private var users: [User] { store.state.users }
    private var currentUser: User { store.currentUser }

    private var payerUser: User {
        let wanted = (intent.payer ?? "").lowercased()
        return users.first { $0.name.lowercased() == wanted } ?? currentUser
    }

    /// Exact full name or exact first name; no substring matches.
    private var activeParticipants: [User] {
        let matched = users.filter { user in
            intent.participants.contains { participant in
                let want = participant.voiceProfileTrimmed.lowercased()
                if want.isEmpty { return false }
                let name = user.name.lowercased()
                return name == want || Self.firstWord(name) == Self.firstWord(want)
            }
        }
        return matched.isEmpty ? [currentUser] : matched
    }

    private var matchedGroup: LedgerGroup? {
        let wanted = (intent.groupName ?? "").lowercased()
        return store.state.groups.first { $0.name.lowercased() == wanted }
    }

    private var nonMembers: [User] {
        guard let group = matchedGroup else { return [] }
        let memberIds = Set(store.groupMembers(group.id).map(\.id))
        return ([payerUser] + activeParticipants).filter { !memberIds.contains($0.id) }
    }

    /// Payer (who paid back) → recipient.
    private var repaymentRecipient: User {
        activeParticipants.first { $0.id != payerUser.id } ?? currentUser
    }

    private var totalMinor: Int { Currency.parseMajorToMinor(amountMajor, currency: Self.ledgerCurrency) }

    private var computedSplits: Shares {
        let fallback = Shares([(payerUser.id, totalMinor)])
        guard intent.intent == .splitExpense || activeParticipants.count > 1 else { return fallback }
        return (try? Splits.equal(totalMinor, among: activeParticipants.map(\.id))) ?? fallback
    }

    private var nonMemberNames: String { nonMembers.map(\.name).joined(separator: ", ") }

    // MARK: - Body

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header

            if let errorMessage {
                VoiceProfileNotice(text: errorMessage, tint: PaydTheme.rose500, textColor: PaydTheme.rose500)
                    .accessibilityAddTraits(.isStaticText)
            }

            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    label("Description")
                    VoiceProfileInput(placeholder: "", text: $title, verticalPadding: 8, accessibilityLabel: "Description")
                }

                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        label("Total Amount")
                        VoiceProfileInput(placeholder: "", text: $amountMajor, kind: .number, bold: true,
                                          prefix: Self.ledgerCurrency, verticalPadding: 8,
                                          accessibilityLabel: "Total Amount")
                    }
                    .frame(maxWidth: .infinity)
                    VStack(alignment: .leading, spacing: 4) {
                        label(isRepayment ? "From" : "Paid By")
                        HStack(spacing: 8) {
                            AvatarView(user: payerUser, size: 20)
                            Text(payerUser.name)
                                .font(.payd(size: 14))
                                .foregroundStyle(PaydTheme.foreground)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .frame(minHeight: 37)
                        .background(PaydTheme.slate850, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(PaydTheme.slate200))
                    }
                    .frame(maxWidth: .infinity)
                }

                if currencyMismatch {
                    VoiceProfileNotice(
                        text: "You mentioned \(spokenCurrency). Payd records everything in AED (multi-currency coming soon), so please enter the amount in AED.",
                        tint: PaydTheme.amber500, textColor: PaydTheme.amber400, fontSize: 11, padding: 10)
                }

                if isRepayment { repaymentRow }

                if !nonMembers.isEmpty, let group = matchedGroup {
                    VoiceProfileNotice(
                        text: "\(nonMemberNames) \(nonMembers.count == 1 ? "is" : "are") not a member of \(group.name).",
                        tint: PaydTheme.rose500, textColor: PaydTheme.rose500, fontSize: 11, padding: 10)
                }

                if !isRepayment {
                    VStack(alignment: .leading, spacing: 4) {
                        label("Category")
                        VoiceProfileSelect(selection: $selectedCategory,
                                           options: store.state.categories.map { (value: $0.name, label: $0.name) },
                                           textColor: PaydTheme.slate200, accessibilityLabel: "Category")
                    }
                }

                if !isRepayment && activeParticipants.count > 1 { splitPreview }
            }

            HStack(spacing: 6) {
                Image(systemName: "checkmark.shield")
                    .font(.system(size: 13, weight: .semibold))
                    .accessibilityHidden(true)
                Text("Shares always add up to the exact total")
                    .font(.payd(size: 11))
            }
            .foregroundStyle(PaydTheme.emerald400)

            HStack(spacing: 12) {
                Button("Discard", action: onCancel)
                    .buttonStyle(VoiceProfileButtonStyle(text: PaydTheme.slate300, stroke: PaydTheme.slate200, bold: false))
                Button(action: save) {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 14, weight: .bold))
                        Text("Confirm & Persist")
                    }
                }
                .buttonStyle(VoiceProfileButtonStyle(fill: PaydTheme.emerald600, text: .white))
                .disabled(isSubmitting)
            }
            .padding(.top, 8)
        }
        .padding(20)
        .frame(maxWidth: 512)
        .background(PaydTheme.slate900, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(PaydTheme.slate800))
        .shadow(color: .black.opacity(0.5), radius: 25, y: 12)
    }

    private var header: some View {
        VStack(spacing: 0) {
            HStack {
                HStack(spacing: 8) {
                    Text(intent.intent.rawValue.replacingOccurrences(of: "_", with: " ").uppercased())
                        .font(.payd(size: 12, bold: true))
                        .tracking(0.6)
                        .foregroundStyle(PaydTheme.emerald400)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 4)
                        .background(PaydTheme.emerald950.opacity(0.7), in: Capsule())
                        .overlay(Capsule().strokeBorder(VoiceProfilePalette.emerald800))
                    if let group = matchedGroup {
                        Text(group.name)
                            .font(.payd(size: 12))
                            .foregroundStyle(PaydTheme.blue400)
                            .lineLimit(1)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 2)
                            .background(VoiceProfilePalette.blue950.opacity(0.6), in: Capsule())
                    }
                }
                Spacer()
                Button(action: onCancel) {
                    Image(systemName: "xmark")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(PaydTheme.slate400)
                        .padding(4)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Discard")
            }
            .padding(.bottom, 12)
            Rectangle().fill(PaydTheme.slate800).frame(height: 1)
        }
    }

    private var repaymentRow: some View {
        HStack(spacing: 8) {
            Image(systemName: "person.fill.checkmark")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PaydTheme.emerald500)
                .accessibilityHidden(true)
            Text(payerUser.id == currentUser.id ? "You" : payerUser.name)
                .lineLimit(1)
            Image(systemName: "arrow.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(PaydTheme.slate400)
                .accessibilityLabel("pays")
            Text(repaymentRecipient.id == currentUser.id ? "You" : repaymentRecipient.name)
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(Currency.format(totalMinor, currency: Self.ledgerCurrency))
                .font(.payd(size: 14, bold: true))
                .monospacedDigit()
        }
        .font(.payd(size: 14))
        .foregroundStyle(PaydTheme.foreground)
        .padding(12)
        .background(PaydTheme.slate850.opacity(0.6), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(PaydTheme.slate800))
    }

    private var splitPreview: some View {
        let splits = computedSplits
        return VStack(spacing: 6) {
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "person.2")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(PaydTheme.emerald500)
                        .accessibilityHidden(true)
                    Text("Equal split (\(activeParticipants.count) people)")
                }
                Spacer()
                Text(Currency.format(totalMinor, currency: Self.ledgerCurrency)).monospacedDigit()
            }
            .font(.payd(size: 12, bold: true))
            .foregroundStyle(PaydTheme.slate400)
            .padding(.bottom, 2)

            ForEach(activeParticipants) { user in
                HStack {
                    HStack(spacing: 8) {
                        AvatarView(user: user, size: 16)
                        Text(user.id == currentUser.id ? "\(user.name) (You)" : user.name)
                            .font(.payd(size: 12))
                            .foregroundStyle(PaydTheme.slate300)
                            .lineLimit(1)
                    }
                    Spacer()
                    Text(Currency.format(splits[user.id] ?? 0, currency: Self.ledgerCurrency))
                        .font(.payd(size: 12, bold: true))
                        .foregroundStyle(.white)
                        .monospacedDigit()
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(PaydTheme.slate900, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(PaydTheme.slate800))
            }
        }
        .padding(12)
        .background(PaydTheme.slate850.opacity(0.6), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(PaydTheme.slate800))
    }

    private func label(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.payd(size: 11, bold: true))
            .tracking(0.55)
            .foregroundStyle(PaydTheme.slate400)
    }

    // MARK: - Save (ConfirmationCard.tsx:84-146)

    private struct SaveError: Error {
        let message: String
    }

    private func save() {
        isSubmitting = true
        errorMessage = nil
        do {
            try persist()
            onConfirm()
        } catch let error as LedgerInvariantError {
            Self.logger.error("Voice save rejected: \(error.message, privacy: .public)")
            errorMessage = isRepayment
                ? "This repayment doesn't match what's owed between these people. Check the amount and who paid whom."
                : "We couldn't save this because the amounts don't add up. Please check the details."
            isSubmitting = false
        } catch let error as SaveError {
            errorMessage = error.message
            isSubmitting = false
        } catch {
            Self.logger.error("Voice save failed: \(String(describing: error), privacy: .public)")
            let raw = error.localizedDescription
            errorMessage = raw.isEmpty ? "Failed to save. Please try again." : raw
            isSubmitting = false
        }
    }

    private func persist() throws {
        let total = totalMinor
        if total <= 0 { throw SaveError(message: "Please enter a valid amount greater than zero.") }
        if !nonMembers.isEmpty, let group = matchedGroup {
            throw SaveError(message: "\(nonMemberNames) \(nonMembers.count == 1 ? "is" : "are") not in \(group.name).")
        }
        let payer = payerUser
        if isRepayment {
            let recipient = repaymentRecipient
            if recipient.id == payer.id {
                throw SaveError(message: "Please say who paid whom, e.g. \"Prakarsh paid me back 80 AED\".")
            }
            try store.recordSettlement(NewSettlement(
                groupId: matchedGroup?.id, senderId: payer.id, recipientId: recipient.id, amountMinor: total,
                currency: Self.ledgerCurrency, method: "Voice Settlement", reference: title, allowOverpayment: true))
        } else {
            let category = store.state.categories.first { $0.name.lowercased() == selectedCategory.lowercased() }
            let splits = computedSplits.map { ShareAllocation(userId: $0.key, shareMinor: $0.value) }
            let trimmedTitle = title.voiceProfileTrimmed
            try store.addTransaction(NewTransaction(
                type: intent.intent == .addIncome ? .income : .expense,
                title: trimmedTitle.isEmpty ? "Expense" : trimmedTitle, amountMinor: total,
                currency: Self.ledgerCurrency, categoryId: category?.id, payerId: payer.id,
                groupId: matchedGroup?.id, paymentMethod: "Card", notes: intent.notes, splits: splits))
        }
    }

    /// `s.split(' ')[0]`.
    private static func firstWord(_ text: String) -> String {
        String(text.split(separator: " ", omittingEmptySubsequences: false).first ?? "")
    }
}
