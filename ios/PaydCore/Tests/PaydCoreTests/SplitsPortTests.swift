import Foundation
import Testing
@testable import PaydCore

/// Port of web/src/lib/ledger/__tests__/splits.test.ts. Percentages and share counts are passed
/// already scaled by `Splits.weightScale` (the app parses them from text with `parseScaledWeight`).
/// Non-integer / NaN totals cannot be expressed with `Int` and are not applicable.
struct SplitsPortTests {
    private let scale = Splits.weightScale

    private func pct(_ pairs: KeyValuePairs<String, Double>) -> Shares {
        Shares(pairs.map { ($0.key, Int(($0.value * Double(scale)).rounded())) })
    }

    @Test("gives remainder fils to the first IDs in ascending string order")
    func equalRemainder() throws {
        #expect(try Splits.equal(10003, among: ["d", "b", "a", "c"]) == ["a": 2501, "b": 2501, "c": 2501, "d": 2500])
        #expect(try Splits.equal(101, among: ["u2", "u10"]) == ["u10": 51, "u2": 50])
    }

    @Test("dedupes participants")
    func equalDedupes() throws {
        #expect(try Splits.equal(100, among: ["a", "a", "b"]) == ["a": 50, "b": 50])
    }

    @Test("rejects empty, negative and non-integer totals")
    func equalRejects() {
        #expect(throws: LedgerInvariantError("Cannot split with zero participants")) { try Splits.equal(100, among: []) }
        #expect(throws: LedgerInvariantError("Total amount cannot be negative")) { try Splits.equal(-1, among: ["a"]) }
    }

    @Test("property: sums exactly, spread <= 1 (20k cases)")
    func equalProperty() throws {
        var rnd = Mulberry32(seed: 1)
        for _ in 0..<20000 {
            let total = randomTotal(&rnd)
            let ids = randomIds(&rnd, 1 + rnd.int(12))
            let result = try Splits.equal(total, among: ids)
            #expect(result.sum == total)
            #expect(result.values.allSatisfy { $0 >= 0 })
            #expect((result.values.max() ?? 0) - (result.values.min() ?? 0) <= 1)
        }
    }

    @Test("accepts exact integer allocations")
    func exactAccepts() throws {
        #expect(try Splits.exact(10000, allocations: ["a": 6000, "b": 4000]) == ["a": 6000, "b": 4000])
        #expect(try Splits.exact(5000, allocations: ["a": 3000, "b": 2000]) == ["a": 3000, "b": 2000])
        #expect(try Splits.exact(0, allocations: ["a": 0]) == ["a": 0])
    }

