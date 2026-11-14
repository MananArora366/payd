import PaydCore
import SwiftUI
import UIKit

// Feature-local building blocks for the voice, profile, recurring and Careem screens. They exist because
// these web components use classes the shared UI doesn't cover (light-theme `slate-*` inputs whose
// `dark:` variant is undefined, rounded-square avatars, a wrapping chip row).

/// Tailwind default colours used only by this feature's web components.
enum VoiceProfilePalette {
    static let slate100 = Color(hex: 0xF1F5F9)
    static let amber800 = Color(hex: 0x92400E)
    static let amber950 = Color(hex: 0x451A03)
    static let emerald800 = Color(hex: 0x065F46)
    static let blue950 = Color(hex: 0x172554)
}

/// `type="text"` / `inputMode` input with configurable surface (`bg-slate-850 border-slate-200` or
/// `bg-[#09090b] border-white/10`). `slate-750` is not in the web's Tailwind config, so the light
/// `border-slate-200` is what the web actually draws in dark mode.
struct VoiceProfileInput: View {
    enum Kind {
        case text
        /// `type="number"`: digits and "." only, decimal pad.
        case number
        /// `inputMode="decimal"`: decimal pad, a lone locale "," becomes ".".
        case decimal
        /// `type="number"` integer (day of month).
        case integer
        /// Web address: URL keyboard, no autocapitalisation or autocorrection.
        case url
    }

    let placeholder: String
    @Binding var text: String
    var kind: Kind = .text
    var fill: Color = PaydTheme.slate850
    var stroke: Color = PaydTheme.slate200
    var focusColor: Color = PaydTheme.emerald500
    var isError: Bool = false
    var bold: Bool = false
    var prefix: String? = nil
    var prefixColor: Color = PaydTheme.slate400
    var cornerRadius: CGFloat = 12
    var verticalPadding: CGFloat = 10
    var horizontalPadding: CGFloat = 14
    var maxLength: Int? = nil
    var accessibilityLabel: String? = nil
    var autoFocus: Bool = false
    var onSubmit: (() -> Void)? = nil

    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: 8) {
            if let prefix {
                Text(prefix)
                    .font(.payd(size: 12, bold: true))
                    .foregroundStyle(prefixColor)
                    .accessibilityHidden(true)
            }
            TextField("", text: Binding(get: { text }, set: accept),
                      prompt: Text(placeholder).foregroundStyle(PaydTheme.zinc600))
                .focused($isFocused)
                .keyboardType(keyboard)
                .textInputAutocapitalization(kind == .text ? .sentences : .never)
                .autocorrectionDisabled(kind == .url)
                .font(.payd(size: 14, bold: bold))
                .foregroundStyle(PaydTheme.foreground)
                .tint(PaydTheme.brand400)
                .submitLabel(onSubmit == nil ? .done : .send)
                .onSubmit { onSubmit?() }
                .accessibilityLabel(accessibilityLabel ?? placeholder)
        }
        .padding(.horizontal, horizontalPadding)
        .padding(.vertical, verticalPadding)
        .background(fill, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).strokeBorder(borderColor,
                                                                                             lineWidth: isFocused ? 2 : 1))
        .contentShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .onTapGesture { isFocused = true }
        .task {
            guard autoFocus else { return }
            try? await Task.sleep(for: .milliseconds(150))
            isFocused = true
        }
    }

    private var keyboard: UIKeyboardType {
        switch kind {
        case .text: .default
        case .number, .decimal: .decimalPad
        case .integer: .numberPad
        case .url: .URL
        }
    }

    private var borderColor: Color {
        if isError { return PaydTheme.rose500.opacity(0.7) }
        return isFocused ? focusColor : stroke
    }

    private func accept(_ typed: String) {
        var next = typed
        if let maxLength, next.utf16.count > maxLength {
            next = String(next.utf16.prefix(maxLength)) ?? String(next.prefix(maxLength))
        }
        switch kind {
        case .text, .integer, .url:
            break
        case .number:
            next = Currency.normalizeLocaleDecimalInput(next, decimalSeparator: Locale.current.decimalSeparator ?? ".")
            guard AddExpenseLogic.isNumberKeystroke(next) else { return }
        case .decimal:
            next = Currency.normalizeLocaleDecimalInput(next, decimalSeparator: Locale.current.decimalSeparator ?? ".")
        }
        text = next
    }
}

/// A web `<select>` with configurable surface; native menu.
struct VoiceProfileSelect<Value: Hashable>: View {
    @Binding var selection: Value
    let options: [(value: Value, label: String)]
    var fill: Color = PaydTheme.slate850
    var stroke: Color = PaydTheme.slate200
    var textColor: Color = PaydTheme.foreground
    var accessibilityLabel: String

