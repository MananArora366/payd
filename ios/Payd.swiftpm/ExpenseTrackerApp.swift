import OSLog
import PaydCore
import SwiftUI

@main
struct ExpenseTrackerApp: App {
    @State private var store: LedgerStore
    @State private var settings: AppSettings
    @State private var router: AppRouter

    private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "app")

    init() {
        PaydFonts.register()
        _store = State(initialValue: LedgerStore())
        _settings = State(initialValue: AppSettings())
        _router = State(initialValue: AppRouter())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(settings)
                .environment(router)
                .font(.payd(size: 16))
                .foregroundStyle(PaydTheme.foreground)
                .background(PaydTheme.canvas.ignoresSafeArea())
                // The web app's <html> always has class "dark"
                .preferredColorScheme(.dark)
                .tint(PaydTheme.brand400)
                .onOpenURL(perform: handle)
        }
    }

    /// `payd://join/<token>` → the join-invite sheet (web route /join/[token]).
    private func handle(_ url: URL) {
        guard url.scheme?.lowercased() == "payd", url.host?.lowercased() == "join" else {
            Self.logger.notice("Ignored URL \(url.absoluteString, privacy: .public)")
            return
        }
        router.present(.joinInvite(token: GroupLogic.extractInviteToken(url.absoluteString)))
    }
}
