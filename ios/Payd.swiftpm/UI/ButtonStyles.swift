import SwiftUI

/// `active:scale-95`.
struct PressScaleButtonStyle: ButtonStyle {
    var scale: CGFloat = 0.95

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// Shared shape of the web's `rounded-xl text-sm font-semibold` buttons.
private struct PaydButtonBody: View {
    let configuration: ButtonStyleConfiguration
    let height: CGFloat
    let fill: Color
    let text: Color
    let stroke: Color?
    /// `disabled:opacity-50` unless the web button says otherwise (e.g. `disabled:opacity-40`).
    var disabledOpacity: Double = 0.5
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        configuration.label
            .font(.payd(size: 14, bold: true))
            .foregroundStyle(text)
            .frame(maxWidth: .infinity, minHeight: height)
            .padding(.horizontal, 12)
            .background(fill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                if let stroke {
                    RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(stroke)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .opacity(isEnabled ? 1 : disabledOpacity)
            .scaleEffect(configuration.isPressed && isEnabled ? 0.95 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// `bg-brand-400 text-zinc-950`.
struct PaydPrimaryButtonStyle: ButtonStyle {
    var height: CGFloat = 48
    var disabledOpacity: Double = 0.5

    func makeBody(configuration: Configuration) -> some View {
        PaydButtonBody(configuration: configuration, height: height, fill: PaydTheme.brand400,
                       text: PaydTheme.zinc950, stroke: nil, disabledOpacity: disabledOpacity)
    }
}

/// `border border-white/10 text-zinc-300`.
struct PaydSecondaryButtonStyle: ButtonStyle {
    var height: CGFloat = 48

    func makeBody(configuration: Configuration) -> some View {
        PaydButtonBody(configuration: configuration, height: height, fill: .clear,
                       text: PaydTheme.zinc300, stroke: Color.white.opacity(0.1))
    }
}

/// `bg-<tint>/15 text-<tint> border-<tint>/30`.
struct PaydTonalButtonStyle: ButtonStyle {
    let tint: Color
    var height: CGFloat = 40

    func makeBody(configuration: Configuration) -> some View {
        PaydButtonBody(configuration: configuration, height: height, fill: tint.opacity(0.15),
                       text: tint, stroke: tint.opacity(0.3))
    }
}

/// `bg-[#27272a] text-zinc-200`.
struct PaydDarkButtonStyle: ButtonStyle {
    var height: CGFloat = 40

    func makeBody(configuration: Configuration) -> some View {
        PaydButtonBody(configuration: configuration, height: height, fill: PaydTheme.cardSubtle,
                       text: PaydTheme.zinc200, stroke: nil)
    }
}

/// Solid fill with custom text colour (e.g. `bg-emerald-600 text-white`).
struct PaydFilledButtonStyle: ButtonStyle {
    let fill: Color
    let text: Color
    var height: CGFloat = 48
    var disabledOpacity: Double = 0.5

    func makeBody(configuration: Configuration) -> some View {
        PaydButtonBody(configuration: configuration, height: height, fill: fill, text: text, stroke: nil,
                       disabledOpacity: disabledOpacity)
    }
}
