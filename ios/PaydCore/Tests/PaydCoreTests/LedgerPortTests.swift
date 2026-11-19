import Foundation
import Testing
@testable import PaydCore

/// Port of web/src/lib/ledger/__tests__/ledger.test.ts. `minorToMajor` (float) is replaced by the
/// app's string helpers; the `number` input to parseMajorToMinor is not applicable.
struct LedgerPortTests {
    private let prakarsh = SeedIDs.manan, rahul = SeedIDs.prakarsh, sarah = SeedIDs.veer

    @Test("formats minor units to major formatted currency string")
    func formats() {
        #expect(Currency.format(10000, currency: "AED") == "AED 100.00")
        #expect(Currency.format(3333, currency: "AED") == "AED 33.33")
        #expect(Currency.format(5, currency: "USD") == "$0.05")
        #expect(Currency.format(0, currency: "EUR") == "€0.00")
    }

    @Test("correctly parses major currency strings to integer minor units without float errors")
    func parses() {
        #expect(Currency.parseMajorToMinor("100") == 10000)
        #expect(Currency.parseMajorToMinor("100.00") == 10000)
        #expect(Currency.parseMajorToMinor("100.50") == 10050)
        #expect(Currency.parseMajorToMinor("0.05") == 5)
        #expect(Currency.parseMajorToMinor("19.99") == 1999)
    }

    @Test("converts minor to major float safely")
    func minorToMajor() {
        #expect(Currency.minorToMajorPlainString(10050) == "100.5")
        #expect(Currency.minorToMajorPlainString(3333) == "33.33")
    }

    @Test("returns currency symbol")
    func symbols() {
        #expect(Currency.symbol(for: "AED") == "AED")
        #expect(Currency.symbol(for: "USD") == "$")
        #expect(Currency.symbol(for: "EUR") == "€")
        #expect(Currency.symbol(for: "INR") == "₹")
    }

    @Test("splitEqual: distributes remainder deterministically by stable user ID sort")
    func equalStable() throws {
        let splits = try Splits.equal(10000, among: ["user-c", "user-a", "user-b"])
        #expect(splits == ["user-a": 3334, "user-b": 3333, "user-c": 3333])
    }

    @Test("splitEqual: 100 minor units split 3 ways yields 34, 33, 33")
    func equalHundred() throws {
        #expect(try Splits.equal(100, among: ["u1", "u2", "u3"]) == ["u1": 34, "u2": 33, "u3": 33])
    }

    @Test("splitEqual: 10000 minor units (100 AED) split 3 ways yields 3334, 3333, 3333 exactly")
    func equalTenThousand() throws {
        #expect(try Splits.equal(10000, among: ["u1", "u2", "u3"]) == ["u1": 3334, "u2": 3333, "u3": 3333])
    }

    @Test("splitEqual: handles 7-way split and throws on zero participants")
    func equalSeven() throws {
        #expect(try Splits.equal(10000, among: ["a", "b", "c", "d", "e", "f", "g"]).sum == 10000)
        #expect(throws: LedgerInvariantError.self) { try Splits.equal(1000, among: []) }
        #expect(throws: LedgerInvariantError.self) { try Splits.equal(-50, among: ["u1"]) }
    }

    @Test("splitExact: validates sum equals total exactly")
    func exact() throws {
        let allocations: Shares = ["user-1": 6000, "user-2": 4000]
        #expect(try Splits.exact(10000, allocations: allocations) == allocations)
        #expect(throws: LedgerInvariantError.self) { try Splits.exact(10000, allocations: ["user-1": 6000, "user-2": 3999]) }
    }

    @Test("splitPercentage: calculates exact shares with remainder handling")
    func percentage() throws {
        let scale = Splits.weightScale
        #expect(try Splits.percentage(10000, scaledPercentages: ["u1": 50 * scale, "u2": 25 * scale, "u3": 25 * scale])
            == ["u1": 5000, "u2": 2500, "u3": 2500])
        #expect(throws: LedgerInvariantError.self) {
            try Splits.percentage(10000, scaledPercentages: ["u1": 50 * scale, "u2": 40 * scale])
        }
    }

    @Test("splitShares: allocates based on weighted shares with deterministic remainders")
    func shares() throws {
        let scale = Splits.weightScale
        let splits = try Splits.shares(10000, scaledWeights: ["rahul": 2 * scale, "sarah": scale, "prakarsh": scale])
        #expect(splits["rahul"] == 5000 && splits["sarah"] == 2500 && splits["prakarsh"] == 2500)
        #expect(splits.sum == 10000)
    }

    @Test("splitUnequal: custom split wrapper validates exact sum")
    func unequal() throws {
        #expect(try Splits.exact(5000, allocations: ["a": 3000, "b": 2000]) == ["a": 3000, "b": 2000])
    }

    private var dinner: [Transaction] { [txn("t1", amount: 10000, payer: prakarsh)] }
    private var dinnerSplits: [TransactionSplit] {
        [split("t1", prakarsh, 3334), split("t1", rahul, 3333), split("t1", sarah, 3333)]
    }

    @Test("calculates net balances for expenses and splits")
    func netBalances() {
        let balances = Balances.net(transactions: dinner, splits: dinnerSplits, settlements: [])
        #expect(balances[prakarsh] == 6666)
        #expect(balances[rahul] == -3333)
        #expect(balances[sarah] == -3333)
        #expect(balances.sum == 0)
    }

    @Test("applies settlements: reduces debtor debt and creditor credit without expense records")
    func settlements() {
        let balances = Balances.net(transactions: dinner, splits: dinnerSplits,
                                    settlements: [settlement("s1", from: rahul, to: prakarsh, 3333)])
        #expect(balances[rahul] == 0)
        #expect(balances[sarah] == -3333)
        #expect(balances[prakarsh] == 3333)
    }

    @Test("ignores soft-deleted transactions in balance calculation")
    func softDeleted() {
        let deleted = [txn("t1", amount: 10000, payer: prakarsh, deleted: true)]
        let balances = Balances.net(transactions: deleted, splits: dinnerSplits, settlements: [])
        #expect((balances[prakarsh] ?? 0) == 0 && (balances[rahul] ?? 0) == 0 && (balances[sarah] ?? 0) == 0)
    }

    @Test("validateSettlementAmount prevents paying more than outstanding liability unless allowed")
    func validateAmount() {
        #expect(Balances.isValidSettlementAmount(3333, debtMinor: 3333, allowOverpayment: false))
        #expect(Balances.isValidSettlementAmount(2000, debtMinor: 3333, allowOverpayment: false))
        #expect(!Balances.isValidSettlementAmount(5000, debtMinor: 3333, allowOverpayment: false))
        #expect(Balances.isValidSettlementAmount(5000, debtMinor: 3333, allowOverpayment: true))
    }

    @Test("simplifies 3-party cycle into minimal cash transactions")
    func simplifyCycle() throws {
        let simplified = try DebtSimplifier.simplify(["alice": 100, "bob": -40, "charlie": -60])
        #expect(simplified.count == 2)
        #expect(simplified.first { $0.fromUserId == "charlie" } == SimplifiedDebt(fromUserId: "charlie", toUserId: "alice", amountMinor: 60))
        #expect(simplified.first { $0.fromUserId == "bob" } == SimplifiedDebt(fromUserId: "bob", toUserId: "alice", amountMinor: 40))
    }

    @Test("returns empty array when everyone is settled")
    func simplifySettled() throws {
        #expect(try DebtSimplifier.simplify(["user-1": 0, "user-2": 0]).isEmpty)
    }
}
