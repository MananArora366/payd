import SwiftUI
import PaydCore

/// Dark card row from the web "Recent Expenses" list.
struct ExpenseRowView: View {
    let transaction: LedgerTransaction
    let category: PaydCore.Category?
    let payerName: String?
    let isPayer: Bool
    /// The current user's split share, if they have one.
    let myShareMinor: Int?

    /// Money coming in (income, refunds) is shown with a plus sign in green.
    private var isInflow: Bool { transaction.type == .income || transaction.type == .refund }

    private var subtitle: String {
        let who = isPayer ? "Paid by you" : "Paid by \(payerName ?? "Unknown")"
        return "\(who) • \(transaction.occurredAt.formatted(.dateTime.month(.abbreviated).day()))"
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: category?.icon ?? "creditcard")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(category?.color ?? PaydTheme.violetLight)
                .frame(width: 44, height: 44)
                .background(PaydTheme.violet.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(transaction.title.isEmpty ? "Untitled Expense" : transaction.title)
                    .font(.payd(.subheadline).weight(.bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.payd(.caption))
                    .foregroundStyle(PaydTheme.textSecondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 2) {
                Text((isInflow ? "+" : "") + Currency.format(transaction.amountMinor, currency: transaction.currency))
                    .font(.payd(.subheadline).weight(.bold))
                    .foregroundStyle(isInflow ? PaydTheme.emerald : .white)
                if !isInflow, let share = myShareMinor {
                    Text((isPayer ? "Your share: " : "You owe: ") + Currency.format(share, currency: transaction.currency))
                        .font(.payd(.caption2).weight(.medium))
                        .foregroundStyle(isPayer ? PaydTheme.emerald : PaydTheme.rose)
                }
            }
        }
        .padding(14)
        .paydCard()
    }
}

extension ExpenseRowView {
    /// Looks up category, payer and the current user's share from the ledger.
    init(transaction: LedgerTransaction, state: LedgerState) {
        let me = state.currentUserId
        self.init(
            transaction: transaction,
            category: LedgerQueries.category(transaction.categoryId, in: state),
            payerName: LedgerQueries.user(transaction.payerId, in: state)?.name,
            isPayer: transaction.payerId == me,
            myShareMinor: LedgerQueries.splits(for: transaction.id, in: state).first { $0.userId == me }?.shareMinor
        )
    }
}
