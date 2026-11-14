import SwiftUI

@main
struct ExpenseTrackerApp: App {
    @State private var store = LedgerStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(store)
        }
    }
}
