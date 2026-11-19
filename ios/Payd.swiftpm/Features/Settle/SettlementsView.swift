import PaydCore
import SwiftUI

/// Port of web/src/components/settlements/SettlementsView.tsx (the "Settle up" tab).
struct SettlementsView: View {
    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var activeTab: SettleTab = .owedToMe
    @State private var notificationMsg: String?

    init() {}

    var body: some View {
        let lists = SettlePeople.lists(state: store.state, snapshot: store.snapshot)
        VStack(alignment: .leading, spacing: 24) {
            topBanner
            heroCard
            summaryCards(lists)
            VStack(alignment: .leading, spacing: 16) {
                tabSwitcher(lists)
                personList(lists)
            }
            completedTransfers
        }
        .settleToast($notificationMsg, duration: 3)
    }

    // MARK: - Header (226-243)

    private var topBanner: some View {
        VStack(alignment: .leading, spacing: 16) {
            ScreenTitle("Settle up", subtitle: "Payd works out the fewest payments that clear every balance. "
                        + "Pay or get paid in one tap, fee-free with Careem Pay.")
            Button {
                router.present(.recordSettlement(.init()))
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .black))
                        .accessibilityHidden(true)
                    Text("Record Settlement")
                        .font(.payd(size: 14, bold: true))
                }
                .foregroundStyle(PaydTheme.zinc950)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(PaydTheme.brand400, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(PressScaleButtonStyle())
        }
    }

    // MARK: - Smart settle-up hero (246-279)

    private var heroCard: some View {
        let (before, after) = store.snapshot.simplification
        let saved = max(0, before - after)
        let totalVolume = store.snapshot.userOwedToMe + store.snapshot.userIOwe
        return VStack(alignment: .leading, spacing: 0) {
            Text("Smart settle-up")
                .font(.paydHeading(size: 11))
                .tracking(0.55)
                .foregroundStyle(PaydTheme.brand100)
                .padding(.bottom, 8)
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(before == 0 ? "All square" : "\(before) → \(after)")
                        .font(.payd(size: 30, bold: true))
                        .tracking(-0.75)
                        .foregroundStyle(.white)
                    Text(heroSubtitle(before: before, saved: saved))
                        .font(.payd(size: 12))
                        .foregroundStyle(PaydTheme.brand100)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 0) {
                    MoneyText(totalVolume, font: .payd(size: 20, bold: true), color: PaydTheme.emerald500)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text("Pending Volume")
                        .font(.payd(size: 11))
                        .foregroundStyle(.white.opacity(0.7))
                }
            }
            .padding(.top, 12)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PaydTheme.brandHero, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func heroSubtitle(before: Int, saved: Int) -> String {
        if before == 0 { return "No open debts to settle" }
        guard saved > 0 else { return "Already the fewest transfers possible" }
        let pct = PaydMath.oneDecimalPercentString(saved, of: before)
        return "\(saved) transfer\(saved == 1 ? "" : "s") eliminated (\(pct)% fewer)"
    }

    // MARK: - Summary cards (282-322)

    private func summaryCards(_ lists: SettlePeople.Lists) -> some View {
        let owedCount = lists.owedToMe.count
        let oweCount = lists.iOwe.count
        return HStack(alignment: .top, spacing: 12) {
            summaryCard(tab: .owedToMe, tint: PaydTheme.emerald500, labelTint: PaydTheme.emerald400,
                        icon: "arrow.down.left", title: "Owed to you",
                        amount: "+" + Currency.format(store.snapshot.userOwedToMe, currency: SettleText.currency),
                        caption: "\(owedCount) \(owedCount == 1 ? "person owes" : "people owe") you")
            summaryCard(tab: .iOwe, tint: PaydTheme.rose500, labelTint: PaydTheme.rose400,
                        icon: "arrow.up.right", title: "You owe",
                        amount: "-" + Currency.format(store.snapshot.userIOwe, currency: SettleText.currency),
                        caption: "You owe \(oweCount) \(oweCount == 1 ? "person" : "people")")
        }
    }

    private func summaryCard(tab: SettleTab, tint: Color, labelTint: Color, icon: String, title: String,
                             amount: String, caption: String) -> some View {
        let isActive = activeTab == tab
        return Button {
            activeTab = tab
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) {
                    Image(systemName: icon)
                        .font(.system(size: 14, weight: .semibold))
                        .accessibilityHidden(true)
                    Text(title)
                        .font(.payd(size: 14, bold: true))
                        .lineLimit(1)
                }
                .foregroundStyle(labelTint)
                Text(amount)
                    .font(.payd(size: 24, bold: true))
                    .foregroundStyle(.white)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.top, 8)
                Text(caption)
                    .font(.payd(size: 11))
                    .foregroundStyle(PaydTheme.zinc400)
                    .padding(.top, 4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .background(isActive ? PaydTheme.surface202028 : PaydTheme.card,
                        in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(isActive ? tint : PaydTheme.border))
            .overlay {
                if isActive {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(tint.opacity(0.2), lineWidth: 2)
                        .padding(-2)
                }
            }
            .shadow(color: .black.opacity(0.15), radius: 4, y: 2)
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }

    // MARK: - Tab switcher (326-347)

    private func tabSwitcher(_ lists: SettlePeople.Lists) -> some View {
        HStack(alignment: .bottom, spacing: 24) {
            tabButton(.owedToMe, title: "Owed to you (\(lists.owedToMe.count))", tint: PaydTheme.emerald500,
                      textTint: PaydTheme.emerald400)
            tabButton(.iOwe, title: "You owe (\(lists.iOwe.count))", tint: PaydTheme.rose500,
                      textTint: PaydTheme.rose400)
            Spacer(minLength: 0)
        }
        .overlay(alignment: .bottom) {
            Rectangle().fill(PaydTheme.border).frame(height: 1)
        }
    }

    private func tabButton(_ tab: SettleTab, title: String, tint: Color, textTint: Color) -> some View {
        let isActive = activeTab == tab
        return Button {
            activeTab = tab
        } label: {
            VStack(spacing: 12) {
                Text(title)
                    .font(.payd(size: 14, bold: true))
                    .foregroundStyle(isActive ? textTint : PaydTheme.zinc400)
                Rectangle()
                    .fill(isActive ? tint : .clear)
                    .frame(height: 2)
            }
            .fixedSize()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }

    // MARK: - People (350-433)

    @ViewBuilder private func personList(_ lists: SettlePeople.Lists) -> some View {
        VStack(spacing: 12) {
            switch activeTab {
            case .owedToMe:
                if lists.owedToMe.isEmpty {
                    emptyCard(title: "No pending receivables!", text: "None of your friends owe you money right now.")
                } else {
                    ForEach(lists.owedToMe) { person in
                        SettlePersonCard(person: person, direction: .owedToMe,
                                         onReminder: { sendReminder(person) })
                    }
                }
            case .iOwe:
                if lists.iOwe.isEmpty {
                    emptyCard(title: "You are completely debt-free!", text: "You don't owe any group members.")
                } else {
                    ForEach(lists.iOwe) { person in
                        SettlePersonCard(person: person, direction: .iOwe, onReminder: nil)
                    }
                }
            }
        }
    }

    private func emptyCard(title: String, text: String) -> some View {
        VStack(spacing: 0) {
            Image(systemName: "checkmark.circle")
                .font(.system(size: 32))
                .foregroundStyle(PaydTheme.emerald400)
                .opacity(0.6)
                .padding(.bottom, 8)
                .accessibilityHidden(true)
            Text(title)
                .paydHeadingFont(size: 14)
                .foregroundStyle(.white)
            Text(text)
                .font(.payd(size: 12))
                .foregroundStyle(PaydTheme.zinc400)
                .padding(.top, 4)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .paydCard(padding: 40)
    }

    /// SettlementsView.tsx:101-115. The iOS clipboard can't refuse a write, so the WhatsApp fallback isn't needed.
    private func sendReminder(_ person: SettlePeople.PersonDebt) {
        let link = CareemPay.payLink(tag: CareemPay.tag(for: store.currentUser.name), amountMinor: person.amountMinor)
        let firstName = PaydFormat.firstName(person.user.name)
        let text = "Hi \(firstName)! Friendly reminder from Payd: you owe me "
            + "\(Currency.format(person.amountMinor, currency: SettleText.currency)). "
            + "You can pay me on Careem Pay here: \(link)"
        ShareActions.copy(text)
        notificationMsg = "Reminder for \(firstName) copied. Paste it into WhatsApp or SMS."
    }

    // MARK: - Completed transfers (437-488)

    private var completedTransfers: some View {
        let settlements = store.state.settlements
        let sorted = settlements.stableSorted { $0.settledAt > $1.settledAt }
        return VStack(alignment: .leading, spacing: 12) {
            Text("COMPLETED TRANSFERS (\(settlements.count))")
                .paydHeadingFont(size: 12)
                .foregroundStyle(PaydTheme.zinc400)
                .accessibilityAddTraits(.isHeader)
            VStack(spacing: 8) {
                if settlements.isEmpty {
                    Text("No settlements recorded yet.")
                        .font(.payd(size: 12))
                        .foregroundStyle(PaydTheme.zinc400)
                        .frame(maxWidth: .infinity)
                        .paydCard(padding: 24)
                } else {
                    ForEach(sorted, id: \.id) { settlementRow($0) }
                }
            }
        }
        .padding(.top, 16)
        .overlay(alignment: .top) {
            Rectangle().fill(PaydTheme.border).frame(height: 1)
        }
    }

    private func settlementRow(_ s: Settlement) -> some View {
        let state = store.state
        let me = store.currentUser.id
        let sender = state.users.first { $0.id == s.senderId }
        let recipient = state.users.first { $0.id == s.recipientId }
        let title = SettleText.collapsed([sender?.name, sender?.id == me ? "(You)" : nil, "paid",
                                          recipient?.name, recipient?.id == me ? "(You)" : nil])
        let groupLabel = s.groupId == nil ? "No group" : SettleText.groupName(s.groupId, in: state)
        let detail = "\(s.method) • \(groupLabel) • \(SettleText.nonEmpty(s.reference) ?? "Settlement completed")"
        return HStack(spacing: 12) {
            Image(systemName: "checkmark")
                .font(.system(size: 14, weight: .heavy))
                .foregroundStyle(PaydTheme.emerald400)
                .frame(width: 32, height: 32)
                .background(PaydTheme.emerald500.opacity(0.15), in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.payd(size: 12, bold: true))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(detail)
                    .font(.payd(size: 11))
                    .foregroundStyle(PaydTheme.zinc400)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 0) {
                MoneyText(s.amountMinor, currency: s.currency, font: .payd(size: 12, bold: true),
                          color: PaydTheme.zinc300)
                Text(PaydFormat.shortDate(s.settledAt))
                    .font(.payd(size: 10))
                    .foregroundStyle(PaydTheme.zinc500)
            }
            .fixedSize()
        }
        .paydCard(padding: 14)
        .shadow(color: .black.opacity(0.1), radius: 1, y: 1)
        .accessibilityElement(children: .combine)
    }
}

/// `activeTab` values ('owed_to_me' | 'i_owe').
enum SettleTab: Hashable {
    case owedToMe, iOwe
}
