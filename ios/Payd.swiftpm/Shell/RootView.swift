import SwiftUI

/// App shell (web/src/app/page.tsx): sticky navbar, the active tab in one vertical scroll view,
/// the floating bottom nav, the voice assistant and the Careem prompt, and the single sheet router.
struct RootView: View {
    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router
    @Environment(AppSettings.self) private var settings

    var body: some View {
        @Bindable var router = router
        ScrollView(.vertical) {
            tabContent
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 112)
                .frame(maxWidth: 1152)
                .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(PaydTheme.canvas.ignoresSafeArea())
        .safeAreaInset(edge: .top, spacing: 0) { Navbar() }
        .overlay(alignment: .bottom) {
            BottomNav()
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
                .frame(maxWidth: 1152)
                .ignoresSafeArea(.keyboard)
        }
        .overlay { VoiceAssistantOverlay() }
        .overlay { CareemEventsHost() }
        .sheet(item: $router.sheet, onDismiss: router.sheetDidDismiss) { sheet in
            PaydSheetContent(sheet: sheet)
                .environment(store)
                .environment(router)
                .environment(settings)
        }
        .ledgerErrorAlert(store, isEnabled: router.sheet == nil)
    }

    @ViewBuilder private var tabContent: some View {
        switch router.tab {
        case .home: HomeView()
        case .groups: GroupsView()
        case .settlements: SettlementsView()
        case .transactions: TransactionsView()
        case .profile: ProfileView()
        }
    }
}
