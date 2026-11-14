import SwiftUI
import PaydCore

/// Violet "Total Net Balance" hero card from the web home screen.
struct SummaryCardView: View {
    /// Overall net balance (web `userNetBalance`): positive = owed money.
    let netMinor: Int
    let owed: OwedSummary
    let totalSpentMinor: Int
    let groupCount: Int
    let currency: String
    let onAddExpense: () -> Void
    let onScanReceipt: () -> Void

    /// "-96.67": the currency code is shown separately, as on the web.
    private var netAmountText: String {
        let unsigned = Currency.format(abs(netMinor), currency: currency)
            .replacingOccurrences(of: Currency.symbol(for: currency), with: "")
            .trimmingCharacters(in: .whitespaces)
        return (netMinor < 0 ? "-" : "+") + unsigned
    }

    private var subtitle: String {
        let groups = "\(groupCount) active group\(groupCount == 1 ? "" : "s")"
        if netMinor > 0 { return "You are owed net across \(groups)" }
        if netMinor < 0 { return "You have pending liabilities across \(groups)" }
        return "All active group ledgers are fully balanced"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("TOTAL NET BALANCE")
                .font(.paydHeading(.caption2))
                .tracking(1.2)
                .foregroundStyle(PaydTheme.violetLabel)
                .padding(.bottom, 8)

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(netAmountText)
                    .font(.payd(size: 36).weight(.bold))
                    .contentTransition(.numericText())
                Text(currency)
                    .font(.payd(.subheadline).weight(.bold))
                    .foregroundStyle(PaydTheme.violetLabel)
            }

            Text(subtitle)
                .font(.payd(.caption))
                .foregroundStyle(.white.opacity(0.8))
                .padding(.top, 4)

            Rectangle()
                .fill(.white.opacity(0.2))
                .frame(height: 1)
                .padding(.vertical, 16)

            HStack {
                balanceStat(title: "Owed to you", dot: PaydTheme.emerald,
                            value: "+" + Currency.format(owed.owedToMeMinor, currency: currency))
                Spacer()
                balanceStat(title: "You owe", dot: PaydTheme.rose,
                            value: "-" + Currency.format(owed.iOweMinor, currency: currency))
            }

            Text("Your spending • \(Currency.format(totalSpentMinor, currency: currency))")
                .font(.payd(.caption).weight(.bold))
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(PaydTheme.violet.opacity(0.3), in: Capsule())
                .overlay(Capsule().strokeBorder(PaydTheme.violetLight.opacity(0.3)))
                .foregroundStyle(Color(hex: 0xDDD6FE))
                .padding(.top, 12)

            HStack(spacing: 10) {
                Button(action: onAddExpense) {
                    Label("Add Expense", systemImage: "plus")
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(.white, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .foregroundStyle(Color(hex: 0x4C1D95))
                }
                Button(action: onScanReceipt) {
                    Label("Scan Receipt", systemImage: "camera.viewfinder")
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(.white.opacity(0.15), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(.white.opacity(0.2)))
                        .foregroundStyle(.white)
                }
            }
            .font(.payd(.footnote).weight(.bold))
            .buttonStyle(.plain)
            .padding(.top, 20)
        }
        .foregroundStyle(.white)
        .padding(24)
        .background(PaydTheme.heroGradient, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .shadow(color: Color(hex: 0x4C1D95).opacity(0.4), radius: 24, y: 12)
    }

    private func balanceStat(title: String, dot: Color, value: String) -> some View {
        HStack(spacing: 8) {
            Circle().fill(dot).frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 2) {
                Text(title.uppercased())
                    .font(.payd(.caption2).weight(.semibold))
                    .tracking(0.8)
                    .foregroundStyle(.white.opacity(0.7))
                Text(value)
                    .font(.payd(.subheadline).weight(.bold))
            }
        }
    }
}
