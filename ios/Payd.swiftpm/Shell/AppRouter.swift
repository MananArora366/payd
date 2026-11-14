import Observation

/// Navigation state of web/src/app/page.tsx: the active tab, the group to focus on the Groups tab,
/// the one modal that may be open and the hidden voice trigger the dock's mic clicks.
@Observable
@MainActor
final class AppRouter {
    var tab: PaydTab = .home
    /// page.tsx:28 — group to preselect when the Groups tab opens.
    private(set) var focusGroupId: String? = nil
    /// Bumps on every `openGroup`, so re-selecting the same id is still observed.
    private(set) var focusGroupRequest: Int = 0
    var sheet: PaydSheet? = nil
    /// Dock mic taps (web `payd-voice-mic-trigger`).
    private(set) var voiceTriggerCount: Int = 0

    /// Presented once the current sheet has finished dismissing (only one sheet at a time).
    @ObservationIgnored private var pendingSheet: PaydSheet?

    func navigate(_ tab: PaydTab) {
        self.tab = tab
    }

    func openGroup(_ groupId: String) {
        focusGroupId = groupId
        focusGroupRequest += 1
        tab = .groups
    }

    func present(_ sheet: PaydSheet) {
        if self.sheet == nil {
            self.sheet = sheet
        } else {
            pendingSheet = sheet
            self.sheet = nil
        }
    }

    func dismissSheet() {
        pendingSheet = nil
        sheet = nil
    }

    func triggerVoice() {
        voiceTriggerCount += 1
    }

    /// Called by the root `.sheet(onDismiss:)` once a sheet is fully gone.
    func sheetDidDismiss() {
        guard sheet == nil, let next = pendingSheet else { return }
        pendingSheet = nil
        sheet = next
    }
}
