import OSLog
import PaydCore
import SwiftUI

/// Port of web/src/components/analytics/CashFlowAnalyticsCard.tsx: out-of-pocket exposure, recovery rate and
/// each friend's reimbursement lag, with WhatsApp nudges.
struct HomeCashFlowAnalyticsCard: View {
    @Environment(LedgerStore.self) private var store
    @Environment(\.openURL) private var openURL
    let onNavigateSettlements: () -> Void

    @State private var isExpanded = false

    /// AED 5,000 when the user has no overall budget (CashFlowAnalyticsCard.tsx:35-37).
    private static let defaultBudgetMinor = 500_000
    private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "home")

    private var currency: String { store.currentUser.defaultCurrency }
    private func money(_ minor: Int) -> String { Currency.format(minor, currency: currency) }

    var body: some View {
        let exposure = store.snapshot.cashFlowExposure
        let recoveryDenominator = exposure.totalFrontedMinor - exposure.personalConsumptionMinor
        let recoveryPercent = recoveryDenominator > 0
            ? min(100, PaydMath.roundedPercent(exposure.totalRecoveredMinor, of: recoveryDenominator))
            : 100
        let budget = LedgerQueries.monthlyBudget(for: store.currentUser.id, in: store.state)
        let budgetLimitMinor = budget.map { $0.limitMinor > 0 ? $0.limitMinor : Self.defaultBudgetMinor }
            ?? Self.defaultBudgetMinor
        let exposurePercent = min(100, PaydMath.roundedPercent(exposure.outstandingExposureMinor, of: budgetLimitMinor))

        VStack(alignment: .leading, spacing: 16) {
            HomeAnalyticsHeader(
                systemName: "waveform.path",
                title: "Cash flow health & reimbursement lag",
                badge: "Analytics",
                subtitle: "Personal out-of-pocket exposure & friend settlement turnaround",
                isExpanded: isExpanded,
                chevronColor: PaydTheme.zinc400,
                expandLabel: "Show friend reimbursement details",
                collapseLabel: "Hide friend reimbursement details",
                onToggle: { withAnimation(.easeOut(duration: 0.2)) { isExpanded.toggle() } })

            VStack(spacing: 12) {
                kpiTile(label: "Out-of-pocket exposure", value: money(exposure.outstandingExposureMinor),
                        valueColor: PaydTheme.rose500,
                        caption: "Fronted for others & awaiting repayment", captionColor: PaydTheme.zinc400)
                kpiTile(label: "Settlement recovery rate", value: "\(recoveryPercent)%",
                        valueColor: PaydTheme.emerald500,
                        caption: "\(money(exposure.totalRecoveredMinor)) recovered of fronted share",
                        captionColor: PaydTheme.zinc400)
                kpiTile(label: "Fair share consumption", value: money(exposure.personalConsumptionMinor),
                        valueColor: PaydTheme.slate200,
                        caption: "True personal spend (excluding friends' splits)", captionColor: PaydTheme.slate400)
            }

            progress(recoveryPercent: recoveryPercent, exposurePercent: exposurePercent, exposure: exposure)

            if let lagging = exposure.topLaggingUser, lagging.currentOwedMinor > 0 {
                laggingAlert(lagging)
            }

            if isExpanded {
                roster
                    .transition(.opacity)
            }
        }
        .paydCard(padding: 20, cornerRadius: 16)
        .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
    }

    // MARK: KPI tiles

    private func kpiTile(label: String, value: String, valueColor: Color,
                         caption: String, captionColor: Color) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .paydHeadingFont(size: 10)
                .foregroundStyle(PaydTheme.zinc400)
            Text(value)
                .font(.payd(size: 20, bold: true))
                .foregroundStyle(valueColor)
                .monospacedDigit()
                .padding(.top, 4)
            Text(caption)
                .font(.payd(size: 10))
                .foregroundStyle(captionColor)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .paydCard(padding: 14, cornerRadius: 16, fill: PaydTheme.surface202025, stroke: Color.white.opacity(0.06))
    }

    // MARK: Progress

    private func progress(recoveryPercent: Int, exposurePercent: Int, exposure: CashFlowExposureMetrics) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 8) {
                Text("Capital Float: \(exposurePercent)% of monthly budget")
                    .foregroundStyle(PaydTheme.slate400)
                Spacer(minLength: 0)
                Text("\(money(exposure.totalRecoveredMinor)) paid back / \(money(exposure.totalFrontedMinor)) total fronted")
                    .foregroundStyle(PaydTheme.slate300)
            }
            .font(.payd(size: 11))
            .fixedSize(horizontal: false, vertical: true)

            GeometryReader { proxy in
                let recovered = proxy.size.width * CGFloat(recoveryPercent) / 100
                HStack(spacing: 0) {
                    Rectangle()
                        .fill(PaydTheme.emerald500)
                        .frame(width: max(0, recovered))
                    Rectangle()
                        .fill(PaydTheme.rose500)
                        .frame(width: max(0, proxy.size.width - recovered))
                }
            }
            .frame(height: 8)
            .background(PaydTheme.slate800)
            .clipShape(Capsule())
            .animation(.easeOut(duration: 0.5), value: recoveryPercent)
            .accessibilityElement()
            .accessibilityLabel("Recovered \(recoveryPercent)%, outstanding \(100 - recoveryPercent)%")
        }
    }

    // MARK: Lagging alert

    private func laggingAlert(_ lagging: UserReimbursementVelocity) -> some View {
        let suffix = lagging.avgLagDays == nil
            ? "(no repayment history yet)."
            : "(avg \(lagging.avgLagLabel) lag)."
        return HStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 16))
                    .foregroundStyle(PaydTheme.amber500)
                    .accessibilityHidden(true)
                (Text(lagging.name).font(.payd(size: 12, bold: true)).foregroundStyle(.white)
                    + Text(" owes you \(money(lagging.currentOwedMinor)) \(suffix)").foregroundStyle(PaydTheme.slate300))
                    .font(.payd(size: 12))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            Button {
                nudge(name: lagging.name, owedMinor: lagging.currentOwedMinor)
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "paperplane")
                        .font(.system(size: 12, weight: .semibold))
                        .accessibilityHidden(true)
                    Text("Nudge")
                        .font(.payd(size: 11, bold: true))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(PaydTheme.emerald500, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(PressScaleButtonStyle())
            .fixedSize()
        }
        .padding(12)
        .background(PaydTheme.amber500.opacity(0.1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(PaydTheme.amber500.opacity(0.3)))
    }

    // MARK: Expanded roster

    private var roster: some View {
        let velocities = store.snapshot.reimbursementVelocities
        return VStack(alignment: .leading, spacing: 10) {
            Text("Friend Reimbursement Turnaround (Lag Index)")
                .font(.payd(size: 12, bold: true))
                .homeUppercaseWider(size: 12)
                .foregroundStyle(PaydTheme.slate400)
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: 0) {
                ForEach(Array(velocities.enumerated()), id: \.element.userId) { index, item in
                    if index > 0 {
                        Rectangle().fill(PaydTheme.slate800).frame(height: 1)
                    }
                    rosterRow(item)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(PaydTheme.slate800))

            Button("Open settlements \u{2192}", action: onNavigateSettlements)
                .font(.payd(size: 12, bold: true))
                .foregroundStyle(PaydTheme.brand400)
                .buttonStyle(PressScaleButtonStyle())
        }
        .padding(.top, 8)
        .overlay(alignment: .top) { Rectangle().fill(PaydTheme.slate800).frame(height: 1) }
    }

    private func rosterRow(_ item: UserReimbursementVelocity) -> some View {
        HStack(spacing: 12) {
            HStack(spacing: 10) {
                AvatarView(user: store.user(item.userId), size: 28)
                VStack(alignment: .leading, spacing: 0) {
                    Text(item.name)
                        .font(.payd(size: 12, bold: true))
                        .foregroundStyle(PaydTheme.slate200)
                    (Text("Avg turnaround: ").foregroundStyle(PaydTheme.slate400)
                        + Text(item.avgLagLabel).font(.payd(size: 10, bold: true)).foregroundStyle(PaydTheme.slate300))
                        .font(.payd(size: 10))
                }
            }
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                tierBadge(item.tier)
                if item.currentOwedMinor > 0 {
                    HStack(spacing: 6) {
                        Text(money(item.currentOwedMinor))
                            .font(.payd(size: 12, bold: true))
                            .foregroundStyle(PaydTheme.rose500)
                            .monospacedDigit()
                        Button {
                            nudge(name: item.name, owedMinor: item.currentOwedMinor)
                        } label: {
                            Image(systemName: "paperplane")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(PaydTheme.emerald600)
                                .padding(4)
                                .background(PaydTheme.emerald500.opacity(0.1),
                                            in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                        }
                        .buttonStyle(PressScaleButtonStyle())
                        .accessibilityLabel("Send \(item.name) a friendly WhatsApp reminder")
                    }
                } else {
                    Text("All settled")
                        .font(.payd(size: 11))
                        .foregroundStyle(PaydTheme.slate400)
                }
            }
            .fixedSize()
        }
        .padding(12)
        .background(PaydTheme.slate900)
    }

    private func tierBadge(_ tier: UserReimbursementVelocity.Tier) -> some View {
        let style: (icon: String?, text: String, tint: Color, bg: Color) = switch tier {
        case .speedy: ("bolt.fill", "Speedy \u{26A1}", PaydTheme.emerald400, PaydTheme.emerald500)
        case .average: ("clock", "Average \u{23F1}\u{FE0F}", PaydTheme.blue400, PaydTheme.blue500)
        case .unknown: (nil, "No history", PaydTheme.slate400, PaydTheme.slate500)
        case .lagging: ("exclamationmark.triangle", "Lagging \u{1F422}", PaydTheme.rose400, PaydTheme.rose500)
        }
        return HStack(spacing: 4) {
            if let icon = style.icon {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .semibold))
                    .accessibilityHidden(true)
            }
            Text(style.text)
                .font(.payd(size: 10, bold: true))
        }
        .foregroundStyle(style.tint)
        .padding(.horizontal, 8)
        .padding(.vertical, 2)
        .background(style.bg.opacity(0.1), in: Capsule())
    }

    // MARK: WhatsApp nudge (CashFlowAnalyticsCard.tsx:40-46)

    private func nudge(name: String, owedMinor: Int) {
        let amount = Currency.format(owedMinor, currency: currency)
        let text = "Hi \(PaydFormat.firstName(name)), just checking in on our Payd balance (\(amount)) whenever you get a chance to settle up. Thanks!"
        guard let url = ShareActions.whatsAppURL(text: text) else {
            Self.logger.error("Could not build the WhatsApp nudge URL")
            store.errorMessage = "Couldn't open WhatsApp for this reminder."
            return
        }
        openURL(url) { accepted in
            if !accepted {
                Self.logger.error("WhatsApp nudge URL was not opened")
                store.errorMessage = "Couldn't open WhatsApp for this reminder."
            }
        }
    }
}
