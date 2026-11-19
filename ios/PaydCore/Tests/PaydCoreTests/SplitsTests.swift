import Foundation
import Testing
@testable import PaydCore

/// Mirrors web/src/lib/ledger/__tests__/ledger.test.ts — "Split Algorithms & Invariants".
struct SplitsTests {
    @Test func equalDistributesRemainderByStableIdOrder() throws {
        let splits = try Splits.equal(10000, among: ["user-c", "user-a", "user-b"])
        #expect(splits["user-a"] == 3334)
        #expect(splits["user-b"] == 3333)
        #expect(splits["user-c"] == 3333)
        #expect(splits.values.reduce(0, +) == 10000)
    }

    @Test func equalHundredThreeWays() throws {
        let splits = try Splits.equal(100, among: ["u1", "u2", "u3"])
        let expected: Shares = ["u1": 34, "u2": 33, "u3": 33]
        #expect(splits == expected)
    }

    @Test func equalSevenWaysAndInvalidInput() throws {
        let splits = try Splits.equal(10000, among: ["a", "b", "c", "d", "e", "f", "g"])
        #expect(splits.values.reduce(0, +) == 10000)
        #expect(throws: (any Error).self) { try Splits.equal(1000, among: []) }
        #expect(throws: (any Error).self) { try Splits.equal(-50, among: ["u1"]) }
    }

    @Test func equalDeduplicatesParticipants() throws {
        let splits = try Splits.equal(100, among: ["u1", "u1", "u2"])
        let expected: Shares = ["u1": 50, "u2": 50]
        #expect(splits == expected)
    }

    @Test func exactValidatesSum() throws {
        let exact: Shares = ["user-1": 6000, "user-2": 4000]
        #expect(try Splits.exact(10000, allocations: exact) == exact)
        let invalidSum: Shares = ["user-1": 6000, "user-2": 3999]
        #expect(throws: (any Error).self) { try Splits.exact(10000, allocations: invalidSum) }
        let negative: Shares = ["user-1": -1, "user-2": 1]
        #expect(throws: (any Error).self) { try Splits.exact(0, allocations: negative) }
    }

    @Test func percentage() throws {
        let percentages: Shares = ["u1": 50 * Splits.weightScale, "u2": 25 * Splits.weightScale, "u3": 25 * Splits.weightScale]
        let splits = try Splits.percentage(10000, scaledPercentages: percentages)
        let expected: Shares = ["u1": 5000, "u2": 2500, "u3": 2500]
        #expect(splits == expected)
        let invalid: Shares = ["u1": 50 * Splits.weightScale, "u2": 40 * Splits.weightScale]
        #expect(throws: (any Error).self) { try Splits.percentage(10000, scaledPercentages: invalid) }
    }

    @Test func percentageThirdsKeepZeroSum() throws {
        let p1 = Splits.parseScaledWeight("33.33") ?? 0
        let p2 = Splits.parseScaledWeight("33.33") ?? 0
        let p3 = Splits.parseScaledWeight("33.34") ?? 0
        let percentages: Shares = ["u1": p1, "u2": p2, "u3": p3]
        let splits = try Splits.percentage(10000, scaledPercentages: percentages)
        #expect(splits.values.reduce(0, +) == 10000)
    }

    @Test func shares() throws {
        let weights: Shares = [
            "rahul": 2 * Splits.weightScale,
            "sarah": 1 * Splits.weightScale,
            "prakarsh": 1 * Splits.weightScale
        ]
        let splits = try Splits.shares(10000, scaledWeights: weights)
        let expected: Shares = ["prakarsh": 2500, "rahul": 5000, "sarah": 2500]
        #expect(splits == expected)
        let zeroWeight: Shares = ["a": 0]
        #expect(throws: (any Error).self) { try Splits.shares(100, scaledWeights: zeroWeight) }
        let negWeight: Shares = ["a": -1, "b": 2 * Splits.weightScale]
        #expect(throws: (any Error).self) { try Splits.shares(100, scaledWeights: negWeight) }
    }

    @Test func sharesRemainderKeepsZeroSum() throws {
        let weights: Shares = ["a": 1 * Splits.weightScale, "b": 1 * Splits.weightScale, "c": 1 * Splits.weightScale]
        let splits = try Splits.shares(100, scaledWeights: weights)
        #expect(splits.values.reduce(0, +) == 100)
    }

    @Test func recurringBillSplitMatchesWeb() throws {
        // Du 5G Wi-Fi: 389.00 AED split 3 ways (web recurring.test.ts "Feature 6").
        let shares = try Splits.equal(38900, among: ["a", "b", "c"])
        #expect(shares.values.sorted(by: >) == [12967, 12967, 12966])
    }
}
