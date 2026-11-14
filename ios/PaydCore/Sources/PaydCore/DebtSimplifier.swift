import Foundation

// Port of web/src/lib/ledger/simplification.ts (greedy min-cash-flow).
// Difference from the web: ties are broken by user ID so the output is deterministic
// (Swift dictionaries have no stable iteration order).

public struct SimplifiedDebt: Codable, Sendable, Hashable {
    public let fromUserId: String
    public let toUserId: String
    public let amountMinor: Int

    public init(fromUserId: String, toUserId: String, amountMinor: Int) {
        self.fromUserId = fromUserId
        self.toUserId = toUserId
        self.amountMinor = amountMinor
    }
}

public enum DebtSimplifier {
    private struct Party {
        let userId: String
        let amount: Int
    }

    /// Settles the largest debtor against the largest creditor until everyone is square.
    public static func simplify(_ netBalances: [String: Int]) -> [SimplifiedDebt] {
        var debtors = netBalances.filter { $0.value < 0 }.map { Party(userId: $0.key, amount: -$0.value) }
        var creditors = netBalances.filter { $0.value > 0 }.map { Party(userId: $0.key, amount: $0.value) }
        var results: [SimplifiedDebt] = []

        while let debtor = largest(in: debtors), let creditor = largest(in: creditors) {
            let amount = min(debtor.amount, creditor.amount)
            results.append(SimplifiedDebt(fromUserId: debtor.userId, toUserId: creditor.userId, amountMinor: amount))
            debtors = reduce(debtors, userId: debtor.userId, by: amount)
            creditors = reduce(creditors, userId: creditor.userId, by: amount)
        }
        return results
    }

    private static func largest(in parties: [Party]) -> Party? {
        parties.min { lhs, rhs in
            lhs.amount != rhs.amount ? lhs.amount > rhs.amount : lhs.userId < rhs.userId
        }
    }

    private static func reduce(_ parties: [Party], userId: String, by amount: Int) -> [Party] {
        parties.compactMap { party in
            guard party.userId == userId else { return party }
            let remaining = party.amount - amount
            return remaining > 0 ? Party(userId: userId, amount: remaining) : nil
        }
    }
}
