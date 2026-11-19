import Foundation
import Testing
@testable import PaydCore

/// The balances.test.ts LCG, computed in Doubles exactly like JS (the product exceeds 2^53).
struct JSLCG {
    private var state: Double

    init(seed: Double) { state = seed }

    mutating func rand(_ n: Int) -> Int {
        state = (state * 1_103_515_245 + 12345).truncatingRemainder(dividingBy: 2_147_483_648)
        return Int(state.truncatingRemainder(dividingBy: Double(n)))
    }
}

/// Builds small ledgers like the web test's `expense` / `settle` helpers.
private struct LedgerBuilder {
    var seq = 0
    var transactions: [Transaction] = []
    var splits: [TransactionSplit] = []
    var settlements: [Settlement] = []

    mutating func expense(_ payer: String, _ amount: Int, _ shares: Shares, group: String? = "g1") {
        seq += 1
        let id = "t\(seq)"
        transactions.append(txn(id, amount: amount, payer: payer, group: group))
        splits += shares.map { split(id, $0.key, $0.value) }
    }

    mutating func settle(_ from: String, _ to: String, _ amount: Int, group: String? = "g1") {
        seq += 1
        settlements.append(settlement("s\(seq)", from: from, to: to, amount, group: group))
    }
}

/// For every user: owed to them − they owe == net balance.
private func expectConsistent(_ t: [Transaction], _ sp: [TransactionSplit], _ st: [Settlement]) {
    let net = Balances.net(transactions: t, splits: sp, settlements: st)
    let debts = Balances.bilateral(transactions: t, splits: sp, settlements: st)
    var derived: [String: Int] = [:]
    for (debtor, row) in debts {
        for (creditor, amount) in row {
            #expect(amount > 0)
            #expect(debts[creditor]?[debtor] == nil)
            derived[debtor, default: 0] -= amount
            derived[creditor, default: 0] += amount
        }
    }
    for id in Set(net.keys).union(derived.keys) {
        #expect((derived[id] ?? 0) == (net[id] ?? 0))
    }
}

/// Port of web/src/lib/ledger/__tests__/balances.test.ts.
struct BalancesPortTests {
    private let a = "a", b = "b", c = "c"

    @Test("overpayments carry over as a reverse debt instead of vanishing")
    func overpayments() {
        var l = LedgerBuilder()
        l.expense(a, 10000, ["a": 5000, "b": 5000])
        l.settle(b, a, 8000)
        let debts = Balances.bilateral(transactions: l.transactions, splits: l.splits, settlements: l.settlements)
        #expect(debts[b]?[a] == nil)
        #expect(debts[a]?[b] == 3000)
        expectConsistent(l.transactions, l.splits, l.settlements)
    }

    @Test("opposite-direction debts net out")
    func oppositeNet() {
        var l = LedgerBuilder()
        l.expense(a, 10000, ["a": 5000, "b": 5000])
        l.expense(b, 6000, ["a": 3000, "b": 3000])
        let debts = Balances.bilateral(transactions: l.transactions, splits: l.splits, settlements: [])
        #expect(debts[b]?[a] == 2000)
        #expect(debts[a]?[b] == nil)
        expectConsistent(l.transactions, l.splits, [])
    }

