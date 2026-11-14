import SwiftUI

/// `p-3 text-xs bg-rose-500/10 border-rose-500/30 text-rose-400 rounded-xl`.
struct ErrorBanner: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.payd(size: 12))
            .foregroundStyle(PaydTheme.rose400)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .padding(12)
            .background(PaydTheme.rose500.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(PaydTheme.rose500.opacity(0.3)))
            .accessibilityAddTraits(.isStaticText)
    }
}

/// Amber notice, with an "OK" button when dismissible.
struct WarningBanner: View {
    let text: String
    let onDismiss: (() -> Void)?

    init(_ text: String, onDismiss: (() -> Void)? = nil) {
        self.text = text
        self.onDismiss = onDismiss
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(PaydTheme.amber400)
                .accessibilityHidden(true)
            Text(text)
                .font(.payd(size: 12))
                .foregroundStyle(PaydTheme.amber300)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            if let onDismiss {
                Button("OK", action: onDismiss)
                    .font(.payd(size: 12, bold: true))
                    .foregroundStyle(PaydTheme.amber300)
                    .buttonStyle(PressScaleButtonStyle())
            }
        }
        .padding(12)
        .background(PaydTheme.amber500.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(PaydTheme.amber500.opacity(0.3)))
    }
}

/// `bg-emerald-500/15 text-emerald-400` with a check.
struct SuccessBanner: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark")
                .font(.system(size: 13, weight: .bold))
                .accessibilityHidden(true)
            Text(text)
                .font(.payd(size: 12, bold: true))
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(PaydTheme.emerald400)
        .padding(12)
        .background(PaydTheme.emerald500.opacity(0.15), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(PaydTheme.emerald500.opacity(0.3)))
    }
}

/// Small explanatory note with a leading icon (e.g. the accuracy/ShieldCheck notes).
struct InfoNote: View {
    let systemName: String
    let text: String
    let tint: Color

    init(systemName: String = "checkmark.shield", text: String, tint: Color = PaydTheme.emerald500) {
        self.systemName = systemName
        self.text = text
        self.tint = tint
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: systemName)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            Text(text)
                .font(.payd(size: 11))
                .foregroundStyle(PaydTheme.zinc400)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(PaydTheme.canvas.opacity(0.6), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(PaydTheme.border))
    }
}
