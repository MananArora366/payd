import SwiftUI
import PaydCore

struct ExpenseRowView: View {
    let transaction: LedgerTransaction
    let category: PaydCore.Category?

    private var tint: Color { category?.color ?? .gray }

    /// Money coming in (income, refunds) is shown with a plus sign in green.
    private var isInflow: Bool { transaction.type == .income || transaction.type == .refund }

    var body: some View {
        HStack(spacing: 14) {
            // Category Icon Badge
            ZStack {
                Circle()
                    .fill(tint.opacity(0.15))
                    .frame(width: 44, height: 44)

                Image(systemName: category?.icon ?? "ellipsis.circle")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(tint)
            }

            // Title & Date
            VStack(alignment: .leading, spacing: 4) {
                Text(transaction.title.isEmpty ? "Untitled Expense" : transaction.title)
                    .font(.body)
                    .fontWeight(.medium)
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Text(transaction.occurredAt, format: .dateTime.month(.abbreviated).day().hour().minute())
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Text((isInflow ? "+" : "") + Currency.format(transaction.amountMinor, currency: transaction.currency))
                .font(.callout)
                .fontWeight(.semibold)
                .foregroundStyle(isInflow ? .green : .primary)
        }
        .padding(.vertical, 4)
    }
}
