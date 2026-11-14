import Foundation

/// Port of `LedgerInvariantError` (web/src/lib/ledger/splits.ts). `reason` is the text passed to the
/// web constructor; `message` equals the web `err.message`.
public struct LedgerInvariantError: Error, Sendable, Equatable, CustomStringConvertible {
    public let reason: String

    public init(_ reason: String) {
        self.reason = reason
    }

    public var message: String { "Ledger Invariant Violation: \(reason)" }
    public var description: String { message }
}
