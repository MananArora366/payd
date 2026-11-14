import PaydCore
import SwiftUI

/// SettlementsView.tsx:37-82: the current user's netted debts, one entry per other person.
enum SettlePeople {
    struct PersonDebt: Identifiable {
        let user: User
        /// Net amount across all groups (always > 0 in the list it belongs to).
        let amountMinor: Int
        /// Per-group pieces; each can point either way. They net to `amountMinor`.
        let components: [PairDebtComponent]

        var id: String { user.id }
    }

    struct Lists {
        let owedToMe: [PersonDebt]
        let iOwe: [PersonDebt]
    }

    static func lists(state: LedgerState, snapshot: LedgerSnapshot) -> Lists {
        let me = snapshot.currentUser.id
        let debts = snapshot.bilateralDebts
        var owedToMe: [PersonDebt] = []
        var iOwe: [PersonDebt] = []
        for user in state.users where user.id != me {
            let theyOwe = debts[user.id]?[me] ?? 0
            let iOweThem = debts[me]?[user.id] ?? 0
            if theyOwe <= 0 && iOweThem <= 0 { continue }
            let components = LedgerQueries.pairDebtBreakdown(me, user.id, snapshot: snapshot)
            if theyOwe > 0 { owedToMe.append(PersonDebt(user: user, amountMinor: theyOwe, components: components)) }
            if iOweThem > 0 { iOwe.append(PersonDebt(user: user, amountMinor: iOweThem, components: components)) }
        }
        return Lists(owedToMe: owedToMe.stableSorted { $0.amountMinor > $1.amountMinor },
                     iOwe: iOwe.stableSorted { $0.amountMinor > $1.amountMinor })
    }
}

/// One person card of the Settle tab (SettlementsView.tsx:359-431) with its settle area (172-213)
/// and action buttons (120-169).
struct SettlePersonCard: View {
    let person: SettlePeople.PersonDebt
    let direction: SettleTab
    /// "Copy Reminder" (owed-to-me cards only).
    let onReminder: (() -> Void)?

    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router

