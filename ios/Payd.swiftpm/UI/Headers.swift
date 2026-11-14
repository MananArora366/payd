import SwiftUI

/// Analytics/recurring card header: icon tile, title + badge, subtitle, trailing control.
struct CardHeader<Trailing: View>: View {
    let systemName: String
    let tint: Color
    let title: String
    let badge: String?
    let subtitle: String?
    let trailing: Trailing

    init(systemName: String, tint: Color, title: String, badge: String?, subtitle: String?,
         @ViewBuilder trailing: () -> Trailing) {
        self.systemName = systemName
        self.tint = tint
        self.title = title
        self.badge = badge
        self.subtitle = subtitle
        self.trailing = trailing()
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            IconTile(systemName: systemName, tint: tint, size: 32, iconSize: 16)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(title)
                        .paydHeadingFont(size: 14)
                        .foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                    if let badge { PaydBadge(badge, tint: tint, size: 9) }
                }
                if let subtitle {
                    Text(subtitle)
                        .font(.payd(size: 11))
                        .foregroundStyle(PaydTheme.zinc400)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            trailing
        }
    }
}

extension CardHeader where Trailing == EmptyView {
    init(systemName: String, tint: Color, title: String, badge: String?, subtitle: String?) {
        self.init(systemName: systemName, tint: tint, title: title, badge: badge, subtitle: subtitle) { EmptyView() }
    }
}

/// Section heading (`font-heading text-xs text-zinc-400`) with an optional brand link (`text-xs font-bold text-brand-400`).
struct SectionHeading: View {
    let title: String
    let actionTitle: String?
    let action: (() -> Void)?

    init(_ title: String, actionTitle: String? = nil, action: (() -> Void)? = nil) {
        self.title = title
        self.actionTitle = actionTitle
        self.action = action
    }

    var body: some View {
        HStack {
            Text(title)
                .paydHeadingFont(size: 12)
                .foregroundStyle(PaydTheme.zinc400)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .font(.payd(size: 12, bold: true))
                    .foregroundStyle(PaydTheme.brand400)
                    .buttonStyle(PressScaleButtonStyle())
            }
        }
    }
}

/// Tab screen title (`font-heading text-xl text-white tracking-wide` + `text-xs text-zinc-400`).
struct ScreenTitle: View {
    let title: String
    let subtitle: String

    init(_ title: String, subtitle: String) {
        self.title = title
        self.subtitle = subtitle
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.paydHeading(size: 20))
                .tracking(0.5)
                .foregroundStyle(.white)
                .accessibilityAddTraits(.isHeader)
            Text(subtitle)
                .font(.payd(size: 12))
                .foregroundStyle(PaydTheme.zinc400)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Modal header row (`pb-3 border-b border-white/8`, title `font-heading text-sm`, close X).
struct SheetHeader: View {
    let title: String
    let systemName: String?
    let tint: Color
    let badge: String?
    let subtitle: String?
    let onClose: () -> Void

    init(title: String, systemName: String? = nil, tint: Color = PaydTheme.brand400, badge: String? = nil,
         subtitle: String? = nil, onClose: @escaping () -> Void) {
        self.title = title
        self.systemName = systemName
        self.tint = tint
        self.badge = badge
        self.subtitle = subtitle
        self.onClose = onClose
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 8) {
                if let systemName {
                    Image(systemName: systemName)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(tint)
                        .accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(title)
                            .paydHeadingFont(size: 14)
                            .foregroundStyle(.white)
                            .accessibilityAddTraits(.isHeader)
                        if let badge { PaydBadge(badge, tint: tint, size: 9) }
                    }
                    if let subtitle {
                        Text(subtitle)
                            .font(.payd(size: 11))
                            .foregroundStyle(PaydTheme.zinc400)
                    }
                }
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(PaydTheme.zinc400)
                        .frame(width: 32, height: 32)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
            .padding(.bottom, 12)
            Rectangle().fill(PaydTheme.border).frame(height: 1)
        }
    }
}

/// Form field label (`text-[11px] font-heading text-zinc-400`).
struct FieldLabel: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .paydHeadingFont(size: 11)
            .foregroundStyle(PaydTheme.zinc400)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
