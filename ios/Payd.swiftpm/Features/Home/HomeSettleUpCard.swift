import PaydCore
import SwiftUI

/// Port of web/src/components/home/SettleUpCard.tsx: who you still need to settle with, largest first,
/// and how few payments it takes. Uses the same netted debts as the Settle up tab.
struct HomeSettleUpCard: View {
    @Environment(LedgerStore.self) private var store
    let onOpenSettleUp: () -> Void

    /// AED-only ledger (SettleUpCard.tsx:8-9).
    private static let currency = "AED"
    private static let maxRows = 4

    private struct Row: Identifiable {
        let user: User
        let netMinor: Int
        var id: String { user.id }
    }

    private var rows: [Row] {
        let me = store.currentUser.id
        let debts = store.snapshot.bilateralDebts
        return store.state.users
            .filter { $0.id != me }
            .map { user in
                let theyOwe = debts[user.id]?[me] ?? 0
                let iOwe = debts[me]?[user.id] ?? 0
                return Row(user: user, netMinor: theyOwe - iOwe)
            }
            .filter { $0.netMinor != 0 }
            .stableSorted { abs($0.netMinor) > abs($1.netMinor) }
    }

    private func subtitle(rowCount: Int) -> String {
        let (before, after) = store.snapshot.simplification
        if rowCount == 0 { return "Everyone is square. New shared expenses will show up here." }
        if after < before {
            return "Payd clears every balance in \(after) payment\(after == 1 ? "" : "s") instead of \(before), fee-free with Careem Pay."
        }
        return "Clear balances in one tap, fee-free with Careem Pay."
    }

    var body: some View {
        let rows = self.rows
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "dollarsign.circle")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(PaydTheme.brand400)
                    .frame(width: 36, height: 36)
                    .background(PaydTheme.brand500.opacity(0.15),
                                in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Settle up")
                        .paydHeadingFont(size: 16)
                        .foregroundStyle(.white)
                        .accessibilityAddTraits(.isHeader)
                    Text(subtitle(rowCount: rows.count))
                        .font(.payd(size: 12))
                        .foregroundStyle(PaydTheme.zinc400)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }

            if rows.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle")
                        .font(.system(size: 16))
                        .accessibilityHidden(true)
                    Text("All settled up")
                        .font(.payd(size: 14))
                }
                .foregroundStyle(PaydTheme.brand300)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(rows.prefix(Self.maxRows).enumerated()), id: \.element.id) { index, row in
                        if index > 0 {
                            Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                        }
                        rowButton(row)
                    }
                }

                Button(action: onOpenSettleUp) {
                    HStack(spacing: 8) {
                        Text(rows.count > Self.maxRows ? "Settle up with all \(rows.count) people" : "Settle up now")
                        Image(systemName: "arrow.right")
                            .font(.system(size: 14, weight: .semibold))
                            .accessibilityHidden(true)
                    }
                }
                .buttonStyle(PaydPrimaryButtonStyle(height: 44))
            }
        }
        .paydCard(padding: 20, cornerRadius: 16, stroke: PaydTheme.brand500.opacity(0.3))
    }

    private func rowButton(_ row: Row) -> some View {
        let owesYou = row.netMinor > 0
        let first = PaydFormat.firstName(row.user.name)
        return Button(action: onOpenSettleUp) {
            HStack(spacing: 12) {
                InitialsDisc(PaydFormat.initialsNavbar(row.user.name), size: 36, fontSize: 12)
                Text(owesYou ? "\(first) owes you" : "You owe \(first)")
                    .font(.payd(size: 14))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text((owesYou ? "+" : "-") + Currency.format(abs(row.netMinor), currency: Self.currency))
                    .font(.payd(size: 14, bold: true))
                    .foregroundStyle(owesYou ? PaydTheme.emerald500 : PaydTheme.rose500)
                    .monospacedDigit()
                    .fixedSize()
            }
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