    var body: some View {
        Menu {
            Picker(accessibilityLabel, selection: $selection) {
                ForEach(options.indices, id: \.self) { index in
                    Text(options[index].label).tag(options[index].value)
                }
            }
        } label: {
            HStack(spacing: 6) {
                Text(options.first { $0.value == selection }?.label ?? "")
                    .font(.payd(size: 14))
                    .foregroundStyle(textColor)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(PaydTheme.slate400)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(fill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(stroke))
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .accessibilityLabel(accessibilityLabel)
        .accessibilityValue(options.first { $0.value == selection }?.label ?? "")
    }
}

/// `<img src={avatar_url}>` with an arbitrary corner radius (the shared `AvatarView` is always a circle).
struct VoiceProfileAvatar: View {
    let user: User?
    let size: CGFloat
    let cornerRadius: CGFloat

    var body: some View {
        content
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .accessibilityHidden(true)
    }

    @ViewBuilder private var content: some View {
        if let text = user?.avatarUrl, let url = URL(string: text),
           let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
            AsyncImage(url: url) { phase in
                if let image = phase.image { image.resizable().scaledToFill() } else { disc }
            }
        } else {
            disc
        }
    }

    private var disc: some View {
        let words = (user?.name ?? "").split(separator: " ", omittingEmptySubsequences: true)
        return Text(String(words.compactMap(\.first).prefix(2)).uppercased())
            .font(.paydHeading(size: size * 0.4))
            .foregroundStyle(PaydTheme.brand900)
            .lineLimit(1)
            .frame(width: size, height: size)
            .background(PaydTheme.brand200)
    }
}

/// Inline field error (`mt-1 text-[11px] text-rose-400` with AlertCircle).
struct VoiceProfileFieldError: View {
    let text: String

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "exclamationmark.circle")
                .font(.system(size: 12, weight: .semibold))
                .accessibilityHidden(true)
            Text(text)
                .font(.payd(size: 11))
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(PaydTheme.rose400)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Bordered notice box (`p-3 text-xs bg-<tint>/10 border-<tint>/30 text-<text> rounded-xl`).
struct VoiceProfileNotice: View {
    let text: String
    let tint: Color
    let textColor: Color
    var systemName: String? = nil
    var fontSize: CGFloat = 12
    var bold: Bool = false
    var padding: CGFloat = 12
    var cornerRadius: CGFloat = 12
    var fillOpacity: Double = 0.1

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            if let systemName {
                Image(systemName: systemName)
                    .font(.system(size: 14, weight: .semibold))
                    .accessibilityHidden(true)
            }
            Text(text)
                .font(.payd(size: fontSize, bold: bold))
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(textColor)
        .padding(padding)
        .background(tint.opacity(fillOpacity), in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).strokeBorder(tint.opacity(0.3)))
    }
}

/// `flex flex-wrap gap-*`.
struct VoiceProfileFlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let width = rows.map(\.width).max() ?? 0
        let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(0, rows.count - 1))
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y + (row.height - size.height) / 2), proposal: .unspecified)
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var current = Row()
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            if needed > width, !current.indices.isEmpty {
                rows.append(current)
                current = Row()
            }
            current.width = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            current.height = max(current.height, size.height)
            current.indices.append(index)
        }
        if !current.indices.isEmpty { rows.append(current) }
        return rows
    }
}

/// Plain `rounded-* py-* text-sm font-semibold` button with custom colours and radius.
struct VoiceProfileButtonStyle: ButtonStyle {
    var fill: Color = .clear
    var text: Color
    var stroke: Color? = nil
    var cornerRadius: CGFloat = 12
    var verticalPadding: CGFloat = 10
    var fontSize: CGFloat = 14
    var bold: Bool = true
    var fullWidth: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        VoiceProfileButtonBody(configuration: configuration, style: self)
    }
}

private struct VoiceProfileButtonBody: View {
    let configuration: ButtonStyleConfiguration
    let style: VoiceProfileButtonStyle
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        configuration.label
            .font(.payd(size: style.fontSize, bold: style.bold))
            .foregroundStyle(style.text)
            .frame(maxWidth: style.fullWidth ? .infinity : nil)
            .padding(.vertical, style.verticalPadding)
            .padding(.horizontal, style.fullWidth ? 0 : 10)
            .background(style.fill, in: RoundedRectangle(cornerRadius: style.cornerRadius, style: .continuous))
            .overlay {
                if let stroke = style.stroke {
                    RoundedRectangle(cornerRadius: style.cornerRadius, style: .continuous).strokeBorder(stroke)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: style.cornerRadius, style: .continuous))
            .opacity(isEnabled ? 1 : 0.5)
            .scaleEffect(configuration.isPressed && isEnabled ? 0.95 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

extension String {
    /// JS `s.trim()` (close enough for user-typed text).
    var voiceProfileTrimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
