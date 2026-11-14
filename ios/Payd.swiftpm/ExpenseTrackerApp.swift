import SwiftUI

@main
struct ExpenseTrackerApp: App {
    @State private var store = LedgerStore()

    init() {
        PaydFonts.register()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .font(.payd(.body))
                // The web app's design language is dark-only
                .preferredColorScheme(.dark)
                .tint(PaydTheme.violet)
        }
    }
}
