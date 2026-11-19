import PaydCore

/// `PaydCore.Transaction` and `PaydCore.Group` clash with SwiftUI's types, so app code uses these
/// names (and writes the SwiftUI container as `SwiftUI.Group`).
typealias LedgerTransaction = PaydCore.Transaction
typealias LedgerGroup = PaydCore.Group
