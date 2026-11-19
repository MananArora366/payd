import Foundation
import Testing
@testable import PaydCore

/// Guards the demo dataset so it stays identical to web/src/lib/store/initialData.ts.
struct SeedDataTests {
    @Test func seedSplitsMatchTransactionTotals() {
        let seed = SeedData.make(now: Date())
        for txn in seed.transactions {
            let sum = seed.splits.filter { $0.transactionId == txn.id }.map(\.shareMinor).reduce(0, +)
            #expect(sum == txn.amountMinor, Comment(rawValue: "Splits for \(txn.title) must sum to its total"))
        }
        for bill in seed.recurringBills {
            #expect(bill.splits.map(\.shareMinor).reduce(0, +) == bill.amountMinor, Comment(rawValue: bill.title))
        }
    }

    @Test func seedGroupBalancesAreZeroSum() {
        let seed = SeedData.make(now: Date())
        let flatmates = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        let balances = Balances.net(
            transactions: seed.transactions.filter { $0.groupId == flatmates },
            splits: seed.splits,
            settlements: seed.settlements.filter { $0.groupId == flatmates }
        )
        #expect(balances.values.reduce(0, +) == 0)
    }

    @Test func seedRoundTripsThroughJSON() throws {
        let seed = SeedData.make(now: Date(timeIntervalSince1970: 1_800_000_000))
        let data = try PaydJSON.encoder.encode(seed)
        let decoded = try PaydJSON.decoder.decode(LedgerState.self, from: data)
        #expect(decoded == seed)
    }

    @Test func encodesSnakeCaseKeysForWebCompatibility() throws {
        let seed = SeedData.make(now: Date())
        let json = String(decoding: try PaydJSON.encoder.encode(seed.transactions[0]), as: UTF8.self)
        #expect(json.contains("\"amount_minor\""))
        #expect(json.contains("\"payer_id\""))
    }
}
