import Foundation

// Port of calculateItemizedShares in web/src/lib/ai/receipt-scan.ts (Tap-to-Claim).
// Each line item is split among the people who claimed it; the subtotals are then scaled
// to the receipt total so VAT and rounding are shared proportionally with zero loss.

public enum ItemizedShares {
    /// - Parameter assignments: line-item index → user IDs who claimed it. Unclaimed items are shared by everyone.
    public static func calculate(totalMinor: Int, lineItems: [ReceiptLineItem], assignments: [Int: [String]],
                                 participants: [String]) throws(LedgerError) -> Shares {
        guard !participants.isEmpty else { throw .noParticipants }
        let hasAssignments = assignments.values.contains { !$0.isEmpty }
        guard hasAssignments, !lineItems.isEmpty else {
            return try Splits.equal(totalMinor, among: participants)
        }

        let subtotals = claimedSubtotals(lineItems: lineItems, assignments: assignments, participants: participants)
        let itemsTotal = lineItems.map(\.priceMinor).reduce(0, +)
        guard itemsTotal > 0 else { return try Splits.equal(totalMinor, among: participants) }

        let scaled = Dictionary(uniqueKeysWithValues: participants.map { id in
            (id, subtotals[id, default: 0] * totalMinor / itemsTotal)
        })
        // Largest claimers absorb leftover minor units first (ties broken by ID for determinism).
        let byClaimSize = participants.sorted { lhs, rhs in
            let (left, right) = (subtotals[lhs, default: 0], subtotals[rhs, default: 0])
            return left != right ? left > right : lhs < rhs
        }
        return try Splits.verified(Splits.correctingDrift(scaled, ids: byClaimSize, total: totalMinor), total: totalMinor)
    }

    private static func claimedSubtotals(lineItems: [ReceiptLineItem], assignments: [Int: [String]],
                                         participants: [String]) -> Shares {
        var subtotals = Dictionary(uniqueKeysWithValues: participants.map { ($0, 0) })
        for (index, item) in lineItems.enumerated() {
            let claimed = assignments[index] ?? []
            let owners = claimed.isEmpty ? participants : claimed
            let base = item.priceMinor / owners.count
            let remainder = item.priceMinor - base * owners.count
            for (position, owner) in owners.enumerated() {
                subtotals[owner, default: 0] += base + (position < remainder ? 1 : 0)
            }
        }
        return subtotals
    }
}
