import PaydCore
import SwiftUI
import UIKit

/// The web's text input (`px-3.5 py-2.5 text-sm bg-[#09090b] border-white/10 rounded-xl focus:border-brand-500`).
struct PaydTextField: View {
    let placeholder: String
    @Binding var text: String
    let isError: Bool
    let prefix: String?
    let suffix: String?
    let keyboard: UIKeyboardType

    init(_ placeholder: String, text: Binding<String>, isError: Bool = false, prefix: String? = nil,
         suffix: String? = nil, keyboard: UIKeyboardType = .default) {
        self.placeholder = placeholder
        self._text = text
        self.isError = isError
        self.prefix = prefix
        self.suffix = suffix
        self.keyboard = keyboard
    }

    var body: some View {
        PaydFieldChrome(isError: isError, prefix: prefix, suffix: suffix) {
            TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(PaydTheme.zinc600))
                .keyboardType(keyboard)
        }
    }
}

/// Money input: decimal pad, rejects keystrokes the web's input filter rejects, and turns a single
/// locale "," typed as the decimal key into "." (`Currency.normalizeLocaleDecimalInput`).
struct PaydAmountField: View {
    let placeholder: String
    @Binding var text: String
    let prefix: String?
    let suffix: String?
    let allowComma: Bool
    let isError: Bool

    @State private var draft: String

    init(_ placeholder: String = "0.00", text: Binding<String>, prefix: String? = "AED", suffix: String? = nil,
         allowComma: Bool = true, isError: Bool = false) {
        self.placeholder = placeholder
        self._text = text
        self.prefix = prefix
        self.suffix = suffix
        self.allowComma = allowComma
        self.isError = isError
        self._draft = State(initialValue: text.wrappedValue)
    }

    var body: some View {
        PaydFieldChrome(isError: isError, prefix: prefix, suffix: suffix) {
            TextField("", text: $draft, prompt: Text(placeholder).foregroundStyle(PaydTheme.zinc600))
                .keyboardType(.decimalPad)
                .monospacedDigit()
        }
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

/// Shared input chrome with focus/error border and optional prefix/suffix labels.
private struct PaydFieldChrome<Field: View>: View {
    let isError: Bool
    let prefix: String?
    let suffix: String?
    @ViewBuilder let field: () -> Field
    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: 8) {
            if let prefix {
                Text(prefix)
                    .font(.payd(size: 14, bold: true))
                    .foregroundStyle(PaydTheme.zinc500)
            }
            field()
                .focused($isFocused)
                .font(.payd(size: 14))
                .foregroundStyle(.white)
                .tint(PaydTheme.brand400)
            if let suffix {
                Text(suffix)
                    .font(.payd(size: 14, bold: true))
                    .foregroundStyle(PaydTheme.zinc500)
            }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 44)
        .background(PaydTheme.canvas, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(borderColor))
        .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .onTapGesture { isFocused = true }
    }

    private var borderColor: Color {
        if isError { return PaydTheme.rose500.opacity(0.6) }
        return isFocused ? PaydTheme.brand500 : Color.white.opacity(0.1)
    }
}

/// Looks like the web `<select>`: dark field with the current label and a chevron, native menu.
struct PaydMenuPicker<Value: Hashable>: View {
    @Binding var selection: Value
    let options: [(value: Value, label: String)]
    let isDisabled: Bool

    init(selection: Binding<Value>, options: [(value: Value, label: String)], isDisabled: Bool = false) {
        self._selection = selection
        self.options = options
        self.isDisabled = isDisabled
    }

    var body: some View {
        Menu {
            Picker("", selection: $selection) {
                ForEach(options.indices, id: \.self) { index in
                    Text(options[index].label).tag(options[index].value)
                }
            }
        } label: {
            HStack {
                Text(currentLabel)
                    .font(.payd(size: 14))
                    .foregroundStyle(isDisabled ? PaydTheme.zinc400 : .white)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Image(systemName: "chevron.down")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PaydTheme.zinc500)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .background(PaydTheme.canvas, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.white.opacity(0.1)))
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .disabled(isDisabled)
        .accessibilityValue(currentLabel)
    }

    private var currentLabel: String {
        options.first { $0.value == selection }?.label ?? ""
    }
}

/// Segmented pill switch (`bg-[#27272a] p-1 rounded-xl`, selected `bg-brand-600 text-white`).
struct SegmentedPills<Value: Hashable>: View {
    @Binding var selection: Value
    let options: [(value: Value, label: String)]

    init(selection: Binding<Value>, options: [(value: Value, label: String)]) {
        self._selection = selection
        self.options = options
    }

    var body: some View {
        HStack(spacing: 4) {
            ForEach(options.indices, id: \.self) { index in
                let option = options[index]
                let isSelected = option.value == selection
                Button {
                    selection = option.value
                } label: {
                    Text(option.label)
                        .font(.payd(size: 12, bold: true))
                        .foregroundStyle(isSelected ? .white : PaydTheme.zinc400)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .background(isSelected ? PaydTheme.brand600 : .clear,
                                    in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleButtonStyle())
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
        }
        .padding(4)
        .background(PaydTheme.cardSubtle, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

/// Participant toggle pill (selected `bg-brand-600 text-white`, else `bg-[#27272a] text-zinc-300`).
struct PersonChip: View {
    let title: String
    let isSelected: Bool
    let leading: String?
    let action: () -> Void

    init(title: String, isSelected: Bool, leading: String? = nil, action: @escaping () -> Void) {
        self.title = title
        self.isSelected = isSelected
        self.leading = leading
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let leading {
                    Text(leading)
                        .font(.payd(size: 9, bold: true))
                        .foregroundStyle(.white)
                        .frame(width: 18, height: 18)
                        .background(isSelected ? Color.white.opacity(0.2) : PaydTheme.zinc700, in: Circle())
                }
                Text(title)
                    .font(.payd(size: 12, bold: true))
                    .lineLimit(1)
            }
            .foregroundStyle(isSelected ? .white : PaydTheme.zinc300)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(isSelected ? PaydTheme.brand600 : PaydTheme.cardSubtle, in: Capsule())
            .overlay(Capsule().strokeBorder(isSelected ? PaydTheme.brand500 : Color.white.opacity(0.08)))
        }
        .buttonStyle(PressScaleButtonStyle())
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
