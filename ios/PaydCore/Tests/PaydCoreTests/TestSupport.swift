import Foundation
@testable import PaydCore

/// Port of the web tests' `makeRng` (mulberry32), so property tests draw the same sequence.
struct Mulberry32 {
    private var state: UInt32

    init(seed: UInt32) { state = seed }

    /// A number in [0, 1), bit-identical to the JS generator.
    mutating func next() -> Double {
        state = state &+ 0x6D2B_79F5
        var t = state
        t = (t ^ (t >> 15)) &* (t | 1)
        t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
        return Double(t ^ (t >> 14)) / 4_294_967_296
    }

    /// `Math.floor(rnd() * n)`.
    mutating func int(_ upperBound: Double) -> Int { Int((next() * upperBound).rounded(.down)) }
}

/// `randomTotal` from splits.test.ts / balances.test.ts.
func randomTotal(_ rnd: inout Mulberry32) -> Int {
    let r = rnd.next()
    if r < 0.3 { return rnd.int(1000) }
    if r < 0.6 { return rnd.int(10_000_000) }
    return rnd.int(1e10)
}

/// `randomIds` from splits.test.ts.
func randomIds(_ rnd: inout Mulberry32, _ n: Int) -> [String] {
    (0..<n).map { "u\(rnd.int(1000))_\($0)" }
}

extension Shares {
    var sum: Int { values.reduce(0, +) }
}

/// The ISO instant the web tests pin as `NOW`.
func isoDate(_ text: String) -> Date {
    PaydJSON.parseDate(text) ?? PaydJSON.epoch
}

/// A minimal transaction for balance tests.
func txn(_ id: String, _ type: TransactionType = .expense, amount: Int, payer: String, group: String? = nil,
         deleted: Bool = false, at: Date = PaydJSON.epoch) -> Transaction {
    Transaction(id: id, type: type, title: id, amountMinor: amount, payerId: payer, groupId: group, occurredAt: at,
                deletedAt: deleted ? at : nil)
}

func split(_ txnId: String, _ user: String, _ share: Int) -> TransactionSplit {
    TransactionSplit(id: "\(txnId)-\(user)", transactionId: txnId, userId: user, shareMinor: share, createdAt: PaydJSON.epoch)
}

func settlement(_ id: String, from sender: String, to recipient: String, _ amount: Int, group: String? = nil,
                status: SettlementStatus = .settled, at: Date = PaydJSON.epoch) -> Settlement {
    Settlement(id: id, groupId: group, senderId: sender, recipientId: recipient, amountMinor: amount, status: status,
               settledAt: at)
}
