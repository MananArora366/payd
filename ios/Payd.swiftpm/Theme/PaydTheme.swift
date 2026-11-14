import SwiftUI

/// Design tokens mirrored from the web app's green brand (web/tailwind.config.js, web/src/app/globals.css)
/// plus the Tailwind default palette colours the web components use. The app is dark-only.
enum PaydTheme {
    // MARK: Brand (tailwind.config.js `brand`)
    static let brand50 = Color(hex: 0xF0FDF4)
    static let brand100 = Color(hex: 0xDCFCE7)
    static let brand200 = Color(hex: 0xBBF7D0)
    static let brand300 = Color(hex: 0x86EFAC)
    static let brand400 = Color(hex: 0x4ADE80)
    static let brand500 = Color(hex: 0x22C55E)
    static let brand600 = Color(hex: 0x16A34A)
    static let brand700 = Color(hex: 0x15803D)
    static let brand800 = Color(hex: 0x166534)
    static let brand900 = Color(hex: 0x14532D)
    static let brand950 = Color(hex: 0x052E16)
    static let brandPrimary = brand500
    static let brandLight = brand300
    static let brandDark = brand700
    static let brandSoft = brand500.opacity(0.12)

    // MARK: Brand deep (tailwind.config.js `brand-deep`)
    static let brandDeep300 = Color(hex: 0x5EEAD4)
    static let brandDeep400 = Color(hex: 0x2DD4BF)
    static let brandDeep500 = Color(hex: 0x10B981)
    static let brandDeep600 = Color(hex: 0x059669)
    static let brandDeep700 = Color(hex: 0x047857)

    // MARK: Surfaces
    static let canvas = Color(hex: 0x09090B)
    static let card = Color(hex: 0x18181B)
    static let cardSubtle = Color(hex: 0x27272A)
    static let border = Color.white.opacity(0.08)
    static let foreground = Color(hex: 0xF4F4F5)
    static let textSecondary = Color(hex: 0xA1A1AA)
    static let textMuted = Color(hex: 0x71717A)
    static let slate850 = Color(hex: 0x151518)
    static let slate925 = Color(hex: 0x0F0F12)
    /// Literal `bg-[#…]` surfaces used by web components.
    static let surface202024 = Color(hex: 0x202024)
    static let surface202025 = Color(hex: 0x202025)
    static let surface202028 = Color(hex: 0x202028)
    static let surface22222a = Color(hex: 0x22222A)
    static let surface222227 = Color(hex: 0x222227)
    static let surface3f3f46 = Color(hex: 0x3F3F46)

    // MARK: Tailwind accents
    static let emerald400 = Color(hex: 0x34D399)
    static let emerald500 = Color(hex: 0x10B981)
    static let emerald600 = Color(hex: 0x059669)
    static let emerald950 = Color(hex: 0x022C22)
    static let rose300 = Color(hex: 0xFDA4AF)
    static let rose400 = Color(hex: 0xFB7185)
    static let rose500 = Color(hex: 0xF43F5E)
    static let rose600 = Color(hex: 0xE11D48)
    static let rose700 = Color(hex: 0xBE123C)
    static let amber300 = Color(hex: 0xFCD34D)
    static let amber400 = Color(hex: 0xFBBF24)
    static let amber500 = Color(hex: 0xF59E0B)
    static let amber600 = Color(hex: 0xD97706)
    static let sky400 = Color(hex: 0x38BDF8)
    static let sky500 = Color(hex: 0x0EA5E9)
    static let sky700 = Color(hex: 0x0369A1)
    static let teal400 = Color(hex: 0x2DD4BF)
    static let teal500 = Color(hex: 0x14B8A6)
    static let teal600 = Color(hex: 0x0D9488)
    static let blue400 = Color(hex: 0x60A5FA)
    static let blue500 = Color(hex: 0x3B82F6)
    static let lime300 = Color(hex: 0xBEF264)
    static let red300 = Color(hex: 0xFCA5A5)
    static let red500 = Color(hex: 0xEF4444)
    static let zinc200 = Color(hex: 0xE4E4E7)
    static let zinc300 = Color(hex: 0xD4D4D8)
    static let zinc400 = Color(hex: 0xA1A1AA)
    static let zinc500 = Color(hex: 0x71717A)
    static let zinc600 = Color(hex: 0x52525B)
    static let zinc700 = Color(hex: 0x3F3F46)
    static let zinc800 = Color(hex: 0x27272A)
    static let zinc950 = Color(hex: 0x09090B)
    static let slate200 = Color(hex: 0xE2E8F0)
    static let slate300 = Color(hex: 0xCBD5E1)
    static let slate400 = Color(hex: 0x94A3B8)
    static let slate500 = Color(hex: 0x64748B)
    static let slate700 = Color(hex: 0x334155)
    static let slate800 = Color(hex: 0x1E293B)
    static let slate900 = Color(hex: 0x0F172A)
    static let cyan500 = Color(hex: 0x06B6D4)
    static let pink500 = Color(hex: 0xEC4899)
    static let orange500 = Color(hex: 0xF97316)
    static let yellow200 = Color(hex: 0xFEF08A)
    static let careemGreen = Color(hex: 0x00EA80)

    // MARK: Gradients (tailwind.config.js `backgroundImage`, 135°)
    static let brandGradient = LinearGradient(
        stops: [
            .init(color: Color(hex: 0xBEF264), location: 0),
            .init(color: Color(hex: 0x4ADE80), location: 0.35),
            .init(color: Color(hex: 0x10B981), location: 0.70),
            .init(color: Color(hex: 0x0D9488), location: 1),
        ],
        startPoint: .topLeading, endPoint: .bottomTrailing)

    static let brandHero = LinearGradient(
        stops: [
            .init(color: Color(hex: 0x15803D), location: 0),
            .init(color: Color(hex: 0x047857), location: 0.45),
            .init(color: Color(hex: 0x065F46), location: 0.75),
            .init(color: Color(hex: 0x064E3B), location: 1),
        ],
        startPoint: .topLeading, endPoint: .bottomTrailing)
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255)
    }
}
