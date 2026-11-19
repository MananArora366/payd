import PaydCore
import SwiftUI

/// Small tinted capsule (`px-2 py-0.5 rounded-full bg-<tint>/20 text-<tint> font-heading text-[10px]`).
struct PaydBadge: View {
    let text: String
    let tint: Color
    let bordered: Bool
    let size: CGFloat

    init(_ text: String, tint: Color, bordered: Bool = false, size: CGFloat = 10) {
        self.text = text
        self.tint = tint
        self.bordered = bordered
        self.size = size
    }

    var body: some View {
        Text(text)
            .paydHeadingFont(size: size)
            .lineLimit(1)
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(tint.opacity(0.2), in: Capsule())
            .overlay {
                if bordered { Capsule().strokeBorder(tint.opacity(0.3)) }
            }
    }
}

/// Rounded icon square (`w-8 h-8 rounded-xl bg-<tint>/20 text-<tint>`).
struct IconTile: View {
    let systemName: String
    let tint: Color
    let size: CGFloat
    let iconSize: CGFloat
    let cornerRadius: CGFloat

    init(systemName: String, tint: Color, size: CGFloat = 32, iconSize: CGFloat = 16, cornerRadius: CGFloat = 12) {
        self.systemName = systemName
        self.tint = tint
        self.size = size
        self.iconSize = iconSize
        self.cornerRadius = cornerRadius
    }

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: iconSize, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: size, height: size)
            .background(tint.opacity(0.2), in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// The web's letter discs (`rounded-full bg-zinc-700 text-white font-bold`).
struct InitialsDisc: View {
    let text: String
    let size: CGFloat
    let fill: Color
    let fontSize: CGFloat

    init(_ text: String, size: CGFloat, fill: Color = PaydTheme.zinc700, fontSize: CGFloat = 11) {
        self.text = text
        self.size = size
        self.fill = fill
        self.fontSize = fontSize
    }

    var body: some View {
        Text(text)
            .font(.payd(size: fontSize, bold: true))
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .frame(width: size, height: size)
            .background(fill, in: Circle())
            .accessibilityHidden(true)
    }
}

/// A user's avatar: the web's `initialsAvatar` SVG (mint disc, dark green DM Sans 600 initials) drawn
/// natively, or a remote image with that disc as placeholder.
struct AvatarView: View {
    let user: User?
    let size: CGFloat

    init(user: User?, size: CGFloat) {
        self.user = user
        self.size = size
    }

    var body: some View {
        content
            .frame(width: size, height: size)
            .clipShape(Circle())
            .accessibilityHidden(true)
    }

    @ViewBuilder private var content: some View {
        if let text = user?.avatarUrl, let url = URL(string: text),
           let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else {
                    disc
                }
            }
        } else {
            disc
        }
    }

    private var disc: some View {
        Text(initials)
            .font(.paydHeading(size: size * 0.4))
            .foregroundStyle(PaydTheme.brand900)
            .lineLimit(1)
            .frame(width: size, height: size)
            .background(PaydTheme.brand200)
    }

    /// `initialsAvatar`: first char of each space-separated word, first 2, uppercased.
    private var initials: String {
        let words = (user?.name ?? "").split(separator: " ", omittingEmptySubsequences: true)
        return String(words.compactMap(\.first).prefix(2)).uppercased()
    }
}

/// A formatted money amount (`Currency.format`) with an optional sign prefix.
struct MoneyText: View {
    let minor: Int
    let currency: String
    let prefix: String
    let font: Font
    let color: Color

    init(_ minor: Int, currency: String = "AED", prefix: String = "", font: Font, color: Color) {
        self.minor = minor
        self.currency = currency
        self.prefix = prefix
        self.font = font
        self.color = color
    }

    var body: some View {
        Text(prefix + Currency.format(minor, currency: currency))
            .font(font)
            .foregroundStyle(color)
            .monospacedDigit()
    }
}
