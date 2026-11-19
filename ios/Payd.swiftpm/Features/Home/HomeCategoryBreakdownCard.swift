import PaydCore
import SwiftUI

/// Port of web/src/components/analytics/CategoryBreakdownCard.tsx: my share by category this month,
/// the daily safe burn rate against the monthly budget and the Careem pulse.
struct HomeCategoryBreakdownCard: View {
    @Environment(LedgerStore.self) private var store
    let onNavigateTransactions: () -> Void

    @State private var isExpanded = true

    /// CategoryBreakdownCard.tsx:51 (no budget → AED 5,000; an existing budget is used as is).
    private static let defaultBudgetMinor = 500_000
    /// CATEGORY_COLORS (CategoryBreakdownCard.tsx:14-21).
    private static let barColors: [Color] = [
        PaydTheme.emerald500, PaydTheme.sky500, PaydTheme.zinc400, PaydTheme.amber500, PaydTheme.rose500, PaydTheme.teal500,
    ]

    private struct Runway {
        let budgetLimitMinor: Int
        let remainingMinor: Int
        let daysRemaining: Int
        let dailyAllowanceMinor: Int
        let isPaceHealthy: Bool
    }

    private struct CategoryRow: Identifiable {
        let id: String
        let name: String
        let icon: String
        let totalMinor: Int
    }

    private var currency: String { store.currentUser.defaultCurrency }
    private func money(_ minor: Int) -> String { Currency.format(minor, currency: currency) }

    var body: some View {
        let now = Date()
        let monthName = PaydFormat.monthName(now)
        VStack(alignment: .leading, spacing: 16) {
            HomeAnalyticsHeader(
                systemName: "chart.pie",
                title: "Spending sectors & daily runway",
                badge: "Insights",
                subtitle: "Your share by category & smart daily burn rate for \(monthName)",
                isExpanded: isExpanded,
                chevronColor: PaydTheme.slate400,
                expandLabel: "Expand spending sectors",
                collapseLabel: "Collapse spending sectors",
                onToggle: { withAnimation(.easeOut(duration: 0.15)) { isExpanded.toggle() } })

            if isExpanded {
                expandedContent(now: now, monthName: monthName)
                    .transition(.opacity)
            }
        }
        .paydCard(padding: 20, cornerRadius: 16)
        .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
    }

    @ViewBuilder
    private func expandedContent(now: Date, monthName: String) -> some View {
        let state = store.state
        let me = store.currentUser.id
        let shares = SpendMath.monthlyCategoryShares(userId: me, transactions: state.transactions,
                                                     splits: state.splits, now: now)
        let rows = shares.totals.map { total in
            let category = LedgerQueries.category(total.id, in: state)
            return CategoryRow(id: total.id, name: category?.name ?? "Other / Uncategorized",
                               icon: category?.icon ?? "Tag", totalMinor: total.totalMinor)
        }
        let runway = Self.runway(spentMinor: shares.totalMinor,
                                 budget: LedgerQueries.monthlyBudget(for: me, in: state), now: now)
        let careemTotalMinor = state.transactions
            .filter { SpendMath.isCareemExpense($0) && SpendMath.isSameMonth($0.occurredAt, now) }
            .reduce(0) { $0 + SpendMath.myExpenseShareMinor($1, userId: me, splits: state.splits) }

        VStack(alignment: .leading, spacing: 16) {
            VStack(spacing: 12) {
                runwayTile(runway, monthName: monthName)
                careemTile(careemTotalMinor)
            }
            breakdown(rows: rows, totalMinor: shares.totalMinor)
        }
    }

    /// CategoryBreakdownCard.tsx:47-60 in integer maths
    /// (`spent <= budget / daysInMonth * day` ⇔ `spent * daysInMonth <= budget * day`).
    private static func runway(spentMinor: Int, budget: Budget?, now: Date, calendar: Calendar = .current) -> Runway {
        let budgetLimit = budget?.limitMinor ?? defaultBudgetMinor
        let remaining = max(0, budgetLimit - spentMinor)
        let daysInMonth = calendar.range(of: .day, in: .month, for: now)?.count ?? 30
        let currentDay = calendar.component(.day, from: now)
        let daysRemaining = max(1, daysInMonth - currentDay + 1)
        let (spentScaled, spentOverflow) = spentMinor.multipliedReportingOverflow(by: daysInMonth)
        let (budgetScaled, budgetOverflow) = budgetLimit.multipliedReportingOverflow(by: currentDay)
        let healthy = spentOverflow || budgetOverflow
            ? Decimal(spentMinor) * Decimal(daysInMonth) <= Decimal(budgetLimit) * Decimal(currentDay)
            : spentScaled <= budgetScaled
        return Runway(budgetLimitMinor: budgetLimit, remainingMinor: remaining, daysRemaining: daysRemaining,
                      dailyAllowanceMinor: PaydMath.roundedDiv(remaining, daysRemaining), isPaceHealthy: healthy)
    }

    // MARK: Tiles

