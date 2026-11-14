import Foundation

// Port of web/src/lib/ledger/simplification.ts (min cash flow).
// Up to 12 non-zero balances: partition into the maximum number of zero-sum subsets (bitmask DP),
// then settle each subset greedily. Above that: plain greedy. Ties keep insertion order.

public struct SimplifiedDebt: Codable, Sendable, Hashable {
    public let fromUserId: String
    public let toUserId: String
    public let amountMinor: Int

    enum CodingKeys: String, CodingKey { case fromUserId, toUserId, amountMinor }

    public init(fromUserId: String, toUserId: String, amountMinor: Int) {
        self.fromUserId = fromUserId
        self.toUserId = toUserId
        self.amountMinor = amountMinor
    }
}

public enum DebtSimplifier {
    /// `EXACT_LIMIT`.
    public static let exactLimit = 12

    private struct Entry {
        let index: Int
        let userId: String
        let balance: Int
    }

    private struct Party {
        let userId: String
        var amount: Int
    }

    /// `simplifyDebts`. Throws when the balances do not sum to zero.
    public static func simplify(_ netBalances: Shares) throws(LedgerInvariantError) -> [SimplifiedDebt] {
        var entries: [Entry] = []
        var total = 0
        for (userId, balance) in netBalances {
            let (sum, overflow) = total.addingReportingOverflow(balance)
            if overflow { throw LedgerInvariantError("Balance for \(userId) is not a finite number") }
            total = sum
            if balance != 0 { entries.append(Entry(index: entries.count, userId: userId, balance: balance)) }
        }
        if total != 0 { throw LedgerInvariantError("Balances do not sum to zero (off by \(total))") }
        if entries.isEmpty { return [] }
        if entries.count > exactLimit { return greedySettle(entries) }

        return partitionZeroSum(entries).flatMap { group in
            greedySettle(group.stableSorted { $0.index < $1.index })
        }
    }

    /// Largest debtor pays largest creditor; arrays are re-sorted (stably) every round like the web.
    private static func greedySettle(_ entries: [Entry]) -> [SimplifiedDebt] {
        var debtors = entries.filter { $0.balance < 0 }.map { Party(userId: $0.userId, amount: -$0.balance) }
        var creditors = entries.filter { $0.balance > 0 }.map { Party(userId: $0.userId, amount: $0.balance) }
        var results: [SimplifiedDebt] = []
        while !debtors.isEmpty && !creditors.isEmpty {
            debtors = debtors.stableSorted { $0.amount > $1.amount }
            creditors = creditors.stableSorted { $0.amount > $1.amount }
            let amount = min(debtors[0].amount, creditors[0].amount)
            if amount > 0 {
                results.append(SimplifiedDebt(fromUserId: debtors[0].userId, toUserId: creditors[0].userId, amountMinor: amount))
            }
            debtors[0].amount -= amount
            creditors[0].amount -= amount
            if debtors[0].amount == 0 { debtors.removeFirst() }
            if creditors[0].amount == 0 { creditors.removeFirst() }
        }
        return results
    }

    private static func partitionZeroSum(_ entries: [Entry]) -> [[Entry]] {
        let n = entries.count
        let size = 1 << n
        var sum = [Int](repeating: 0, count: size)
        for mask in 1..<size {
            let low = mask & -mask
            sum[mask] = sum[mask ^ low] &+ entries[low.trailingZeroBitCount].balance
        }
        var dp = [Int](repeating: 0, count: size)
        for mask in 1..<size {
            var best = 0
            for i in 0..<n where mask & (1 << i) != 0 {
                best = max(best, dp[mask ^ (1 << i)])
            }
            dp[mask] = best + (sum[mask] == 0 ? 1 : 0)
        }
        var groups: [[Entry]] = []
        var current: [Entry] = []
        var mask = size - 1
        while mask != 0 {
            var pick = -1
            var pickValue = -1
            for i in 0..<n where mask & (1 << i) != 0 {
                let value = dp[mask ^ (1 << i)]
                if value > pickValue {
                    pickValue = value
                    pick = i
                }
            }
            current.append(entries[pick])
            mask ^= 1 << pick
            if sum[mask] == 0 {
                groups.append(current)
                current = []
            }
        }
        return groups
    }
}
