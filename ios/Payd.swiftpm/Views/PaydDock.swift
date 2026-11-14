import SwiftUI

enum PaydTab: Hashable, CaseIterable {
    case home, groups, settle, activity

    var title: String {
        switch self {
        case .home: "Home"
        case .groups: "Groups"
        case .settle: "Settle"
        case .activity: "Activity"
        }
    }

    var icon: String {
        switch self {
        case .home: "house"
        case .groups: "person.2"
        case .settle: "banknote"
        case .activity: "doc.text"
        }
    }
}

/// Floating bottom dock from the web app (web/src/components/BottomNav.tsx):
/// Home, Groups, [mic], Settle, Activity.
struct PaydDock: View {
    @Binding var selection: PaydTab
    /// Shows the green dot on Settle when there are open debts.
    let hasOpenDebts: Bool
    let onMic: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            tabButton(.home)
            tabButton(.groups)
            micButton
            tabButton(.settle)
            tabButton(.activity)
        }
        .padding(.horizontal, 8)
        .frame(height: 68)
        .background(PaydTheme.card.opacity(0.92), in: Capsule())
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(PaydTheme.border))
        .shadow(color: .black.opacity(0.5), radius: 20, y: 8)
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
    }

    private func tabButton(_ tab: PaydTab) -> some View {
        let isSelected = selection == tab
        return Button {
            selection = tab
        } label: {
            VStack(spacing: 4) {
                Image(systemName: tab.icon)
                    .font(.system(size: 20, weight: .medium))
                    .symbolVariant(isSelected ? .fill : .none)
                    .overlay(alignment: .topTrailing) {
                        if tab == .settle && hasOpenDebts {
                            Circle().fill(PaydTheme.emerald).frame(width: 8, height: 8).offset(x: 5, y: -3)
                        }
                    }
                Text(tab.title)
                    .font(.payd(.caption2))
            }
            .foregroundStyle(isSelected ? PaydTheme.violetLight : PaydTheme.textMuted)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var micButton: some View {
        Button(action: onMic) {
            Image(systemName: "mic.fill")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(PaydTheme.violet, in: Circle())
                .overlay(Circle().strokeBorder(PaydTheme.canvas, lineWidth: 4))
                .shadow(color: PaydTheme.violet.opacity(0.6), radius: 12)
        }
        .buttonStyle(.plain)
        .offset(y: -16)
        .frame(maxWidth: .infinity)
        .accessibilityLabel("Add expense by voice")
    }
}
