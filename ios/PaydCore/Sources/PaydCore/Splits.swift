import Foundation

// Port of web/src/lib/ledger/splits.ts.
// Invariant 3: the shares always sum exactly to the total. Equal splits give remainders to the first
// IDs in ascending order; percentage/share splits use largest-remainder allocation with exact integer
// maths (ties by ascending user ID). Weights are fixed-point integers scaled by 1_000_000.

public enum Splits {
    /// `WEIGHT_SCALE`.
    public static let weightScale = 1_000_000
    /// `PERCENTAGE_SUM_TOLERANCE` (0.15 %) in the scaled domain.
    public static let percentageSumToleranceScaled = 150_000

    private static func assertValidTotal(_ totalMinor: Int) throws(LedgerInvariantError) {
        if totalMinor < 0 { throw LedgerInvariantError("Total amount cannot be negative") }
    }

    /// `splitEqual`: dedupes, sorts IDs ascending; remainder goes to the first IDs.
    public static func equal(_ totalMinor: Int, among userIds: [String]) throws(LedgerInvariantError) -> Shares {
        if userIds.isEmpty { throw LedgerInvariantError("Cannot split with zero participants") }
        try assertValidTotal(totalMinor)
        let sortedIds = userIds.uniqued().stableSorted(by: jsLess)
        let base = totalMinor / sortedIds.count
        var remainder = totalMinor % sortedIds.count
        var result = Shares()
        for id in sortedIds {
            result.set(id, base + (remainder > 0 ? 1 : 0))
            if remainder > 0 { remainder -= 1 }
        }
        let sum = result.total
        if sum != totalMinor {
            throw LedgerInvariantError("Split sum (\(sum)) does not match totalMinor (\(totalMinor))")
        }
        return result
    }

    /// `splitExact`: every value must be >= 0 and they must sum to the total.
    public static func exact(_ totalMinor: Int, allocations: Shares) throws(LedgerInvariantError) -> Shares {
        try assertValidTotal(totalMinor)
        var result = Shares()
        for (id, value) in allocations {
            if value < 0 { throw LedgerInvariantError("Individual split amount cannot be negative") }
            result.set(id, value)
        }
        let sum = result.total
        if sum != totalMinor {
            throw LedgerInvariantError(
                "Exact split allocations sum to \(sum) minor units, but total is \(totalMinor) minor units (difference: \(totalMinor - sum))")
        }
        return result
    }

    /// `splitPercentage` with percentages already scaled by `weightScale` (33.33 % = 33_330_000).
    public static func percentage(_ totalMinor: Int, scaledPercentages: Shares) throws(LedgerInvariantError) -> Shares {
        try assertValidTotal(totalMinor)
        let userIds = scaledPercentages.keys.stableSorted(by: jsLess)
        if userIds.isEmpty { throw LedgerInvariantError("Cannot split with zero participants") }
        var weights: [String: Int] = [:]
        var scaledSum = 0
        for id in userIds {
            let weight = scaledPercentages[id] ?? 0
            if weight < 0 { throw LedgerInvariantError("Percentage cannot be negative") }
            weights[id] = weight
            scaledSum = try checkedAdd(scaledSum, weight)
        }
        let target = 100 * weightScale
        if abs(scaledSum - target) > percentageSumToleranceScaled {
            let shown = PaydMath.jsNumberString(Decimal(scaledSum) / Decimal(weightScale))
            throw LedgerInvariantError("Percentages sum to \(shown)%, but must sum to 100%")
        }
        return try allocateLargestRemainder(totalMinor, sortedIds: userIds, weights: weights)
    }

    /// `splitShares` with share counts already scaled by `weightScale` (1.5 shares = 1_500_000).
    public static func shares(_ totalMinor: Int, scaledWeights: Shares) throws(LedgerInvariantError) -> Shares {
        try assertValidTotal(totalMinor)
        let userIds = scaledWeights.keys.stableSorted(by: jsLess)
        if userIds.isEmpty { throw LedgerInvariantError("Cannot split with zero participants") }
        var weights: [String: Int] = [:]
        var totalShares = 0
        for id in userIds {
            let weight = scaledWeights[id] ?? 0
            if weight < 0 { throw LedgerInvariantError("Shares cannot be negative") }
            weights[id] = weight
            totalShares = try checkedAdd(totalShares, weight)
        }
        if totalShares == 0 { throw LedgerInvariantError("Total shares cannot be zero") }
        return try allocateLargestRemainder(totalMinor, sortedIds: userIds, weights: weights)
    }

    private static let weightPattern = JSRegex("^\\d+(\\.\\d*)?$|^\\.\\d+$")

    /// Plain non-negative decimal text → weight scaled by 1e6 ("33.33" → 33_330_000).
    /// nil when not `^\d+(\.\d*)?$|^\.\d+$`, more than 6 decimals, or too large for Int.
    public static func parseScaledWeight(_ text: String) -> Int? {
        guard weightPattern.test(text) else { return nil }
        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        let whole = parts.first.map(String.init) ?? ""
        let fraction = parts.count > 1 ? String(parts[1]) : ""
        guard fraction.count <= 6 else { return nil }
        let wholeValue = whole.isEmpty ? 0 : Int(whole)
        let fractionValue = Int(fraction + String(repeating: "0", count: 6 - fraction.count)) ?? 0
        guard let wholeValue else { return nil }
        let (scaled, overflow) = wholeValue.multipliedReportingOverflow(by: weightScale)
        let (sum, addOverflow) = scaled.addingReportingOverflow(fractionValue)
        return overflow || addOverflow ? nil : sum
    }

    private static func checkedAdd(_ a: Int, _ b: Int) throws(LedgerInvariantError) -> Int {
        let (sum, overflow) = a.addingReportingOverflow(b)
        if overflow { throw LedgerInvariantError("Total weight is too large") }
        return sum
    }

    /// Largest-remainder (Hamilton) allocation in exact integer maths (128-bit products).
    private static func allocateLargestRemainder(_ totalMinor: Int, sortedIds: [String],
                                                 weights: [String: Int]) throws(LedgerInvariantError) -> Shares {
        let totalWeight = sortedIds.reduce(0) { $0 + (weights[$1] ?? 0) }
        if totalWeight <= 0 { throw LedgerInvariantError("Total weight cannot be zero") }
        var result = Shares()
        var remainders: [(id: String, rem: Int, order: Int)] = []
        var allocated = 0
        for (order, id) in sortedIds.enumerated() {
            let (base, rem) = PaydMath.mulDiv(totalMinor, weights[id] ?? 0, totalWeight)
            result.set(id, base)
            allocated += base
            remainders.append((id, rem, order))
        }
        var leftover = totalMinor - allocated
        let ranked = remainders.stableSorted { $0.rem != $1.rem ? $0.rem > $1.rem : $0.order < $1.order }
        for entry in ranked where leftover > 0 {
            if entry.rem == 0 { break }
            result.add(entry.id, 1)
            leftover -= 1
        }
        let finalSum = result.total
        if finalSum != totalMinor {
            throw LedgerInvariantError("Weighted split failed invariant: \(finalSum) !== \(totalMinor)")
        }
        return result
    }
}
