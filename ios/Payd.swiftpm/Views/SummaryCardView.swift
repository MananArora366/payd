import SwiftUI
import PaydCore

struct SummaryCardView: View {
    let totalSpentMinor: Int
    let expenseCount: Int
    let owed: OwedSummary
    let currency: String

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Your Spending")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(.secondary)

                Spacer()

                Image(systemName: "creditcard.fill")
                    .font(.subheadline)
                    .foregroundStyle(.tint)
            }

            Text(Currency.format(totalSpentMinor, currency: currency))
                .font(.system(size: 36, weight: .bold, design: .rounded))
                .foregroundStyle(.primary)
                .contentTransition(.numericText())

            HStack(spacing: 16) {
                Label("Owed to you \(Currency.format(owed.owedToMeMinor, currency: currency))",
                      systemImage: "arrow.down.left")
                    .foregroundStyle(.green)
                Label("You owe \(Currency.format(owed.iOweMinor, currency: currency))",
                      systemImage: "arrow.up.right")
                    .foregroundStyle(.red)
            }
            .font(.caption)
            .fontWeight(.medium)

            HStack {
                Label("\(expenseCount) transactions", systemImage: "arrow.left.arrow.right")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                Text("Live Ledger")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.green.opacity(0.15))
                    .foregroundStyle(.green)
                    .clipShape(Capsule())
            }
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(.ultraThinMaterial)
                .shadow(color: .black.opacity(0.06), radius: 10, x: 0, y: 4)
        )
    }
}
