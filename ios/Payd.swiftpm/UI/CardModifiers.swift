import SwiftUI

extension View {
    /// Dark card surface with the hairline border used across the web app (`p-5 rounded-2xl bg-[#18181b] border-white/8`).
    func paydCard(padding: CGFloat = 20, cornerRadius: CGFloat = 16, fill: Color = PaydTheme.card,
                  stroke: Color = PaydTheme.border) -> some View {
        self.padding(padding)
            .background(fill, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).strokeBorder(stroke))
    }

    /// Top toast that clears `message` after `duration` seconds (web `setTimeout`).
    func paydToast(_ message: Binding<String?>, duration: Double) -> some View {
        modifier(PaydToastModifier(message: message, duration: duration))
    }
}

private struct PaydToastModifier: ViewModifier {
    @Binding var message: String?
    let duration: Double

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let text = message {
                Text(text)
                    .font(.payd(size: 12, bold: true))
                    .foregroundStyle(PaydTheme.emerald400)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(PaydTheme.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(PaydTheme.emerald500.opacity(0.3)))
                    .shadow(color: .black.opacity(0.5), radius: 16, y: 6)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .accessibilityAddTraits(.isStaticText)
                    .task(id: text) {
                        try? await Task.sleep(for: .seconds(duration))
                        guard !Task.isCancelled, message == text else { return }
                        withAnimation { message = nil }
                    }
            }
        }
        .animation(.easeOut(duration: 0.2), value: message)
    }
}