    private var currency: String { SettleText.currency }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            VStack(alignment: .leading, spacing: 0) {
                if let onReminder {
                    Button(action: onReminder) {
                        HStack(spacing: 6) {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 12, weight: .semibold))
                                .accessibilityHidden(true)
                            Text("Copy Reminder")
                                .font(.payd(size: 12, bold: true))
                        }
                    }
                    .buttonStyle(SettleButtonStyle(fill: PaydTheme.cardSubtle, text: PaydTheme.zinc200))
                }
                settleArea
            }
            .padding(.top, 12)
            .overlay(alignment: .top) {
                Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
            }
            .padding(.top, 16)
        }
        .paydCard()
        .shadow(color: .black.opacity(0.15), radius: 4, y: 2)
    }

    private var header: some View {
        let isOwedToMe = direction == .owedToMe
        let name = person.user.name
        let verb = Text(isOwedToMe ? "owes" : "owe")
            .font(.payd(size: 14, italic: true))
            .foregroundStyle(PaydTheme.zinc400)
        return HStack(spacing: 12) {
            InitialsDisc(PaydFormat.initialsNavbar(name), size: 44,
                         fill: isOwedToMe ? PaydTheme.sky700 : PaydTheme.rose700, fontSize: 14)
            VStack(alignment: .leading, spacing: 2) {
                SwiftUI.Group {
                    if isOwedToMe {
                        Text("\(name) \(verb) You")
                    } else {
                        Text("You \(verb) \(name)")
                    }
                }
                .font(.payd(size: 14, bold: true))
                .foregroundStyle(.white)
                .lineLimit(1)
                Text(person.user.email)
                    .font(.payd(size: 12))
                    .foregroundStyle(PaydTheme.zinc400)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            MoneyText(person.amountMinor, currency: currency, prefix: isOwedToMe ? "+" : "-",
                      font: .payd(size: 16, bold: true), color: isOwedToMe ? PaydTheme.emerald500 : PaydTheme.rose500)
                .fixedSize()
        }
    }

    // MARK: - Settle area (172-213)

    @ViewBuilder private var settleArea: some View {
        let components = person.components
        if components.count <= 1 {
            if let c = components.first {
                Text(SettleText.groupName(c.groupId, in: store.state))
                    .font(.payd(size: 11))
                    .foregroundStyle(PaydTheme.zinc500)
                    .padding(.top, 12)
                HStack(spacing: 8) { actions(c, compact: false) }
                    .padding(.top, 8)
            }
        } else {
            multiGroupArea(components)
        }
    }

    private func multiGroupArea(_ components: [PairDebtComponent]) -> some View {
        let me = store.currentUser.id
        let mixed = Set(components.map(\.fromUserId)).count > 1
        let firstName = PaydFormat.firstName(person.user.name)
        return VStack(alignment: .leading, spacing: 8) {
            Text("This balance spans \(components.count) groups\(mixed ? " and partly cancels out" : ""). "
                 + "Settle each group separately so every group's balance stays accurate.")
                .font(.payd(size: 11))
                .foregroundStyle(PaydTheme.zinc400)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(components, id: \.self) { c in
                let iPay = c.fromUserId == me
                VStack(spacing: 8) {
                    HStack {
                        Text("\(SettleText.groupName(c.groupId, in: store.state)) • "
                             + (iPay ? "You owe \(firstName)" : "\(firstName) owes you"))
                            .foregroundStyle(PaydTheme.zinc300)
                            .lineLimit(1)
                        Spacer(minLength: 8)
                        MoneyText(c.amountMinor, currency: currency, font: .payd(size: 11, bold: true),
                                  color: iPay ? PaydTheme.rose500 : PaydTheme.emerald500)
                            .fixedSize()
                    }
                    .font(.payd(size: 11))
                    HStack(spacing: 8) { actions(c, compact: true) }
                }
                .padding(10)
                .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.06)))
            }
        }
        .padding(.top, 12)
    }

    // MARK: - Actions (120-169)

    @ViewBuilder private func actions(_ c: PairDebtComponent, compact: Bool) -> some View {
        let theyPayMe = c.toUserId == store.currentUser.id
        let fontSize: CGFloat = compact ? 11 : 12
        let height: CGFloat = compact ? 28 : 32
        let record = SettlementRequest(senderId: c.fromUserId, recipientId: c.toUserId,
                                       amountMinor: c.amountMinor, groupId: c.groupId)
        if theyPayMe {
            Button {
                router.present(.careemPay(careemRequest(c, reference: "Settlement from \(person.user.name)")))
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "bolt")
                        .font(.system(size: 12, weight: .semibold))
                        .accessibilityHidden(true)
                    Text("Careem QR").font(.payd(size: fontSize, bold: true))
                }
            }
            .buttonStyle(SettleButtonStyle(fill: PaydTheme.emerald500.opacity(0.15), text: PaydTheme.emerald400,
                                           stroke: PaydTheme.emerald500.opacity(0.3), height: height))
            Button {
                router.present(.recordSettlement(record))
            } label: {
                Text("Mark Received").font(.payd(size: fontSize, bold: true))
            }
            .buttonStyle(SettleButtonStyle(fill: PaydTheme.brand600, text: .white, height: height))
        } else {
            Button {
                router.present(.careemPay(careemRequest(c, reference: "Settlement to \(person.user.name)")))
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "bolt.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(PaydTheme.careemGreen)
                        .accessibilityHidden(true)
                    Text("Pay with Careem Pay (\(Currency.format(c.amountMinor, currency: currency)))")
                        .font(.payd(size: fontSize, bold: true))
                }
            }
            .buttonStyle(SettleButtonStyle(fill: .white, text: .black, height: height, shadow: true))
            Button {
                router.present(.recordSettlement(record))
            } label: {
                Text("Record Repayment").font(.payd(size: fontSize, bold: true))
            }
            .buttonStyle(SettleButtonStyle(fill: PaydTheme.brand600, text: .white, height: height, expands: false))
        }
    }

    private func careemRequest(_ c: PairDebtComponent, reference: String) -> CareemPayRequest {
        CareemPayRequest(senderId: c.fromUserId, recipientId: c.toUserId, amountMinor: c.amountMinor,
                         groupId: c.groupId, reference: reference)
    }
}
