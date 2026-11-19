import PaydCore
import SwiftUI

/// Tailwind colours the Lens modal uses that the shared theme doesn't define.
enum LensColors {
    /// slate-800 `#1e293b` / slate-900 `#0f172a` (= PaydTheme values; aliased for readability).
    static let slate800 = PaydTheme.slate800
    static let slate900 = PaydTheme.slate900
    /// slate-950 `#020617`.
    static let slate950 = Color(red: 2 / 255, green: 6 / 255, blue: 23 / 255)
}

/// The modal's `py-3 px-4 rounded-2xl text-xs font-semibold` block buttons (and `text-sm` variants).
struct LensBlockButtonStyle: ButtonStyle {
    let fill: Color
    let text: Color
    var fontSize: CGFloat = 12
    var cornerRadius: CGFloat = 16
    var verticalPadding: CGFloat = 12
    var stroke: Color? = nil
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.payd(size: fontSize, bold: true))
            .foregroundStyle(text)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .frame(maxWidth: .infinity)
            .padding(.vertical, verticalPadding)
            .padding(.horizontal, 12)
            .background(fill, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay {
                if let stroke { RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).strokeBorder(stroke) }
            }
            .contentShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .opacity(isEnabled ? 1 : 0.5)
            .scaleEffect(configuration.isPressed && isEnabled ? 0.95 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// Small pill/tag (`text-[10px] px-2 py-0.5 rounded-md`).
struct LensTag: View {
    let text: String
    let fill: Color
    let color: Color
    var bold = false
    var monospaced = false

    var body: some View {
        Text(text)
            .font(monospaced ? .system(size: 10, design: .monospaced) : .payd(size: 10, bold: bold))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(fill, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}

/// `flex flex-wrap` for chips.
struct LensFlowLayout: Layout {
    var spacing: CGFloat = 8

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
                subviews[index].place(at: CGPoint(x: x, y: y + (row.height - size.height) / 2),
                                      proposal: ProposedViewSize(size))
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

    private func arrange(width maxWidth: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var current = Row()
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            if needed > maxWidth, !current.indices.isEmpty {
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

/// The modal's `<select>` (`px-3 py-2 rounded-xl bg-slate-900 border-slate-700 text-slate-200`).
struct LensSelect<Value: Hashable>: View {
    @Binding var selection: Value
    let options: [(value: Value, label: String)]
    let accessibilityLabel: String

    var body: some View {
        Menu {
            Picker(accessibilityLabel, selection: $selection) {
                ForEach(options.indices, id: \.self) { index in
                    Text(options[index].label).tag(options[index].value)
                }
            }
        } label: {
            HStack {
                Text(options.first { $0.value == selection }?.label ?? options.first?.label ?? "")
                    .font(.payd(size: 12))
                    .foregroundStyle(PaydTheme.slate200)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(PaydTheme.slate400)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(minHeight: 36)
            .background(LensColors.slate900, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(PaydTheme.slate700))
            .contentShape(Rectangle())
        }
        .accessibilityLabel(accessibilityLabel)
    }
}

/// The web's `<input type="number" step="0.01" value={(minor / 100).toFixed(2)}>`: edits a draft and reports the
/// parsed fils (`Math.max(0, parseMajorToMinor(value))`) on every keystroke; the draft is reformatted when the
/// value changes from outside.
struct LensMoneyInput: View {
    let minor: Int
    let onChange: (Int) -> Void
    var fontSize: CGFloat = 12
    var color: Color = PaydTheme.slate200
    var fill: Color = LensColors.slate800
    var accessibilityLabel: String

    @State private var draft = ""

    var body: some View {
        TextField("", text: $draft)
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.trailing)
            .font(.payd(size: fontSize, bold: true))
            .foregroundStyle(color)
            .monospacedDigit()
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
            .background(fill, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(PaydTheme.slate700))
            .accessibilityLabel(accessibilityLabel)
            .onAppear { draft = Currency.minorToMajorString(minor) }
            .onChange(of: minor) { _, newValue in
                if Self.parse(draft) != newValue { draft = Currency.minorToMajorString(newValue) }
            }
            .onChange(of: draft) { old, typed in
                let normalized = Currency.normalizeLocaleDecimalInput(typed, decimalSeparator: Locale.current.decimalSeparator ?? ".")
                guard AddExpenseLogic.isNumberKeystroke(normalized) else {
                    draft = old
                    return
                }
                if normalized != typed {
                    draft = normalized
                    return
                }
                let value = Self.parse(normalized)
                if value != minor { onChange(value) }
            }
    }

    private static func parse(_ text: String) -> Int {
        max(0, Currency.parseMajorToMinor(text, currency: "AED"))
    }
}

/// Small inline text input (`px-2 py-1 rounded-lg bg-slate-800 border-slate-700`).
struct LensTextInput: View {
    let placeholder: String
    @Binding var text: String
    var fontSize: CGFloat = 12
    var bold = false
    var fill: Color = LensColors.slate800

    var body: some View {
        TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(PaydTheme.slate500))
            .font(.payd(size: fontSize, bold: bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(fill, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(PaydTheme.slate700))
    }
}

/// JS `Math.round(confidence * 100)` (confidence is not money).
func lensConfidencePercent(_ confidence: Double) -> Int {
    let scaled = (confidence * 100 + 0.5).rounded(.down)
    return scaled.isFinite ? Int(scaled) : 0
}

/// `flex` row whose children share the width by `flex-[n]` weights (e.g. `flex-1` + `flex-[2]`).
struct LensWeightedRow: Layout {
    let weights: [CGFloat]
    var spacing: CGFloat = 12

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let widths = columnWidths(total: proposal.width ?? 320, count: subviews.count)
        let height = zip(subviews, widths).map { $0.sizeThatFits(ProposedViewSize(width: $1, height: nil)).height }.max() ?? 0
        return CGSize(width: proposal.width ?? 320, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        for (subview, width) in zip(subviews, columnWidths(total: bounds.width, count: subviews.count)) {
            subview.place(at: CGPoint(x: x, y: bounds.minY), proposal: ProposedViewSize(width: width, height: bounds.height))
            x += width + spacing
        }
    }

    private func columnWidths(total: CGFloat, count: Int) -> [CGFloat] {
        guard count > 0 else { return [] }
        let weights = (0..<count).map { $0 < self.weights.count ? self.weights[$0] : 1 }
        let sum = weights.reduce(0, +)
        let available = max(0, total - spacing * CGFloat(count - 1))
        return weights.map { available * $0 / sum }
    }
}
