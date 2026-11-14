import SwiftUI

/// Floating bottom navigation (web/src/components/BottomNav.tsx): Home, Groups, [mic], Settle up, Activity.
struct BottomNav: View {
    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router

    private var hasSettlementBadge: Bool {
        store.snapshot.userIOwe > 0 || store.snapshot.userOwedToMe > 0
    }

    var body: some View {
        HStack(spacing: 0) {
            tabButton(.home, title: "Home", icon: "house")
            tabButton(.groups, title: "Groups", icon: "person.2")
            BottomNavMicButton { router.triggerVoice() }
                .frame(maxWidth: .infinity)
            settleButton
            tabButton(.transactions, title: "Activity", icon: "receipt")
        }
        .padding(.horizontal, 12)
        .frame(height: 64)
        .background {
            ZStack {
                Capsule().fill(.ultraThinMaterial)
                Capsule().fill(PaydTheme.card.opacity(0.95))
            }
        }
        .overlay(Capsule().strokeBorder(Color.white.opacity(0.1)))
        .shadow(color: .black.opacity(0.8), radius: 25, y: 25)
    }

    private func tabButton(_ tab: PaydTab, title: String, icon: String) -> some View {
        let isActive = router.tab == tab
        return Button {
            router.navigate(tab)
        } label: {
            label(title: title, icon: icon, isActive: isActive,
                  color: isActive ? PaydTheme.brand400 : PaydTheme.zinc500)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }

    private var settleButton: some View {
        let isActive = router.tab == .settlements
        return Button {
            router.navigate(.settlements)
        } label: {
            label(title: "Settle up", icon: "dollarsign.circle", isActive: true,
                  color: isActive ? PaydTheme.brand300 : PaydTheme.brand400, scaled: isActive, badge: hasSettlementBadge)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(hasSettlementBadge ? "Settle up (open balances)" : "Settle up")
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }

    private func label(title: String, icon: String, isActive: Bool, color: Color,
                       scaled: Bool? = nil, badge: Bool = false) -> some View {
        VStack(spacing: 2) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: isActive ? .semibold : .regular))
                .scaleEffect((scaled ?? isActive) ? 1.1 : 1)
                .overlay(alignment: .topTrailing) {
                    if badge {
                        Circle()
                            .fill(PaydTheme.rose500)
                            .frame(width: 10, height: 10)
                            .overlay(Circle().stroke(PaydTheme.card, lineWidth: 2))
                            .offset(x: 6, y: -4)
                    }
                }
            Text(title)
                .font(.payd(size: 10, bold: isActive))
                .lineLimit(1)
                .fixedSize()
        }
        .foregroundStyle(color)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .animation(.easeOut(duration: 0.15), value: isActive)
    }
}

/// Raised centre FAB with the green glow and pulsing halo.
private struct BottomNavMicButton: View {
    let action: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    var body: some View {
        ZStack {
            Circle()
                .fill(PaydTheme.brand400.opacity(0.4))
                .frame(width: 64, height: 64)
                .blur(radius: 6)
                .opacity(reduceMotion ? 1 : (pulse ? 1 : 0.5))
                .accessibilityHidden(true)
            Button(action: action) {
                Image(systemName: "mic.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(PaydTheme.zinc950)
                    .frame(width: 52, height: 52)
                    .background(PaydTheme.brand400, in: Circle())
                    .padding(4)
                    .background(PaydTheme.canvas, in: Circle())
                    .shadow(color: Color(hex: 0x4ADE80).opacity(0.55), radius: 20)
            }
            .buttonStyle(PressScaleButtonStyle())
            .accessibilityLabel("Speak an expense")
        }
        .offset(y: -16)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) { pulse = true }
        }
    }
}