    @Test("rejects wrong sums, fractions, negatives and non-finite values")
    func exactRejects() {
        #expect(throws: LedgerInvariantError(
            "Exact split allocations sum to 9999 minor units, but total is 10000 minor units (difference: 1)")) {
            try Splits.exact(10000, allocations: ["a": 6000, "b": 3999])
        }
        #expect(throws: LedgerInvariantError("Individual split amount cannot be negative")) {
            try Splits.exact(100, allocations: ["a": 150, "b": -50])
        }
        #expect(throws: LedgerInvariantError("Total amount cannot be negative")) {
            try Splits.exact(-100, allocations: ["a": -100])
        }
    }

    @Test("handles round percentages exactly")
    func percentRound() throws {
        #expect(try Splits.percentage(10000, scaledPercentages: pct(["u1": 50, "u2": 25, "u3": 25])) == ["u1": 5000, "u2": 2500, "u3": 2500])
        #expect(try Splits.percentage(10000, scaledPercentages: pct(["u1": 50, "u2": 30, "u3": 20])) == ["u1": 5000, "u2": 3000, "u3": 2000])
    }

    @Test("33.33 x 3 does not throw at any size (QA regression) and splits evenly")
    func percentThirds() throws {
        for aed in [10, 50, 100, 300, 1000, 5000, 1_000_000, 100_000_000] {
            let total = aed * 100
            let result = try Splits.percentage(total, scaledPercentages: pct(["a": 33.33, "b": 33.33, "c": 33.33]))
            #expect(result.sum == total)
            #expect((result.values.max() ?? 0) - (result.values.min() ?? 0) <= 1)
        }
        #expect(try Splits.percentage(100, scaledPercentages: pct(["c": 33.33, "a": 33.33, "b": 33.34])) == ["a": 33, "b": 34, "c": 33])
    }

    @Test("gives leftover fils to the largest remainders, ties by ascending ID")
    func percentLeftovers() throws {
        #expect(try Splits.percentage(1000, scaledPercentages: pct(["x": 12.5, "y": 12.5, "z": 75])) == ["x": 125, "y": 125, "z": 750])
        #expect(try Splits.percentage(10, scaledPercentages: pct(["b": 15, "a": 15, "c": 70])) == ["a": 2, "b": 1, "c": 7])
        #expect(try Splits.percentage(7, scaledPercentages: pct(["a": 10, "b": 20, "c": 70])) == ["a": 1, "b": 1, "c": 5])
    }

    @Test("a 0% participant gets nothing")
    func percentZero() throws {
        let result = try Splits.percentage(101, scaledPercentages: pct(["a": 0, "b": 50, "c": 50]))
        #expect(result["a"] == 0)
        #expect(result.sum == 101)
    }

    @Test("validates input")
    func percentValidates() {
        #expect(throws: LedgerInvariantError("Percentages sum to 90%, but must sum to 100%")) {
            try Splits.percentage(10000, scaledPercentages: pct(["u1": 50, "u2": 40]))
        }
        #expect(throws: LedgerInvariantError("Percentage cannot be negative")) {
            try Splits.percentage(10000, scaledPercentages: pct(["u1": 120, "u2": -20]))
        }
        #expect(throws: LedgerInvariantError("Cannot split with zero participants")) {
            try Splits.percentage(10000, scaledPercentages: [:])
        }
        #expect(throws: LedgerInvariantError("Total amount cannot be negative")) {
            try Splits.percentage(-100, scaledPercentages: pct(["a": 100]))
        }
        #expect(throws: Never.self) { try Splits.percentage(10000, scaledPercentages: pct(["a": 50, "b": 49.85])) }
        #expect(throws: Never.self) { try Splits.percentage(10000, scaledPercentages: pct(["a": 50, "b": 50.15])) }
        #expect(throws: LedgerInvariantError("Percentages sum to 100.2%, but must sum to 100%")) {
            try Splits.percentage(10000, scaledPercentages: pct(["a": 50, "b": 50.2]))
        }
    }

    @Test("property: 20k random 2dp percentages, totals up to 1e10 fils")
    func percentProperty() throws {
        var rnd = Mulberry32(seed: 2024)
        for _ in 0..<20000 {
            let total = randomTotal(&rnd)
            let ids = randomIds(&rnd, 1 + rnd.int(12))
            let raw = ids.map { _ in rnd.next() < 0.1 ? 0 : rnd.next() + 0.01 }
            let rawSum = raw.reduce(0, +)
            let s = rawSum == 0 ? 1 : rawSum
            // Math.round(raw / s * 10000) / 100, kept as integer hundredths.
            var hundredths = Shares(zip(ids, raw).map { ($0, Int(PaydMath.jsRound($1 / s * 10000))) })
            if raw.allSatisfy({ $0 == 0 }), let first = ids.first { hundredths = hundredths.setting(first, 10000) }
            let hundredthsSum = hundredths.sum
            if abs(hundredthsSum - 10000) > 15 { continue }

            let result = try Splits.percentage(total, scaledPercentages: hundredths.mapValues { $0 * 10_000 })
            #expect(result.sum == total)
            #expect(result.values.allSatisfy { $0 >= 0 })
            for id in ids {
                let weight = hundredths[id] ?? 0
                let ideal = Double(total) * Double(weight) / Double(hundredthsSum)
                #expect(abs(Double(result[id] ?? 0) - ideal) < 1 + 1e-4)
                if weight == 0 { #expect(result[id] == 0) }
            }
        }
    }

    @Test("splits by weight")
    func sharesByWeight() throws {
        #expect(try Splits.shares(10000, scaledWeights: pct(["rahul": 2, "sarah": 1, "prakarsh": 1])) == ["prakarsh": 2500, "rahul": 5000, "sarah": 2500])
        #expect(try Splits.shares(10000, scaledWeights: pct(["u1": 3, "u2": 1])) == ["u1": 7500, "u2": 2500])
    }

    @Test("zero-share users get nothing, even when there is a remainder (QA regression)")
    func sharesZero() throws {
        #expect(try Splits.shares(100, scaledWeights: pct(["a": 0, "b": 1, "c": 1, "d": 1])) == ["a": 0, "b": 34, "c": 33, "d": 33])
        #expect(try Splits.shares(5, scaledWeights: pct(["a": 0, "z": 1])) == ["a": 0, "z": 5])
    }

    @Test("gives leftovers to the largest remainders, ties by ascending ID (shares)")
    func sharesLeftovers() throws {
        #expect(try Splits.shares(10, scaledWeights: pct(["a": 1, "b": 1, "c": 3])) == ["a": 2, "b": 2, "c": 6])
        #expect(try Splits.shares(11, scaledWeights: pct(["a": 1, "b": 1, "c": 3])) == ["a": 2, "b": 2, "c": 7])
        #expect(try Splits.shares(100, scaledWeights: pct(["a": 1.5, "b": 0.5])) == ["a": 75, "b": 25])
    }

    @Test("validates input (shares)")
    func sharesValidates() {
        #expect(throws: LedgerInvariantError("Cannot split with zero participants")) { try Splits.shares(100, scaledWeights: [:]) }
        #expect(throws: LedgerInvariantError("Total shares cannot be zero")) {
            try Splits.shares(100, scaledWeights: pct(["a": 0, "b": 0]))
        }
        #expect(throws: LedgerInvariantError("Shares cannot be negative")) {
            try Splits.shares(100, scaledWeights: pct(["a": -1, "b": 2]))
        }
        #expect(throws: LedgerInvariantError("Total amount cannot be negative")) {
            try Splits.shares(-100, scaledWeights: pct(["a": 1]))
        }
    }

    @Test("property: 20k random weights incl. zeros, totals up to 1e10 fils")
    func sharesProperty() throws {
        var rnd = Mulberry32(seed: 77)
        for _ in 0..<20000 {
            let total = randomTotal(&rnd)
            let ids = randomIds(&rnd, 1 + rnd.int(12))
            var weights = Shares(ids.map { ($0, rnd.int(6)) })
            if weights.sum == 0, let first = ids.first { weights = weights.setting(first, 1) }
            let totalShares = weights.sum
            let result = try Splits.shares(total, scaledWeights: weights.mapValues { $0 * Splits.weightScale })
            #expect(result.sum == total)
            #expect(result.values.allSatisfy { $0 >= 0 })
            for id in ids {
                let weight = weights[id] ?? 0
                if weight == 0 { #expect(result[id] == 0) }
                #expect(abs(Double(result[id] ?? 0) - Double(total) * Double(weight) / Double(totalShares)) < 1 + 1e-6)
            }
        }
    }

    @Test("parseScaledWeight accepts plain decimals up to 6 places")
    func parseScaledWeight() {
        #expect(Splits.parseScaledWeight("33.33") == 33_330_000)
        #expect(Splits.parseScaledWeight("2.") == 2_000_000)
        #expect(Splits.parseScaledWeight(".5") == 500_000)
        #expect(Splits.parseScaledWeight("1.000001") == 1_000_001)
        #expect(Splits.parseScaledWeight("1.0000001") == nil)
        #expect(Splits.parseScaledWeight("-1") == nil)
        #expect(Splits.parseScaledWeight("1e2") == nil)
        #expect(Splits.parseScaledWeight("50%") == nil)
        #expect(Splits.parseScaledWeight("") == nil)
    }
}
