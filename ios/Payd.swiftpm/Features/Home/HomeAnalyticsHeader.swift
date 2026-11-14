import SwiftUI

/// Header row shared by the two analytics cards (CashFlowAnalyticsCard.tsx:51-78, CategoryBreakdownCard.tsx:70-97):
/// `p-2 rounded-xl bg-brand-500/20` icon, `font-heading text-xs` title with a brand badge, `text-[11px]` subtitle
/// and a chevron toggle.
struct HomeAnalyticsHeader: View {
    let systemName: String
    let title: String
    let badge: String
    let subtitle: String
    let isExpanded: Bool
    let chevronColor: Color
    let expandLabel: String
    let collapseLabel: String
    let onToggle: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            Image(systemName: systemName)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(PaydTheme.brand400)
                .frame(width: 32, height: 32)
                .background(PaydTheme.brand500.opacity(0.2), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Text(title)
                        .paydHeadingFont(size: 12)
                        .foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    Text(badge)
                        .paydHeadingFont(size: 9)
                        .lineLimit(1)
                        .foregroundStyle(PaydTheme.brand300)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(PaydTheme.brand500.opacity(0.2), in: Capsule())
                        .overlay(Capsule().strokeBorder(PaydTheme.brand500.opacity(0.3)))
                }
                Text(subtitle)
                    .font(.payd(size: 11))
                    .foregroundStyle(PaydTheme.zinc400)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 8)

            Button(action: onToggle) {
                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(chevronColor)
                    .frame(width: 24, height: 24)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isExpanded ? collapseLabel : expandLabel)
            .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")
        }
    }
}

/// `uppercase tracking-wider` label text (0.05em letter-spacing).
extension Text {
    func homeUppercaseWider(size: CGFloat) -> some View {
        self.tracking(size * 0.05).textCase(.uppercase)
    }
}
