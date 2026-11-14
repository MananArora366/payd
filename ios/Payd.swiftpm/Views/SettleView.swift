import SwiftUI
import PaydCore

/// Who-pays-whom across the user's groups, from PaydCore's simplified debts.
struct SettleView: View {
    @Environment(LedgerStore.self) private var store

    private struct Row: Identifiable {
        let id: String
        let group: PaydCore.Group
        let debt: SimplifiedDebt
    }

    private var rows: [Row] {
        let me = store.currentUserId
        return LedgerQueries.groups(for: me, in: store.state).flatMap { group in
            LedgerQueries.simplifiedDebts(group.id, in: store.state)
                .filter { $0.fromUserId == me || $0.toUserId == me }
                .map { Row(id: "\(group.id)-\($0.fromUserId)-\($0.toUserId)", group: group, debt: $0) }
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PaydScreenTitle(title: "Settle Up")
                PaydSectionLabel(title: "Simplified debts")
                    .padding(.bottom, 4)

                if rows.isEmpty {
                    ContentUnavailableView("You're all settled up", systemImage: "checkmark.seal",
                                           description: Text("Nobody owes anybody in your groups."))
                        .padding(.vertical, 24)
                        .paydCard(cornerRadius: 24)
                }
                ForEach(rows) { row in
                    debtRow(row)
                }
            }
            .padding(16)
        }
        .background(PaydTheme.canvas)
    }

    private func debtRow(_ row: Row) -> some View {
        let iPay = row.debt.fromUserId == store.currentUserId
        let other = LedgerQueries.user(iPay ? row.debt.toUserId : row.debt.fromUserId, in: store.state)?.name ?? "Unknown"
        let tint = iPay ? PaydTheme.rose : PaydTheme.emerald
        return HStack(spacing: 12) {
            Image(systemName: iPay ? "arrow.up.right" : "arrow.down.left")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(tint)
                .frame(width: 44, height: 44)
                .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(iPay ? "You pay \(other)" : "\(other) pays you")
                    .font(.payd(.subheadline).weight(.bold))
                    .foregroundStyle(.white)
                Text(row.group.name)
                    .font(.payd(.caption))
                    .foregroundStyle(PaydTheme.textSecondary)
            }
            Spacer()
            Text(Currency.format(row.debt.amountMinor, currency: row.group.currency))
                .font(.payd(.subheadline).weight(.bold))
                .foregroundStyle(tint)
        }
        .padding(14)
        .paydCard()
    }
}