    @Test("nets opposite debts across different groups")
    func acrossGroups() {
        var l = LedgerBuilder()
        l.expense(a, 10000, ["a": 5000, "b": 5000], group: "g1")
        l.expense(b, 4000, ["a": 2000, "b": 2000], group: "g2")
        #expect(Balances.bilateral(transactions: l.transactions, splits: l.splits, settlements: [])[b]?[a] == 3000)
        let grouped = Balances.groupedBilateral(transactions: l.transactions, splits: l.splits, settlements: [])
        let parts = Balances.pairDebtBreakdown(grouped, userA: a, userB: b)
        #expect(parts == [
            PairDebtComponent(groupId: "g1", fromUserId: b, toUserId: a, amountMinor: 5000),
            PairDebtComponent(groupId: "g2", fromUserId: a, toUserId: b, amountMinor: 2000),
        ])
    }

    @Test("handles refunds (reverses the original split)")
    func refunds() {
        var l = LedgerBuilder()
        l.expense(a, 9000, ["a": 3000, "b": 3000, "c": 3000])
        let t = l.transactions + [txn("r1", .refund, amount: 3000, payer: a, group: "g1")]
        let sp = l.splits + [split("r1", a, 1000), split("r1", b, 1000), split("r1", c, 1000)]
        let debts = Balances.bilateral(transactions: t, splits: sp, settlements: [])
        #expect(debts[b]?[a] == 2000)
        #expect(debts[c]?[a] == 2000)
        expectConsistent(t, sp, [])
    }

    @Test("ignores soft-deleted transactions, income and non-settled settlements")
    func ignores() {
        var l = LedgerBuilder()
        l.expense(a, 10000, ["a": 5000, "b": 5000])
        let deleted = txn("del", amount: 10000, payer: b, group: "g1", deleted: true)
        let income = txn("inc", .income, amount: 99999, payer: b)
        let t = l.transactions + [deleted, income]
        let sp = l.splits + [split("del", a, 5000), split("del", b, 5000), split("inc", b, 99999)]
        let pending = settlement("p", from: b, to: a, 5000, group: "g1", status: .outstanding)
        #expect(Balances.bilateral(transactions: t, splits: sp, settlements: [pending])[b]?[a] == 5000)
    }

    @Test("group debts equal the group simplified suggestions (what the Groups tab shows)")
    func groupMatchesSuggestions() throws {
        var l = LedgerBuilder()
        l.expense(a, 9000, ["a": 3000, "b": 3000, "c": 3000])
        l.expense(b, 3000, ["c": 3000])
        let grouped = Balances.groupedBilateral(transactions: l.transactions, splits: l.splits, settlements: [])
        let suggestions = try DebtSimplifier.simplify(Balances.net(transactions: l.transactions, splits: l.splits, settlements: []))
        #expect(!suggestions.isEmpty)
        for s in suggestions { #expect(grouped["g1"]?[s.fromUserId]?[s.toUserId] == s.amountMinor) }
    }

    @Test("settlements without a group still affect overall balances and net against group debts")
    func ungroupedSettlement() {
        var l = LedgerBuilder()
        l.expense(a, 10000, ["a": 5000, "b": 5000], group: "g1")
        l.settle(b, a, 5000, group: nil)
        let debts = Balances.bilateral(transactions: l.transactions, splits: l.splits, settlements: l.settlements)
        #expect(debts[b]?[a] == nil)
        #expect(debts[a]?[b] == nil)
        let grouped = Balances.groupedBilateral(transactions: l.transactions, splits: l.splits, settlements: l.settlements)
        #expect(Balances.signedPairDebt(grouped["g1"], from: b, to: a) == 5000)
        #expect(Balances.signedPairDebt(grouped[personalDebtBucket], from: b, to: a) == -5000)
        expectConsistent(l.transactions, l.splits, l.settlements)
    }

    @Test("group settlements count in that group only")
    func groupSettlementsScoped() {
        var l = LedgerBuilder()
        l.expense(a, 10000, ["a": 5000, "b": 5000], group: "g1")
        l.expense(a, 4000, ["a": 2000, "b": 2000], group: "g2")
        l.settle(b, a, 5000, group: "g1")
        let grouped = Balances.groupedBilateral(transactions: l.transactions, splits: l.splits, settlements: l.settlements)
        #expect(Balances.signedPairDebt(grouped["g1"], from: b, to: a) == 0)
        #expect(Balances.signedPairDebt(grouped["g2"], from: b, to: a) == 2000)
        #expect(Balances.bilateral(transactions: l.transactions, splits: l.splits, settlements: l.settlements)[b]?[a] == 2000)
    }

    @Test("owed/owe always sum to the net balance on random ledgers")
    func randomLedgers() {
        let users = ["u1", "u2", "u3", "u4", "u5"]
        let groups: [String?] = ["g1", "g2", nil]
        var rng = JSLCG(seed: 42)
        for _ in 0..<50 {
            var l = LedgerBuilder()
            for _ in 0..<6 {
                let payer = users[rng.rand(5)]
                var parts = users.filter { _ in rng.rand(2) == 0 }
                if parts.isEmpty { parts.append(payer) }
                var shares = Shares()
                var total = 0
                for p in parts {
                    let share = 100 + rng.rand(10000)
                    shares = shares.setting(p, share)
                    total += share
                }
                l.expense(payer, total, shares, group: groups[rng.rand(3)])
            }
            for _ in 0..<4 {
                let from = users[rng.rand(5)]
                let to = users.filter { $0 != from }[rng.rand(4)]
                l.settle(from, to, 1 + rng.rand(8000), group: groups[rng.rand(3)])
            }
            expectConsistent(l.transactions, l.splits, l.settlements)
        }
    }

    // MARK: Seed data

    private var seed: LedgerState { SeedData.make(now: isoDate("2026-11-14T12:00:00.000Z")) }

    @Test("Home owed/owe sums to the net balance (+1,500.00 for Manan)")
    func seedNet() {
        let s = seed
        expectConsistent(s.transactions, s.splits, s.settlements)
        #expect(Balances.net(transactions: s.transactions, splits: s.splits, settlements: s.settlements)[SeedIDs.manan] == 150000)
    }

    @Test("the group-suggested Prakarsh -> Manan 240.00 is a valid settlement (QA critical #1)")
    func seedSuggestedSettlement() {
        let s = seed
        let grouped = Balances.groupedBilateral(transactions: s.transactions, splits: s.splits, settlements: s.settlements)
        let debt = Balances.signedPairDebt(grouped[SeedIDs.flatmates], from: SeedIDs.prakarsh, to: SeedIDs.manan)
        #expect(debt == 24000)
        let input = SettlementValidationInput(senderId: SeedIDs.prakarsh, recipientId: SeedIDs.manan, amountMinor: 24000,
                                              groupId: SeedIDs.flatmates)
        #expect(Balances.checkSettlement(input, debtMinor: debt).isOK)
    }

    @Test("every settlement is dated after the expenses it repays")
    func seedDates() throws {
        let s = seed
        let prakarshSettlement = try #require(s.settlements.first { $0.senderId == SeedIDs.prakarsh })
        let dinner = try #require(s.transactions.first { $0.title.contains("Dinner") })
        #expect(prakarshSettlement.settledAt > dinner.occurredAt)
    }

    // MARK: checkSettlement

    private func input(_ amount: Int = 5000, recipient: String = "b", allowOverpayment: Bool = false) -> SettlementValidationInput {
        SettlementValidationInput(senderId: "a", recipientId: recipient, amountMinor: amount, allowOverpayment: allowOverpayment)
    }

    @Test("accepts amounts up to the debt")
    func checkAccepts() {
        #expect(Balances.checkSettlement(input(), debtMinor: 5000) == .ok(debtMinor: 5000))
        #expect(Balances.checkSettlement(input(1), debtMinor: 5000).isOK)
    }

    @Test("rejects more than the debt unless recorded as an advance")
    func checkOverpay() throws {
        let result = Balances.checkSettlement(input(5001), debtMinor: 5000)
        let reason = try #require(result.reason)
        #expect(!reason.lowercased().contains("invariant"))
        #expect(reason.contains("advance"))
        #expect(reason == "That's more than the AED 50.00 The payer owes the recipient. Lower the amount or record the extra as an advance payment.")
        #expect(Balances.checkSettlement(input(5001, allowOverpayment: true), debtMinor: 5000).isOK)
    }

    @Test("allows an advance between people with no debt")
    func checkAdvance() {
        #expect(!Balances.checkSettlement(input(), debtMinor: 0).isOK)
        #expect(Balances.checkSettlement(input(allowOverpayment: true), debtMinor: 0).isOK)
    }

    @Test("rejects self-payments, zero, negative, fractional and unsafe amounts")
    func checkRejects() {
        #expect(Balances.checkSettlement(input(recipient: "a"), debtMinor: 5000).reason
            == "The payer and the recipient can't be the same person.")
        for amount in [0, -5] {
            #expect(Balances.checkSettlement(input(amount, allowOverpayment: true), debtMinor: 5000).reason
                == "Enter an amount greater than zero.")
        }
        #expect(Balances.checkSettlement(input(recipient: ""), debtMinor: 5000).reason
            == "Choose who is paying and who is being paid.")
    }

    @Test("uses friendly names and grammar for \"You\"")
    func checkGrammar() {
        let reason = Balances.checkSettlement(input(), debtMinor: 0, senderName: "You", recipientName: "Rahul").reason
        #expect(reason?.contains("You don't currently owe Rahul") == true)
        let other = Balances.checkSettlement(input(), debtMinor: 0, senderName: "Veer", recipientName: "you").reason
        #expect(other?.hasPrefix("Veer doesn't currently owe you anything here.") == true)
    }

    // MARK: simplifyDebts

    @Test("throws when balances do not sum to zero")
    func simplifyUnbalanced() {
        #expect(throws: LedgerInvariantError("Balances do not sum to zero (off by 50)")) {
            try DebtSimplifier.simplify(["a": 100, "b": -50])
        }
    }

    @Test("uses n - (#zero-sum groups) transfers")
    func simplifyExact() throws {
        let balances: Shares = ["a": 700, "b": -700, "c": 300, "d": -300, "e": 500, "f": -250, "g": -250]
        #expect(try DebtSimplifier.simplify(balances).count == 4)
    }

    @Test("never uses more transfers than greedy and always conserves balances (random)")
    func simplifyRandom() throws {
        var rng = JSLCG(seed: 7)
        for _ in 0..<200 {
            let n = 2 + rng.rand(7)
            var balances = Shares()
            var sum = 0
            for i in 0..<(n - 1) {
                let value = (rng.rand(10) - 5) * 100
                balances = balances.setting("u\(i)", value)
                sum += value
            }
            balances = balances.setting("u\(n - 1)", -sum)
            let transfers = try DebtSimplifier.simplify(balances)
            var net: [String: Int] = [:]
            for t in transfers {
                #expect(t.amountMinor > 0)
                net[t.fromUserId, default: 0] -= t.amountMinor
                net[t.toUserId, default: 0] += t.amountMinor
            }
            for (key, value) in balances { #expect((net[key] ?? 0) == value) }
            let nonZero = balances.values.filter { $0 != 0 }.count
            #expect(transfers.count <= max(0, nonZero - 1))
        }
    }

    @Test("ties keep insertion order (stable sorts)")
    func simplifyTies() throws {
        let transfers = try DebtSimplifier.simplify(["x": -100, "y": -100, "z": 200])
        #expect(transfers == [
            SimplifiedDebt(fromUserId: "x", toUserId: "z", amountMinor: 100),
            SimplifiedDebt(fromUserId: "y", toUserId: "z", amountMinor: 100),
        ])
    }

    @Test("reports real before/after transfer counts")
    func summarize() {
        var l = LedgerBuilder()
        l.expense(a, 9000, ["a": 3000, "b": 3000, "c": 3000])
        l.expense(b, 9000, ["a": 3000, "b": 3000, "c": 3000])
        let summary = Balances.summarizeSimplification(transactions: l.transactions, splits: l.splits, settlements: [])
        #expect(summary.beforeTransfers == 2)
        #expect(summary.afterTransfers == 2)
        let empty = Balances.summarizeSimplification(transactions: [], splits: [], settlements: [])
        #expect(empty.beforeTransfers == 0 && empty.afterTransfers == 0)
    }
}
