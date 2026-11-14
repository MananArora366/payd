import PaydCore
import SwiftUI

// Feature-local UI pieces shared by the Activity tab, AddExpenseView and NewSplitView. They reproduce
// web controls whose sizes differ from the shell's shared components (compact `text-xs` inputs, the
// inline method switchers, the wrapping chip rows).

/// Web-only colours used by these screens that are not in `PaydTheme`.
enum ExpensesPalette {
    /// Tailwind `teal-950`.
    static let teal950 = Color(hex: 0x042F2E)
    /// Tailwind `rose-950`.
    static let rose950 = Color(hex: 0x4C0519)
    /// Tailwind `rose-200`.
    static let rose200 = Color(hex: 0xFECDD3)
    /// The web's literal `#10B981` (accuracy note, income amounts).
    static let income = Color(hex: 0x10B981)
}

/// `flex flex-wrap gap-*`: lays children out left to right and wraps onto new lines.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6
    var lineSpacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let width = rows.map(\.width).max() ?? 0
        let height = rows.reduce(0) { $0 + $1.height } + lineSpacing * CGFloat(max(rows.count - 1, 0))
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y + (row.height - size.height) / 2),
                                      proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + lineSpacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(width maxWidth: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var current = Row()
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            if !current.indices.isEmpty && needed > maxWidth {
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

/// Inline segmented switch: `bg-[#27272a]` track, selected `bg-brand-600 text-white`, others `text-zinc-400`.
struct SwitchPills<Value: Hashable>: View {
    @Binding var selection: Value
    let options: [(value: Value, label: String, accessibilityLabel: String?)]
    var fontSize: CGFloat = 14
    var headingFont: Bool = false
    var fillsWidth: Bool = true
    var trackPadding: CGFloat = 4
    var trackRadius: CGFloat = 16
    var pillRadius: CGFloat = 12
    var pillHeight: CGFloat = 36
    var pillHorizontalPadding: CGFloat = 10
    var spacing: CGFloat = 8

    var body: some View {
        HStack(spacing: spacing) {
            ForEach(options.indices, id: \.self) { index in
                pill(options[index])
            }
        }
        .padding(trackPadding)
        .background(PaydTheme.cardSubtle, in: RoundedRectangle(cornerRadius: trackRadius, style: .continuous))
    }

    private func pill(_ option: (value: Value, label: String, accessibilityLabel: String?)) -> some View {
        let isSelected = option.value == selection
        return Button {
            selection = option.value
        } label: {
            label(option.label)
                .foregroundStyle(isSelected ? .white : PaydTheme.zinc400)
                .lineLimit(1)
                .padding(.horizontal, pillHorizontalPadding)
                .frame(maxWidth: fillsWidth ? .infinity : nil, minHeight: pillHeight)
                .background(isSelected ? PaydTheme.brand600 : .clear,
                            in: RoundedRectangle(cornerRadius: pillRadius, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(option.accessibilityLabel ?? option.label)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    @ViewBuilder private func label(_ text: String) -> some View {
        if headingFont {
            Text(text).paydHeadingFont(size: fontSize)
        } else {
            Text(text).font(.payd(size: fontSize, bold: true))
        }
    }
}

/// Participant pill (`px-3 py-1.5 rounded-full text-xs`, selected `bg-brand-600 text-white font-bold`,
/// otherwise `bg-[#27272a] text-zinc-400`) with a `bg-brand-400/30` initials disc.
struct ParticipantChip: View {
    let title: String
    let initials: String
    let discSize: CGFloat
    let isSelected: Bool
    var accessibilityHint: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(initials)
                    .font(.payd(size: 9, bold: true))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .frame(width: discSize, height: discSize)
                    .background(PaydTheme.brand400.opacity(0.3), in: Circle())
                    .accessibilityHidden(true)
                Text(title)
                    .font(.payd(size: 12, bold: isSelected))
                    .lineLimit(1)
            }
            .foregroundStyle(isSelected ? .white : PaydTheme.zinc400)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(isSelected ? PaydTheme.brand600 : PaydTheme.cardSubtle, in: Capsule())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.97))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityHint(accessibilityHint ?? "")
    }
}

/// Compact text input (`px-2.5 py-1.5 text-xs bg-[#09090b] border-white/10 rounded-lg focus:border-brand-500`).
struct CompactTextField: View {
    let placeholder: String
    @Binding var text: String
    @FocusState private var isFocused: Bool

    var body: some View {
        TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(PaydTheme.zinc600))
            .focused($isFocused)
            .font(.payd(size: 12))
            .foregroundStyle(.white)
            .tint(PaydTheme.brand400)
            .padding(.horizontal, 10)
            .frame(minHeight: 32)
            .background(PaydTheme.canvas, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(isFocused ? PaydTheme.brand500 : Color.white.opacity(0.1)))
    }
}

/// Compact right-aligned number input with a trailing unit (`text-right pr-9 font-semibold` + `AED`/`%`/`x`).
/// Applies the web keystroke filter (`isMoneyKeystroke`, or `isNumberKeystroke` when `allowComma` is false)
/// and the locale decimal-comma fix, like `PaydAmountField`.
struct CompactNumberField: View {
    let placeholder: String
    @Binding var text: String
    let unit: String
    var allowComma: Bool = true
    var accessibilityLabel: String

    @State private var draft: String = ""
    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: 4) {
            TextField("", text: $draft, prompt: Text(placeholder).foregroundStyle(PaydTheme.zinc600))
                .focused($isFocused)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .font(.payd(size: 12, bold: true))
                .monospacedDigit()
                .foregroundStyle(.white)
                .tint(PaydTheme.brand400)
                .accessibilityLabel(accessibilityLabel)
            Text(unit)
                .font(.payd(size: 10, bold: true))
                .foregroundStyle(PaydTheme.zinc500)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 8)
        .frame(minHeight: 32)
        .background(PaydTheme.canvas, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous)
            .strokeBorder(isFocused ? PaydTheme.brand500 : Color.white.opacity(0.1)))
        .onAppear { draft = text }
        .onChange(of: draft) { _, newValue in accept(newValue) }
        .onChange(of: text) { _, newValue in
            if newValue != draft { draft = newValue }
        }
    }

    private func accept(_ typed: String) {
        let separator = Locale.current.decimalSeparator ?? "."
        let normalized = Currency.normalizeLocaleDecimalInput(typed, decimalSeparator: separator)
        let isValid = allowComma ? AddExpenseLogic.isMoneyKeystroke(normalized)
                                 : AddExpenseLogic.isNumberKeystroke(normalized)
        guard isValid else {
            draft = text
            return
        }
        if normalized != typed { draft = normalized }
        if normalized != text { text = normalized }
    }
}

