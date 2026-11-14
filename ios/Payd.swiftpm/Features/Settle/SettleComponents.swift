import PaydCore
import SwiftUI
import UIKit

/// Small pure helpers shared by the Settle feature views.
enum SettleText {
    static let currency = "AED" // AED-only ledger (SettlementsView.tsx:35, RecordSettlementModal.tsx:18)

    /// JS `value || fallback` for strings.
    static func nonEmpty(_ text: String?) -> String? {
        guard let text, !text.isEmpty else { return nil }
        return text
    }

    /// SettlementsView.tsx:66-67 `groupName`.
    static func groupName(_ groupId: String?, in state: LedgerState) -> String {
        guard let groupId else { return "Personal (no group)" }
        return nonEmpty(state.groups.first { $0.id == groupId }?.name) ?? "a group"
    }

    /// JSX text with `{a} {b}` pieces renders with HTML whitespace collapsing; empty pieces vanish.
    static func collapsed(_ parts: [String?]) -> String {
        parts.compactMap { nonEmpty($0) }.joined(separator: " ")
    }
}

/// Buttons of the Settle feature (`rounded-xl font-bold active:scale-95`), sized like the web's
/// `py-2 text-xs` / `py-1.5 text-[11px]` rows. `expands` mirrors `flex-1`.
struct SettleButtonStyle: ButtonStyle {
    let fill: Color
    let text: Color
    var stroke: Color? = nil
    var height: CGFloat = 32
    var expands: Bool = true
    var shadow: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(text)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.horizontal, 12)
            .frame(maxWidth: expands ? .infinity : nil, minHeight: height)
            .background(fill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                if let stroke {
                    RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(stroke)
                }
            }
            .shadow(color: shadow ? .black.opacity(0.25) : .clear, radius: 8, y: 4)
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// Icon + text banner used by the Careem Pay sheet (`flex items-start gap-2 p-3 rounded-xl text-xs`).
struct SettleIconBanner: View {
    let text: String
    let systemName: String
    let tint: Color
    let textColor: Color
    let fill: Color
    let stroke: Color

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: systemName)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(tint)
                .padding(.top, 1)
                .accessibilityHidden(true)
            Text(text)
                .font(.payd(size: 12))
                .foregroundStyle(textColor)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(fill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(stroke))
    }
}

extension View {
    /// The Settle tab's toast (SettlementsView.tsx:218-223): `fixed top-20 right-4`, so it stays at the top
    /// of the screen even when the tab is scrolled.
    func settleToast(_ message: Binding<String?>, duration: Double) -> some View {
        modifier(SettleToastModifier(message: message, duration: duration))
    }
}

private struct SettleToastModifier: ViewModifier {
    @Binding var message: String?
    let duration: Double

    /// 64 pt navbar + 16 pt gap below the window's safe area (web `top-20` under the 64 px navbar).
    private static let gapBelowSafeArea: CGFloat = 80

    func body(content: Content) -> some View {
        content.overlay {
            if let text = message {
                GeometryReader { proxy in
                    let top = Self.windowSafeAreaTop + Self.gapBelowSafeArea
                    toast(text)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .offset(y: max(0, top - proxy.frame(in: .global).minY))
                }
                .transition(.move(edge: .top).combined(with: .opacity))
                .task(id: text) {
                    try? await Task.sleep(for: .seconds(duration))
                    guard !Task.isCancelled, message == text else { return }
                    withAnimation { message = nil }
                }
            }
        }
        .animation(.easeOut(duration: 0.2), value: message)
    }

    private func toast(_ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(PaydTheme.emerald400)
                .accessibilityHidden(true)
            Text(text)
                .font(.payd(size: 12))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(PaydTheme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(PaydTheme.brand500.opacity(0.6)))
        .shadow(color: .black.opacity(0.5), radius: 25, y: 12)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isStaticText)
    }

    @MainActor private static var windowSafeAreaTop: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }?
            .keyWindow?.safeAreaInsets.top ?? 0
    }
}
