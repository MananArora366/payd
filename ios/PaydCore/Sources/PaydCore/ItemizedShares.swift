import Foundation

/// Port of `calculateItemizedShares` (web/src/lib/ai/receipt-scan.ts:123-196, Tap-to-Claim).
/// Each item is split among its claimants (remainder fils to the first claimants in the assignment's
/// own order), the subtotals are scaled to the receipt total by floor, and leftover fils go to the
/// participants with the largest subtotals (ties keep participant order).
public enum ItemizedShares {
    /// - Parameter assignments: item index → user IDs; an empty/missing entry means "shared by everyone".
    public static func calculate(totalMinor: Int, lineItems: [ReceiptItem], assignments: [Int: [String]],
                                 participantIds: [String]) throws(LedgerInvariantError) -> Shares {
        if participantIds.isEmpty { throw LedgerInvariantError("Cannot split receipt without participants") }
        let hasAssignments = assignments.values.contains { !$0.isEmpty }
        if !hasAssignments || lineItems.isEmpty { return try Splits.equal(totalMinor, among: participantIds) }

        var subtotals = Shares()
        for id in participantIds { subtotals.set(id, 0) }
        var rawItemsTotal = 0
        for (index, item) in lineItems.enumerated() {
            let assigned = assignments[index] ?? []
            let targets = assigned.isEmpty ? participantIds : assigned
            rawItemsTotal += item.priceMinor
            let base = item.priceMinor / targets.count
            var remainder = item.priceMinor - base * targets.count
            for uid in targets {
                var share = base
                if remainder > 0 {
                    share += 1
                    remainder -= 1
                }
                subtotals.add(uid, share)
            }
        }
        if rawItemsTotal == 0 { return try Splits.equal(totalMinor, among: participantIds) }

        var finalShares = Shares()
        var distributed = 0
        for uid in participantIds {
            let scaled = PaydMath.mulDiv(subtotals[uid] ?? 0, totalMinor, rawItemsTotal).quotient
            finalShares.set(uid, scaled)
            distributed += scaled
        }
        var diff = totalMinor - distributed
        if diff > 0 {
            let ranked = participantIds.stableSorted { (subtotals[$0] ?? 0) > (subtotals[$1] ?? 0) }
            var index = 0
            while diff > 0 {
                finalShares.add(ranked[index % ranked.count], 1)
                diff -= 1
                index += 1
            }
        }
        return finalShares
    }
}
