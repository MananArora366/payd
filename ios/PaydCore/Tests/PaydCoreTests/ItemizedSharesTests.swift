import Foundation
import Testing
@testable import PaydCore

/// Mirrors web/src/lib/ledger/__tests__/recurring.test.ts — "Tap-to-Claim".
struct ItemizedSharesTests {
    private let manan = "11111111-1111-1111-1111-111111111111"
    private let rahul = "22222222-2222-2222-2222-222222222222"
    private let sarah = "33333333-3333-3333-3333-333333333333"

    private let items = [
        ReceiptLineItem(name: "Truffle Fries", quantity: 1, priceMinor: 4500),
        ReceiptLineItem(name: "Wagyu Slider", quantity: 1, priceMinor: 7500),
        ReceiptLineItem(name: "Mocktails", quantity: 1, priceMinor: 3000),
    ]

    @Test func tapToClaimFractionalDishes() throws {
        let shares = try ItemizedShares.calculate(
            totalMinor: 15000, lineItems: items,
            assignments: [0: [manan, rahul], 1: [rahul], 2: [manan, sarah]],
            participants: [manan, rahul, sarah]
        )
        #expect(shares.values.reduce(0, +) == 15000)
        #expect(shares[manan] == 3750)
        #expect(shares[rahul] == 9750)
        #expect(shares[sarah] == 1500)
    }

    @Test func vatIsScaledProportionallyWithZeroLoss() throws {
        // 150.00 items + 5% VAT = 157.50 total.
        let shares = try ItemizedShares.calculate(
            totalMinor: 15750, lineItems: items,
            assignments: [0: [manan, rahul], 1: [rahul], 2: [manan, sarah]],
            participants: [manan, rahul, sarah]
        )
        #expect(shares.values.reduce(0, +) == 15750)
    }

    @Test func noAssignmentsFallsBackToEqual() throws {
        let shares = try ItemizedShares.calculate(
            totalMinor: 100, lineItems: items, assignments: [:], participants: [manan, rahul, sarah]
        )
        #expect(shares.values.sorted(by: >) == [34, 33, 33])
    }

    @Test func throwsWithoutParticipants() {
        #expect(throws: (any Error).self) { try ItemizedShares.calculate(totalMinor: 100, lineItems: items, assignments: [:], participants: []) }
    }
}
