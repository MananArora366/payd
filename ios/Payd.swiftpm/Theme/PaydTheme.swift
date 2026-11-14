import SwiftUI

/// Design tokens mirrored from the web app (web/src/app/globals.css, web/tailwind.config.js).
enum PaydTheme {
    static let canvas = Color(hex: 0x09090B)
    static let card = Color(hex: 0x18181B)
    static let cardSubtle = Color(hex: 0x27272A)
    static let border = Color.white.opacity(0.08)

    static let violet = Color(hex: 0x7C3AED)
    static let violetLight = Color(hex: 0xA78BFA)
    static let violetLabel = Color(hex: 0xC4B5FD)
    static let heroGradient = LinearGradient(colors: [Color(hex: 0x6D28D9), Color(hex: 0x4C1D95)],
                                             startPoint: .topLeading, endPoint: .bottomTrailing)

    static let emerald = Color(hex: 0x10B981)
    static let rose = Color(hex: 0xF43F5E)
    static let amber = Color(hex: 0xF59E0B)

    static let textSecondary = Color(hex: 0xA1A1AA)
    static let textMuted = Color(hex: 0x71717A)
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255)
    }
}

extension View {
    /// Dark card surface with the hairline border used across the web app.
    func paydCard(cornerRadius: CGFloat = 16) -> some View {
        background(PaydTheme.card, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(PaydTheme.border))
    }
}

/// Uppercase, tracked section heading (web `.font-heading`).
struct PaydSectionLabel: View {
    let title: String

    var body: some View {
        Text(title.uppercased())
            .font(.paydHeading(.caption))
            .tracking(1.2)
            .foregroundStyle(PaydTheme.textSecondary)
    }
}

/// Small tinted pill, e.g. "VISION" or "-AED 96.67".
struct PaydBadge: View {
    let text: String
    let tint: Color

    var body: some View {
        Text(text)
            .font(.payd(.caption2).weight(.bold))
            .padding(.horizontal, 10)
            .padding(.vertical, 3)
            .background(tint.opacity(0.15), in: Capsule())
            .foregroundStyle(tint)
    }
}

/// "payd." wordmark from the web navbar.
struct PaydWordmark: View {
    var body: some View {
        HStack(alignment: .lastTextBaseline, spacing: 3) {
            Text("payd")
                .font(.paydLogo(size: 26))
                .tracking(0.5)
                .foregroundStyle(.white)
            Circle()
                .fill(PaydTheme.violet)
                .frame(width: 7, height: 7)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Payd")
    }
}
