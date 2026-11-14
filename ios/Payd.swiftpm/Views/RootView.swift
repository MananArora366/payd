import SwiftUI
import PaydCore

/// App shell: the selected tab plus the floating dock and the voice-entry flow.
struct RootView: View {
    @Environment(LedgerStore.self) private var store

    @State private var tab: PaydTab = .home
    @State private var showingVoice = false
    /// Set by the voice sheet; presented as Add Expense once that sheet has gone.
    @State private var pendingDraft: VoiceExpenseDraft?
    @State private var voiceDraft: DraftItem?

    private struct DraftItem: Identifiable {
        let id = UUID()
        let draft: VoiceExpenseDraft
    }

    private var hasOpenDebts: Bool {
        let owed = LedgerQueries.owedSummary(for: store.currentUserId, in: store.state)
        return owed.iOweMinor > 0 || owed.owedToMeMinor > 0
    }

    var body: some View {
        SwiftUI.Group {
            switch tab {
            case .home: ContentView()
            case .groups: GroupsView()
            case .settle: SettleView()
            case .activity: ActivityView()
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            PaydDock(selection: $tab, hasOpenDebts: hasOpenDebts) { showingVoice = true }
        }
        .sheet(isPresented: $showingVoice, onDismiss: presentPendingDraft) {
            VoiceCaptureView { pendingDraft = $0 }
        }
        .sheet(item: $voiceDraft) { item in
            AddExpenseView(draft: item.draft)
        }
    }

    private func presentPendingDraft() {
        guard let draft = pendingDraft else { return }
        pendingDraft = nil
        voiceDraft = DraftItem(draft: draft)
    }
}

/// Uppercase DM Sans screen title used by the secondary tabs.
struct PaydScreenTitle: View {
    let title: String

    var body: some View {
        Text(title.uppercased())
            .font(.paydHeading(.title2))
            .tracking(1.2)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