    private func tileHeader(icon: String, iconColor: Color, iconSpacing: CGFloat, title: String, titleColor: Color,
                            pill: String, pillText: Color, pillFill: Color) -> some View {
        HStack(alignment: .center, spacing: 8) {
            HStack(spacing: iconSpacing) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(iconColor)
                    .accessibilityHidden(true)
                Text(title)
                    .font(.payd(size: 11, bold: true))
                    .homeUppercaseWider(size: 11)
                    .foregroundStyle(titleColor)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            Text(pill)
                .font(.payd(size: 10, bold: true))
                .textCase(.uppercase)
                .lineLimit(1)
                .foregroundStyle(pillText)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(pillFill, in: Capsule())
                .fixedSize()
        }
    }

    private func runwayTile(_ runway: Runway, monthName: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            tileHeader(icon: "calendar", iconColor: PaydTheme.teal500, iconSpacing: 4, title: "Daily Safe Burn Rate",
                       titleColor: PaydTheme.slate400,
                       pill: runway.isPaceHealthy ? "On Track" : "High Burn",
                       pillText: runway.isPaceHealthy ? PaydTheme.emerald400 : PaydTheme.amber500,
                       pillFill: (runway.isPaceHealthy ? PaydTheme.emerald500 : PaydTheme.amber500).opacity(0.1))
            (Text(money(runway.dailyAllowanceMinor) + " ").font(.payd(size: 24, bold: true)).foregroundStyle(.white)
                + Text("/ day").font(.payd(size: 12)).foregroundStyle(PaydTheme.slate400))
                .monospacedDigit()
                .padding(.top, 4)
            Text("\(runway.daysRemaining) \(runway.daysRemaining == 1 ? "day" : "days") remaining in \(monthName) \u{2022} \(money(runway.remainingMinor)) unspent budget")
                .font(.payd(size: 11))
                .foregroundStyle(PaydTheme.slate400)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .paydCard(padding: 16, cornerRadius: 16, fill: PaydTheme.teal500.opacity(0.06),
                  stroke: PaydTheme.teal500.opacity(0.2))
    }

    private func careemTile(_ totalMinor: Int) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            tileHeader(icon: "bolt.fill", iconColor: PaydTheme.emerald500, iconSpacing: 6,
                       title: "Careem Super-App Pulse", titleColor: PaydTheme.slate200,
                       pill: "Careem Pay Ready", pillText: PaydTheme.emerald400,
                       pillFill: PaydTheme.emerald500.opacity(0.1))
            Text(money(totalMinor))
                .font(.payd(size: 24, bold: true))
                .foregroundStyle(PaydTheme.emerald400)
                .monospacedDigit()
                .padding(.top, 4)
            Text("Your share of Careem rides, food & Quik orders this month")
                .font(.payd(size: 11))
                .foregroundStyle(PaydTheme.slate400)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .paydCard(padding: 16, cornerRadius: 16, fill: PaydTheme.emerald500.opacity(0.06),
                  stroke: PaydTheme.emerald500.opacity(0.25))
    }

    // MARK: Breakdown

    private func breakdown(rows: [CategoryRow], totalMinor: Int) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 8) {
                Text("Category Breakdown")
                    .homeUppercaseWider(size: 12)
                Spacer(minLength: 0)
                HStack(spacing: 8) {
                    Text("Total: \(money(totalMinor))")
                        .homeUppercaseWider(size: 12)
                        .monospacedDigit()
                    Button("Activity \u{2192}", action: onNavigateTransactions)
                        .foregroundStyle(PaydTheme.brand400)
                        .buttonStyle(PressScaleButtonStyle())
                }
                .fixedSize()
            }
            .font(.payd(size: 12, bold: true))
            .foregroundStyle(PaydTheme.slate400)

            if rows.isEmpty {
                Text("No expenses of yours recorded this month yet.")
                    .font(.payd(size: 12))
                    .foregroundStyle(PaydTheme.slate400)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(16)
            } else {
                VStack(spacing: 10) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                        categoryRow(row, percent: totalMinor > 0 ? PaydMath.roundedPercent(row.totalMinor, of: totalMinor) : 0,
                                    color: Self.barColors[index % Self.barColors.count])
                    }
                }
            }
        }
        .padding(.top, 4)
    }

    private func categoryRow(_ row: CategoryRow, percent: Int, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: CategoryIcon.symbol(forLucide: row.icon))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(PaydTheme.slate300)
                        .frame(width: 14, height: 14)
                        .padding(6)
                        .background(PaydTheme.slate800, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .accessibilityHidden(true)
                    Text(row.name)
                        .font(.payd(size: 12, bold: true))
                        .foregroundStyle(PaydTheme.slate200)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                HStack(spacing: 8) {
                    Text("\(percent)%")
                        .font(.payd(size: 11))
                        .foregroundStyle(PaydTheme.slate400)
                    Text(money(row.totalMinor))
                        .font(.payd(size: 12, bold: true))
                        .foregroundStyle(.white)
                }
                .monospacedDigit()
                .fixedSize()
            }
            GeometryReader { proxy in
                Capsule()
                    .fill(color)
                    .frame(width: proxy.size.width * CGFloat(min(max(percent, 0), 100)) / 100)
            }
            .frame(height: 6)
            .background(PaydTheme.slate800, in: Capsule())
            .clipShape(Capsule())
            .animation(.easeOut(duration: 0.5), value: percent)
            .accessibilityHidden(true)
        }
        .paydCard(padding: 12, cornerRadius: 16, fill: PaydTheme.slate850.opacity(0.6), stroke: PaydTheme.slate800)
        .accessibilityElement(children: .combine)
    }
}
