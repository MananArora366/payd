import Foundation

// Port of web/src/lib/ledger/splits.ts.
// Invariant 3: the sum of all shares must equal the total exactly. Remainders go to
// participants in ascending user-ID order so every device produces the same result.

public enum LedgerError: Error, Equatable, Sendable, CustomStringConvertible {
    case noParticipants
    case negativeAmount
    case sumMismatch(expected: Int, actual: Int)
    case invalidPercentages(sum: Double)
    case zeroTotalWeight
    case settlementExceedsDebt(amount: Int, debt: Int)
    case selfSettlement
    case missingTitle
    case notFound(String)
    case invalidInvite

    public var description: String {
        switch self {
        case .noParticipants: return "Cannot split with zero participants"
        case .negativeAmount: return "Amounts and weights cannot be negative"
        case let .sumMismatch(expected, actual):
            return "Shares sum to \(actual) minor units, but total is \(expected) (difference: \(expected - actual))"
        case let .invalidPercentages(sum): return "Percentages sum to \(sum)%, but must sum to 100%"
        case .zeroTotalWeight: return "Total shares cannot be zero"
        case let .settlementExceedsDebt(amount, debt):
            return "Settlement of \(amount) exceeds outstanding debt of \(debt)"
        case .selfSettlement: return "Sender and recipient cannot be the same person"
        case .missingTitle: return "A name is required"
        case let .notFound(id): return "Record \(id) was not found"
        case .invalidInvite: return "Invalid or expired invite token"
        }
    }
}

public typealias Shares = [String: Int]

public enum Splits {
    /// Tolerance for percentage inputs such as 33.33 × 3 = 99.99.
    static let percentageTolerance = 0.15

    /// Equal split; duplicate IDs are collapsed and the remainder goes to the lowest IDs first.
    public static func equal(_ totalMinor: Int, among userIds: [String]) throws(LedgerError) -> Shares {
        let sortedIds = Array(Set(userIds)).sorted()
        guard !sortedIds.isEmpty else { throw .noParticipants }
        guard totalMinor >= 0 else { throw .negativeAmount }

        let base = totalMinor / sortedIds.count
        let remainder = totalMinor % sortedIds.count
        let result = Dictionary(uniqueKeysWithValues: sortedIds.enumerated().map { index, id in
            (id, base + (index < remainder ? 1 : 0))
        })
        return try verified(result, total: totalMinor)
    }

    /// Exact split; every share is given and must add up to the total.
    public static func exact(_ totalMinor: Int, allocations: Shares) throws(LedgerError) -> Shares {
        guard allocations.values.allSatisfy({ $0 >= 0 }) else { throw .negativeAmount }
        return try verified(allocations, total: totalMinor)
    }

    /// Percentage split; rounding drift is corrected one minor unit at a time in ID order.
    public static func percentage(_ totalMinor: Int, percentages: [String: Double]) throws(LedgerError) -> Shares {
        let ids = percentages.keys.sorted()
        guard !ids.isEmpty else { throw .noParticipants }
        let percentSum = ids.reduce(0) { $0 + (percentages[$1] ?? 0) }
        guard abs(percentSum - 100) <= percentageTolerance else { throw .invalidPercentages(sum: percentSum) }

        let raw = Dictionary(uniqueKeysWithValues: ids.map { id in
            (id, Int((Double(totalMinor) * (percentages[id] ?? 0) / 100).rounded()))
        })
        return try verified(correctingDrift(raw, ids: ids, total: totalMinor), total: totalMinor)
    }

    /// Weighted split (e.g. 2:1:1); floors each share then hands out the remainder in ID order.
    public static func shares(_ totalMinor: Int, weights: [String: Double]) throws(LedgerError) -> Shares {
        let ids = weights.keys.sorted()
        guard !ids.isEmpty else { throw .noParticipants }
        guard weights.values.allSatisfy({ $0 >= 0 }) else { throw .negativeAmount }
        let totalWeight = weights.values.reduce(0, +)
        guard totalWeight > 0 else { throw .zeroTotalWeight }

        let floored = Dictionary(uniqueKeysWithValues: ids.map { id in
            (id, Int((Double(totalMinor) * (weights[id] ?? 0) / totalWeight).rounded(.down)))
        })
        return try verified(correctingDrift(floored, ids: ids, total: totalMinor), total: totalMinor)
    }

    /// Adds or removes single minor units, cycling through `ids`, until the sum matches `total`.
    static func correctingDrift(_ shares: Shares, ids: [String], total: Int) -> Shares {
        var result = shares
        var diff = total - result.values.reduce(0, +)
        var index = 0
        let maxSteps = max(ids.count * 2, abs(diff) * 2 + ids.count)
        while diff != 0 && index < maxSteps {
            let id = ids[index % ids.count]
            if diff > 0 {
                result[id, default: 0] += 1
                diff -= 1
            } else if result[id, default: 0] > 0 {
                result[id, default: 0] -= 1
                diff += 1
            }
            index += 1
        }
        return result
    }

    static func verified(_ shares: Shares, total: Int) throws(LedgerError) -> Shares {
        let sum = shares.values.reduce(0, +)
        guard sum == total else { throw .sumMismatch(expected: total, actual: sum) }
        return shares
    }
}
