import PaydCore
import SwiftUI

/// Port of web/src/components/modals/RecordSettlementModal.tsx.
struct RecordSettlementView: View {
    let request: SettlementRequest

    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var senderId = ""
    @State private var recipientId = ""
    @State private var amountStr = ""
    @State private var groupId: String?
    @State private var method = "Careem Pay"
    @State private var reference = ""
    @State private var allowOverpayment = false
    @State private var error: String?
    @State private var didLoadDefaults = false

    private static let currency = SettleText.currency
    private static let methods: [(value: String, label: String)] = [
        ("Careem Pay", "Careem Pay (Instant)"),
        ("Apple Pay", "Apple Pay"),
        ("Bank Transfer", "Bank Transfer / Wio"),
        ("Credit Card", "Card"),
        ("Cash", "Cash"),
    ]

    init(request: SettlementRequest) {
        self.request = request
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader(title: "Record settlement", badge: "Not an expense", onClose: close)
                if let error { ErrorBanner(error) }
                flowHeader
                form
            }
            .padding(24)
        }
        .scrollDismissesKeyboard(.interactively)
        .onAppear(perform: loadDefaults)
    }

    // MARK: - Derived values (62-101)

    private var state: LedgerState { store.state }
    private var currentUserId: String { store.currentUser.id }

    private func memberIds(of gid: String) -> Set<String> {
        Set(state.groupMembers.filter { $0.groupId == gid }.map(\.userId))
    }

    /// People offered: the group's members when a group is chosen, everyone otherwise.
    private var pickable: [User] {
        guard let groupId else { return state.users }
        let ids = memberIds(of: groupId)
        return state.users.filter { ids.contains($0.id) }
    }

    private var recipientOptions: [User] { pickable.filter { $0.id != senderId } }

    private var currentDebtMinor: Int {
        recipientId.isEmpty ? 0 : store.pairwiseDebt(from: senderId, to: recipientId, groupId: groupId)
    }

    private var reverseDebtMinor: Int {
        recipientId.isEmpty ? 0 : store.pairwiseDebt(from: recipientId, to: senderId, groupId: groupId)
    }

    private var totalMinor: Int { Currency.parseMajorToMinor(amountStr, currency: Self.currency) }
    private var isOverpaying: Bool { totalMinor > 0 && totalMinor > currentDebtMinor }

    /// Groups you belong to (plus the currently selected one).
    private var sharedGroups: [LedgerGroup] {
        state.groups.filter { $0.id == groupId || memberIds(of: $0.id).contains(currentUserId) }
    }

    private var senderUser: User? { state.users.first { $0.id == senderId } }
    private var recipientUser: User? { state.users.first { $0.id == recipientId } }

    private func optionLabel(_ user: User) -> String {
        "\(user.name) \(user.id == currentUserId ? "(You)" : "")"
    }

    // MARK: - Open-time defaults and change rules (40-87)

    private func loadDefaults() {
        guard !didLoadDefaults else { return }
        didLoadDefaults = true
        let sender = SettleText.nonEmpty(request.senderId) ?? currentUserId
        let recipient: String
        if let wanted = SettleText.nonEmpty(request.recipientId), wanted != sender {
            recipient = wanted
        } else {
            recipient = state.users.first { $0.id != sender }?.id ?? ""
        }
        senderId = sender
        recipientId = recipient
        amountStr = request.amountMinor.flatMap { $0 != 0 ? Currency.minorToMajorString($0) : nil } ?? ""
        groupId = SettleText.nonEmpty(request.groupId)
    }

    private func changeSender(_ id: String) {
        senderId = id
        if recipientId == id || recipientId.isEmpty {
            recipientId = pickable.first { $0.id != id }?.id ?? ""
        }
        error = nil
    }

    private func changeGroup(_ gid: String?) {
        groupId = gid
        error = nil
        guard let gid else { return }
        let ids = memberIds(of: gid)
        let sender = ids.contains(senderId) ? senderId
            : ids.contains(currentUserId) ? currentUserId
            : state.users.first { ids.contains($0.id) }?.id ?? senderId
        senderId = sender
        if !ids.contains(recipientId) || recipientId == sender {
            recipientId = state.users.first { ids.contains($0.id) && $0.id != sender }?.id ?? ""
        }
    }

    // MARK: - Payer → recipient header (160-193)

    private var flowHeader: some View {
        HStack {
            HStack(spacing: 8) {
                avatar(senderUser)
                person(label: "Payer", name: senderUser?.name, alignment: .leading)
            }
            Spacer(minLength: 8)
            VStack(spacing: 2) {
                Text("Repaying")
                    .font(.payd(size: 10, bold: true))
                Image(systemName: "arrow.right")
                    .font(.system(size: 14, weight: .semibold))
                    .accessibilityHidden(true)
            }
            .foregroundStyle(PaydTheme.emerald500)
            .padding(.horizontal, 8)
            Spacer(minLength: 8)
            HStack(spacing: 8) {
                person(label: "Recipient", name: recipientUser?.name, alignment: .trailing)
                avatar(recipientUser)
            }
        }
        .padding(14)
        .background(PaydTheme.slate850, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func person(label: String, name: String?, alignment: HorizontalAlignment) -> some View {
        VStack(alignment: alignment, spacing: 0) {
            Text(label.uppercased())
                .font(.payd(size: 10))
                .foregroundStyle(PaydTheme.slate400)
            Text(name ?? "")
                .font(.payd(size: 12, bold: true))
                .foregroundStyle(.white)
                .lineLimit(1)
        }
    }

    @ViewBuilder private func avatar(_ user: User?) -> some View {
        if user?.avatarUrl != nil {
            AvatarView(user: user, size: 28)
        } else {
            InitialsDisc(PaydFormat.firstLetter(SettleText.nonEmpty(user?.name) ?? "?"), size: 28,
                         fill: PaydTheme.brand600.opacity(0.4), fontSize: 10)
        }
    }

    // MARK: - Form (195-373)

    private var form: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                field("Sender") {
                    PaydMenuPicker(selection: Binding(get: { senderId }, set: changeSender),
                                   options: pickable.map { ($0.id, optionLabel($0)) })
                }
                field("Recipient") {
                    PaydMenuPicker(selection: Binding(get: { recipientId }, set: { recipientId = $0; error = nil }),
                                   options: recipientPickerOptions)
                }
            }
            field("Group") {
                PaydMenuPicker(selection: Binding(get: { groupId ?? "" }, set: { changeGroup(SettleText.nonEmpty($0)) }),
                               options: [("", "No group (overall balance)")] + sharedGroups.map { ($0.id, $0.name) })
            }
            debtInfo
            HStack(alignment: .top, spacing: 12) {
                field("Amount") {
                    PaydAmountField(text: Binding(get: { amountStr }, set: { amountStr = $0; error = nil }),
                                    prefix: Self.currency)
                }
                field("Payment Method") {
                    PaydMenuPicker(selection: $method, options: Self.methods)
                }
            }
            if isOverpaying { overpaymentWarning }
            field("Notes / Reference") {
                PaydTextField("e.g. Settle dinner & grocery debts", text: $reference)
            }
            HStack(spacing: 6) {
                Image(systemName: "checkmark.shield")
                    .font(.system(size: 13, weight: .semibold))
                    .accessibilityHidden(true)
                Text("Repayment updates derived balances directly without polluting expense budgets.")
                    .font(.payd(size: 11))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(PaydTheme.teal400)
            HStack(spacing: 12) {
                Button("Cancel", action: close)
                    .buttonStyle(PaydSecondaryButtonStyle(height: 40))
                Button("Record Settlement", action: submit)
                    .buttonStyle(PaydFilledButtonStyle(fill: PaydTheme.emerald600, text: .white, height: 40))
                    .disabled((isOverpaying && !allowOverpayment) || recipientId.isEmpty)
            }
            .padding(.top, 8)
        }
    }

    private var recipientPickerOptions: [(value: String, label: String)] {
        let options = recipientOptions
        if options.isEmpty { return [("", "No one else in this group")] }
        return options.map { ($0.id, optionLabel($0)) }
    }

    private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.payd(size: 12))
                .foregroundStyle(PaydTheme.zinc400)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var debtInfo: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("\(SettleText.nonEmpty(senderUser?.name) ?? "Sender") owes "
                     + "\(SettleText.nonEmpty(recipientUser?.name) ?? "recipient")"
                     + "\(groupId != nil ? " in this group" : " overall"):")
                    .foregroundStyle(PaydTheme.slate500)
                Spacer(minLength: 8)
                MoneyText(currentDebtMinor, currency: Self.currency, font: .payd(size: 12, bold: true), color: .white)
            }
            .font(.payd(size: 12))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(PaydTheme.slate800.opacity(0.8), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            if currentDebtMinor == 0 && reverseDebtMinor > 0 {
                Text("It's the other way round: \(recipientUser?.name ?? "") owes \(senderUser?.name ?? "") "
                     + "\(Currency.format(reverseDebtMinor, currency: Self.currency)).")
                    .font(.payd(size: 11))
                    .foregroundStyle(PaydTheme.slate400)
                    .padding(.horizontal, 4)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var overpaymentWarning: some View {
        let sender = SettleText.nonEmpty(senderUser?.name)
        let recipient = SettleText.nonEmpty(recipientUser?.name)
        let message = currentDebtMinor == 0
            ? "\(sender ?? "The sender") doesn't owe \(recipient ?? "the recipient") anything"
                + "\(groupId != nil ? " in this group" : "") right now."
            : "Heads up: this amount (\(Currency.format(totalMinor, currency: Self.currency))) is more than "
                + "what's owed (\(Currency.format(currentDebtMinor, currency: Self.currency)))."
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 14, weight: .semibold))
                    .padding(.top, 2)
                    .accessibilityHidden(true)
                Text(message)
                    .font(.payd(size: 12))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(PaydTheme.amber400)
            Button {
                allowOverpayment.toggle()
            } label: {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: allowOverpayment ? "checkmark.square.fill" : "square")
                        .font(.system(size: 15))
                        .foregroundStyle(allowOverpayment ? PaydTheme.emerald600 : PaydTheme.slate400)
                    Text("Record \(currentDebtMinor == 0 ? "it" : "the extra") as an advance payment ("
                         + "\(recipient ?? "the recipient") will owe it back)")
                        .font(.payd(size: 12))
                        .foregroundStyle(PaydTheme.slate300)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(allowOverpayment ? .isSelected : [])
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PaydTheme.amber500.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(PaydTheme.amber500.opacity(0.3)))
    }

    // MARK: - Submit (103-132)

    private func submit() {
        error = nil
        guard !((isOverpaying && !allowOverpayment) || recipientId.isEmpty) else { return }
        let overpay = isOverpaying && allowOverpayment
        let check = store.validateSettlement(SettlementValidationInput(
            senderId: senderId, recipientId: recipientId, amountMinor: totalMinor, groupId: groupId,
            allowOverpayment: overpay))
        if let reason = check.reason {
            error = reason
            return
        }
        do {
            try store.recordSettlement(NewSettlement(
                groupId: groupId, senderId: senderId, recipientId: recipientId, amountMinor: totalMinor,
                currency: Self.currency, method: method,
                reference: SettleText.nonEmpty(reference.trimmingCharacters(in: .whitespacesAndNewlines))
                    ?? (isOverpaying ? "Advance payment" : "Settlement"),
                allowOverpayment: overpay))
            close()
        } catch {
            // recordSettlement throws plain-language reasons; never show internal codes.
            let raw = (error as? LedgerInvariantError)?.message ?? ""
            let message = raw.replacingOccurrences(of: #"^Ledger Invariant Violation:?\s*"#, with: "",
                                                   options: [.regularExpression, .caseInsensitive])
            self.error = SettleText.nonEmpty(message)
                ?? "Couldn't record this settlement. Please check the details and try again."
        }
    }

    private func close() {
        router.dismissSheet()
    }
}
