import SwiftUI
import PaydCore

/// Timeline of the user's expenses and settlements, newest first.
struct ActivityView: View {
    @Environment(LedgerStore.self) private var store

    private enum Item: Identifiable {
        case transaction(LedgerTransaction)
        case settlement(Settlement)

        var id: String {
            switch self {
            case let .transaction(txn): "t-\(txn.id)"
            case let .settlement(settlement): "s-\(settlement.id)"
            }
        }

        var date: Date {
            switch self {
            case let .transaction(txn): txn.occurredAt
            case let .settlement(settlement): settlement.settledAt
            }
        }
    }

    private var items: [Item] {
        let me = store.currentUserId
        let transactions = LedgerQueries.activity(for: me, in: store.state).map(Item.transaction)
        let settlements = store.state.settlements
            .filter { $0.senderId == me || $0.recipientId == me }
            .map(Item.settlement)
        return (transactions + settlements).sorted { $0.date > $1.date }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                PaydScreenTitle(title: "Activity")
                PaydSectionLabel(title: "\(items.count) entries")
                    .padding(.bottom, 4)

                ForEach(items) { item in
                    switch item {
                    case let .transaction(txn):
                        ExpenseRowView(transaction: txn, state: store.state)
                    case let .settlement(settlement):
                        settlementRow(settlement)
                    }
                }
            }
            .padding(16)
        }
        .background(PaydTheme.canvas)
    }

    private func settlementRow(_ settlement: Settlement) -> some View {
        let iSent = settlement.senderId == store.currentUserId
        let other = LedgerQueries.user(iSent ? settlement.recipientId : settlement.senderId, in: store.state)?.name ?? "Unknown"
        return HStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(PaydTheme.emerald)
                .frame(width: 44, height: 44)
                .background(PaydTheme.emerald.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(iSent ? "You paid \(other)" : "\(other) paid you")
                    .font(.payd(.subheadline).weight(.bold))
                    .foregroundStyle(.white)
                Text("\(settlement.method) • \(settlement.settledAt.formatted(.dateTime.month(.abbreviated).day()))")
                    .font(.payd(.caption))
                    .foregroundStyle(PaydTheme.textSecondary)
            }
            Spacer()
            Text(Currency.format(settlement.amountMinor, currency: settlement.currency))
                .font(.payd(.subheadline).weight(.bold))
                .foregroundStyle(PaydTheme.emerald)
        }
        .padding(14)
        .paydCard()
    }
}
