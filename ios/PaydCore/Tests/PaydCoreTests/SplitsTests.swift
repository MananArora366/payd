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
        #expect(splits == ["u1": 34, "u2": 33, "u3": 33])
    }

    @Test func equalSevenWaysAndInvalidInput() throws {
        let splits = try Splits.equal(10000, among: ["a", "b", "c", "d", "e", "f", "g"])
        #expect(splits.values.reduce(0, +) == 10000)
        #expect(throws: (any Error).self) { try Splits.equal(1000, among: []) }
        #expect(throws: (any Error).self) { try Splits.equal(-50, among: ["u1"]) }
    }

    @Test func equalDeduplicatesParticipants() throws {
        let splits = try Splits.equal(100, among: ["u1", "u1", "u2"])
        #expect(splits == ["u1": 50, "u2": 50])
    }

    @Test func exactValidatesSum() throws {
        let exact = ["user-1": 6000, "user-2": 4000]
        #expect(try Splits.exact(10000, allocations: exact) == exact)
        #expect(throws: (any Error).self) { try Splits.exact(10000, allocations: ["user-1": 6000, "user-2": 3999]) }
        #expect(throws: (any Error).self) { try Splits.exact(0, allocations: ["user-1": -1, "user-2": 1]) }
    }

    @Test func percentage() throws {
        let splits = try Splits.percentage(10000, percentages: ["u1": 50, "u2": 25, "u3": 25])
        #expect(splits == ["u1": 5000, "u2": 2500, "u3": 2500])
        #expect(throws: (any Error).self) { try Splits.percentage(10000, percentages: ["u1": 50, "u2": 40]) }
    }

    @Test func percentageThirdsKeepZeroSum() throws {
        let splits = try Splits.percentage(10000, percentages: ["u1": 33.33, "u2": 33.33, "u3": 33.34])
        #expect(splits.values.reduce(0, +) == 10000)
    }

    @Test func shares() throws {
        let splits = try Splits.shares(10000, weights: ["rahul": 2, "sarah": 1, "prakarsh": 1])
        #expect(splits == ["rahul": 5000, "sarah": 2500, "prakarsh": 2500])
        #expect(throws: (any Error).self) { try Splits.shares(100, weights: ["a": 0]) }
        #expect(throws: (any Error).self) { try Splits.shares(100, weights: ["a": -1, "b": 2]) }
    }

    @Test func sharesRemainderKeepsZeroSum() throws {
        let splits = try Splits.shares(100, weights: ["a": 1, "b": 1, "c": 1])
        #expect(splits.values.reduce(0, +) == 100)
    }

    @Test func recurringBillSplitMatchesWeb() throws {
        // Du 5G Wi-Fi: 389.00 AED split 3 ways (web recurring.test.ts "Feature 6").
        let shares = try Splits.equal(38900, among: ["a", "b", "c"])
        #expect(shares.values.sorted(by: >) == [12967, 12967, 12966])
    }
}