/// `flex items-center gap-1.5 text-[11px] text-[#10B981]` ShieldCheck accuracy note.
struct AccuracyNote: View {
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "checkmark.shield")
                .font(.system(size: 12, weight: .semibold))
                .accessibilityHidden(true)
            Text("Shares always add up to the exact total")
                .font(.payd(size: 11))
        }
        .foregroundStyle(ExpensesPalette.income)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Amber status row (`p-2.5 text-[11px] bg-amber-500/10 border-amber-500/30 text-amber-300 rounded-xl`).
struct AmberNotice: View {
    let text: String
    var onDismiss: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 12, weight: .semibold))
                .padding(.top, 1)
                .accessibilityHidden(true)
            Text(text)
                .font(.payd(size: 11))
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            if let onDismiss {
                Button("OK", action: onDismiss)
                    .font(.payd(size: 11, bold: true))
                    .buttonStyle(.plain)
            }
        }
        .foregroundStyle(PaydTheme.amber300)
        .padding(10)
        .background(PaydTheme.amber500.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(PaydTheme.amber500.opacity(0.3)))
    }
}

/// Full-width form text input with an external focus binding (the shell's `PaydTextField` has none).
struct FocusableTextField: View {
    let placeholder: String
    @Binding var text: String
    var isFocused: FocusState<Bool>.Binding

    var body: some View {
        TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(PaydTheme.zinc600))
            .focused(isFocused)
            .font(.payd(size: 14))
            .foregroundStyle(.white)
            .tint(PaydTheme.brand400)
            .autocorrectionDisabled()
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .background(PaydTheme.canvas, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(isFocused.wrappedValue ? PaydTheme.brand500 : Color.white.opacity(0.1)))
    }
}

extension String {
    /// `s.trim()` for form checks.
    var expensesTrimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
