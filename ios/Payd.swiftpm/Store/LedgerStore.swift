import Foundation
import Observation
import OSLog
import PaydCore

/// Single source of truth for the app (web/src/lib/store/PaydContext.tsx). Every change goes through
/// the pure `LedgerActions`, the derived `LedgerSnapshot` is recomputed, and the state is persisted as
/// the web's `payd_state_v3` JSON blob.
@Observable
@MainActor
final class LedgerStore {
    private(set) var state: LedgerState
    /// Everything PaydContext memoises, recomputed on every state change.
    private(set) var snapshot: LedgerSnapshot
    /// User-facing message for load/save problems; the global alert presents and clears it.
    var errorMessage: String?

    var currentUser: User { snapshot.currentUser }

    @ObservationIgnored private let fileURL: URL
    /// False when the saved file exists but couldn't be read or moved aside: writing would overwrite real data.
    @ObservationIgnored private let canSave: Bool

    nonisolated private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "store")
    nonisolated static let defaultFileURL = URL.applicationSupportDirectory.appending(path: "payd_state_v3.json")

    init(fileURL: URL = LedgerStore.defaultFileURL) {
        self.fileURL = fileURL
        let loaded = Self.load(from: fileURL, now: Date())
        self.state = loaded.state
        self.snapshot = LedgerQueries.snapshot(of: loaded.state, now: Date())
        self.errorMessage = loaded.error
        self.canSave = loaded.canSave
    }

    // MARK: - Actions (PaydContext). Throwing ones rethrow `LedgerInvariantError` for inline display.

    @discardableResult
    func addTransaction(_ input: NewTransaction) throws -> LedgerTransaction {
        let (next, txn) = try LedgerActions.addTransaction(input, to: state, context: .live())
        commit(next)
        return txn
    }

    func softDeleteTransaction(_ id: String) {
        commit(LedgerActions.softDeleteTransaction(id, in: state, context: .live()))
    }

    func restoreTransaction(_ id: String) {
        commit(LedgerActions.restoreTransaction(id, in: state, context: .live()))
    }

    @discardableResult
    func recordSettlement(_ input: NewSettlement) throws -> Settlement {
        let (next, settlement) = try LedgerActions.recordSettlement(input, in: state, context: .live())
        commit(next)
        return settlement
    }

    @discardableResult
    func createGroup(name: String, description: String, memberIds: [String]) -> LedgerGroup {
        let (next, group) = LedgerActions.createGroup(name: name, description: description, memberIds: memberIds,
                                                      in: state, context: .live())
        commit(next)
        return group
    }

    func joinGroupByToken(_ input: String) -> JoinGroupResult {
        let (next, result) = LedgerActions.joinGroupByToken(input, in: state, context: .live())
        if next != state { commit(next) }
        return result
    }

    func updateBudget(limitMinor: Int, categoryId: String?) {
        commit(LedgerActions.updateBudget(limitMinor: limitMinor, categoryId: categoryId, in: state, context: .live()))
    }

    func updateUserProfile(_ update: UserProfileUpdate) {
        commit(LedgerActions.updateUserProfile(update, in: state))
    }

    func switchUser(_ userId: String) {
        commit(LedgerActions.switchUser(to: userId, in: state))
    }

    func resetToDemoData() {
        commit(LedgerActions.resetToDemoData(context: .live()))
    }

    @discardableResult
    func addRecurringBill(_ bill: NewRecurringBill) -> RecurringBill {
        let (next, created) = LedgerActions.addRecurringBill(bill, to: state, context: .live())
        commit(next)
        return created
    }

    func deleteRecurringBill(_ id: String) {
        commit(LedgerActions.deleteRecurringBill(id, in: state))
    }

    @discardableResult
    func triggerRecurringBillSplit(_ id: String) throws -> LedgerTransaction {
        let (next, txn) = try LedgerActions.triggerRecurringBillSplit(id, in: state, context: .live())
        commit(next)
        return txn
    }

    // MARK: - Queries over the current state/snapshot

    func groupMembers(_ groupId: String) -> [User] {
        LedgerQueries.groupMembers(groupId, in: state)
    }

    func groupBalances(_ groupId: String) -> Shares {
        LedgerQueries.groupBalances(groupId, in: state)
    }

    func groupSimplifiedDebts(_ groupId: String) -> [SimplifiedDebt] {
        LedgerQueries.groupSimplifiedDebts(groupId, snapshot: snapshot)
    }

    func pairwiseDebt(from: String, to: String, groupId: String?) -> Int {
        LedgerQueries.pairwiseDebt(from: from, to: to, groupId: groupId, snapshot: snapshot)
    }

    func pairDebtBreakdown(_ a: String, _ b: String) -> [PairDebtComponent] {
        LedgerQueries.pairDebtBreakdown(a, b, snapshot: snapshot)
    }

    func validateSettlement(_ input: SettlementValidationInput) -> SettlementValidationResult {
        LedgerQueries.validateSettlement(input, in: state, snapshot: snapshot)
    }

    func user(_ id: String) -> User? {
        LedgerQueries.user(id, in: state)
    }

    // MARK: - Private

    /// Replaces the state, recomputes the snapshot and persists.
    private func commit(_ next: LedgerState) {
        state = next
        snapshot = LedgerQueries.snapshot(of: next, now: Date())
        guard canSave else {
            errorMessage = "Your saved ledger couldn't be opened, so this change is kept in memory only. "
                + "Restart the app to try loading it again."
            return
        }
        do {
            try Self.save(next, to: fileURL)
        } catch {
            Self.logger.error("Save failed: \(error.localizedDescription, privacy: .public)")
            errorMessage = "Saved in memory, but writing to disk failed: \(error.localizedDescription)"
        }
    }

    private static func save(_ state: LedgerState, to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try PaydJSON.encoder.encode(state).write(to: url, options: .atomic)
    }

    /// Missing file → demo seed.
    /// Read failure (e.g. still encrypted before first unlock) → demo seed, file untouched, saving disabled.
    /// Corrupt contents → file moved to a timestamped backup (never deleted), then demo seed.
    private static func load(from url: URL, now: Date) -> (state: LedgerState, error: String?, canSave: Bool) {
        guard FileManager.default.fileExists(atPath: url.path) else { return (SeedData.make(now: now), nil, true) }
        let data: Data
        do {
            data = try Data(contentsOf: url)
        } catch {
            logger.error("Read failed: \(error.localizedDescription, privacy: .public)")
            return (SeedData.make(now: now), "Your saved ledger couldn't be opened (\(error.localizedDescription)). "
                    + "Showing demo data; nothing will be saved until you restart the app.", false)
        }
        do {
            return (try LedgerState.decodeWebBlob(data, now: now), nil, true)
        } catch {
            logger.error("Decode failed: \(String(describing: error), privacy: .public)")
            let backup = url.appendingPathExtension("corrupt-\(PaydJSON.epochMillis(now))")
            do {
                try FileManager.default.moveItem(at: url, to: backup)
            } catch let moveError {
                return (SeedData.make(now: now), "Your saved ledger is damaged and couldn't be backed up "
                        + "(\(moveError.localizedDescription)). Showing demo data; nothing will be saved.", false)
            }
            return (SeedData.make(now: now), "Your saved ledger was damaged (\(error.localizedDescription)). "
                    + "Loaded demo data; the old file was kept as \(backup.lastPathComponent).", true)
        }
    }
}
