import Foundation
import Observation
import PaydCore

/// SwiftUI's `Transaction` (animation) shadows PaydCore's, so views use this name.
typealias LedgerTransaction = PaydCore.Transaction

/// Single source of truth for the app. Every change goes through `LedgerActions`
/// (pure functions) and the resulting state is persisted as JSON, mirroring the
/// web app's `payd_state_v1` blob.
@Observable
@MainActor
final class LedgerStore {
    private(set) var state: LedgerState
    /// User-facing message for the most recent failure; views present and clear it.
    var errorMessage: String?

    @ObservationIgnored private let fileURL: URL

    nonisolated static let defaultFileURL = URL.applicationSupportDirectory.appending(path: "payd_state_v1.json")

    init(fileURL: URL = LedgerStore.defaultFileURL) {
        self.fileURL = fileURL
        let loaded = Self.load(from: fileURL)
        self.state = loaded.state
        self.errorMessage = loaded.error
    }

    var currentUserId: String { state.currentUserId }

    var currentCurrency: String {
        LedgerQueries.user(state.currentUserId, in: state)?.defaultCurrency ?? Currency.defaultCode
    }

    /// Records a personal expense paid and fully owned by the current user.
    @discardableResult
    func addPersonalExpense(title: String, amountMinor: Int, categoryId: String?,
                            occurredAt: Date, notes: String?) -> Bool {
        let input = NewTransaction(
            type: .expense, title: title, amountMinor: amountMinor, currency: currentCurrency,
            categoryId: categoryId, payerId: currentUserId, notes: notes, occurredAt: occurredAt,
            splits: [ShareAllocation(userId: currentUserId, shareMinor: amountMinor)]
        )
        return apply { try LedgerActions.addTransaction(input, to: $0).0 }
    }

    @discardableResult
    func softDelete(transactionId: String) -> Bool {
        apply { try LedgerActions.softDelete(transactionId: transactionId, in: $0) }
    }

    // MARK: - Private

    private func apply(_ action: (LedgerState) throws -> LedgerState) -> Bool {
        do {
            state = try action(state)
        } catch {
            errorMessage = String(describing: error)
            return false
        }
        do {
            try Self.save(state, to: fileURL)
        } catch {
            errorMessage = "Saved in memory, but writing to disk failed: \(error.localizedDescription)"
        }
        return true
    }

    private static func save(_ state: LedgerState, to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try PaydJSON.encoder.encode(state).write(to: url, options: .atomic)
    }

    /// Missing file → demo seed. Unreadable file → moved aside (never silently overwritten), then demo seed.
    private static func load(from url: URL) -> (state: LedgerState, error: String?) {
        guard FileManager.default.fileExists(atPath: url.path) else { return (SeedData.make(), nil) }
        do {
            let data = try Data(contentsOf: url)
            return (try PaydJSON.decoder.decode(LedgerState.self, from: data), nil)
        } catch {
            let backup = url.appendingPathExtension("corrupt")
            try? FileManager.default.removeItem(at: backup)
            try? FileManager.default.moveItem(at: url, to: backup)
            return (SeedData.make(), "Saved ledger could not be read (\(error.localizedDescription)). "
                    + "Loaded demo data; the old file was kept as \(backup.lastPathComponent).")
        }
    }
}
