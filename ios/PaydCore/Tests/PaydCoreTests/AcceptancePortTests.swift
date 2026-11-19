import Foundation
import Testing
@testable import PaydCore

/// Port of web/src/lib/ledger/__tests__/acceptance.test.ts.
struct AcceptancePortTests {
    private let prakarsh = SeedIDs.manan, rahul = SeedIDs.prakarsh, sarah = SeedIDs.veer

    @Test("Criterion 1: Strict integer minor units without floating-point inaccuracies")
    func criterion1() {
        let minor = Currency.parseMajorToMinor("120.99", currency: "AED")
        #expect(minor == 12099)
        #expect(Currency.format(minor, currency: "AED") == "AED 120.99")
    }

    @Test("Criterion 2: Calculations are strictly deterministic in /lib/ledger without AI hallucination")
    func criterion2() throws {
        let splits = try Splits.equal(15000, among: [prakarsh, rahul, sarah])
        #expect(splits[prakarsh] == 5000 && splits[rahul] == 5000 && splits[sarah] == 5000)
        #expect(splits.sum == 15000)
    }

    @Test("Criterion 3: 3-way split distributes remainder deterministically to first participants sorted by stable ID")
    func criterion3() throws {
        #expect(try Splits.equal(100, among: ["u1", "u2", "u3"]) == ["u1": 34, "u2": 33, "u3": 33])
        #expect(try Splits.equal(10000, among: ["u1", "u2", "u3"]) == ["u1": 3334, "u2": 3333, "u3": 3333])
    }

    @Test("Criterion 4: Settlements validate liability and cannot exceed debt unless explicit overpayment")
    func criterion4() {
        #expect(Balances.isValidSettlementAmount(3333, debtMinor: 3333))
        #expect(Balances.isValidSettlementAmount(3000, debtMinor: 3333))
        #expect(!Balances.isValidSettlementAmount(3334, debtMinor: 3333))
        #expect(Balances.isValidSettlementAmount(3334, debtMinor: 3333, allowOverpayment: true))
    }

    @Test("Criterion 5: Balances are dynamically derived; soft delete reverses effect immediately")
    func criterion5() {
        let splits = [split("t-audit-1", prakarsh, 6000), split("t-audit-1", rahul, 6000)]
        let active = Balances.net(transactions: [txn("t-audit-1", amount: 12000, payer: prakarsh)], splits: splits, settlements: [])
        #expect(active[prakarsh] == 6000 && active[rahul] == -6000)
        let deleted = Balances.net(transactions: [txn("t-audit-1", amount: 12000, payer: prakarsh, deleted: true)],
                                   splits: splits, settlements: [])
        #expect((deleted[prakarsh] ?? 0) == 0 && (deleted[rahul] ?? 0) == 0)
    }

    @Test("Criterion 6: Simplifies multi-party debt cycles into minimal payment transactions")
    func criterion6() throws {
        #expect(try DebtSimplifier.simplify(["userA": -100, "userB": 0, "userC": 100])
            == [SimplifiedDebt(fromUserId: "userA", toUserId: "userC", amountMinor: 100)])
    }

    private func context(_ members: [String], categories: [String]) -> InterpretContext {
        InterpretContext(currentUser: .init(id: prakarsh, name: "Prakarsh", currency: "AED"),
                         knownMembers: members.enumerated().map { .init(id: "m\($0.offset)", name: $0.element) },
                         groups: members.count > 1 ? [.init(id: "g1", name: "Dubai Flatmates")] : [],
                         categories: categories)
    }

    @Test("Criterion 7: Voice parser accurately extracts intent, amount, category, and members")
    func criterion7() {
        let ctx = context(["Prakarsh", "Rahul", "Sarah"], categories: ["Food and dining", "Groceries"])
        let intent = VoiceRules.deterministicParseIntent("Paid 120 AED for dinner with Rahul and Sarah", context: ctx)
        #expect(intent.intent == .splitExpense)
        #expect(intent.amount == 120)
        #expect(intent.currency == "AED")
        #expect(intent.category == "Food and dining")
        #expect(intent.participants.contains("Rahul") && intent.participants.contains("Sarah"))
    }

    @Test("Criterion 8: Triggers clarification loop when amount or participants are missing")
    func criterion8() {
        let ctx = context(["Prakarsh"], categories: ["Food and dining"])
        let missingAmount = VoiceRules.deterministicParseIntent("Split dinner with Rahul", context: ctx)
        #expect(missingAmount.missingFields.contains("amount"))
        #expect(missingAmount.clarificationQuestion == "How much was the expense?")
        let missingPeople = VoiceRules.deterministicParseIntent("Split 100 AED for groceries", context: ctx)
        #expect(missingPeople.missingFields.contains("participants"))
        #expect(missingPeople.clarificationQuestion == "Who would you like to split this with?")
    }

    @Test("Criterion 9: Distinguishes personal spending from group debts accurately")
    func criterion9() {
        let txns = [
            txn("t-p1", amount: 2500, payer: prakarsh),
            txn("t-g1", amount: 10000, payer: rahul, group: "g1"),
            txn("t-inc", .income, amount: 500000, payer: prakarsh),
        ]
        let splits = [split("t-p1", prakarsh, 2500), split("t-g1", prakarsh, 3400), split("t-g1", rahul, 6600)]
        let spend = Balances.personalSpend(userId: prakarsh, transactions: txns, splits: splits)
        #expect(spend.totalSpentMinor == 5900)
        #expect(spend.totalIncomeMinor == 500000)
        #expect(spend.netSavingsMinor == 500000 - 5900)
    }

    @Test("Criterion 10: Percentage and shares splits maintain exact minor unit sums")
    func criterion10() throws {
        let scale = Splits.weightScale
        #expect(try Splits.percentage(10000, scaledPercentages: ["u1": 50 * scale, "u2": 30 * scale, "u3": 20 * scale]).sum == 10000)
        #expect(try Splits.shares(10000, scaledWeights: ["u1": 3 * scale, "u2": scale]) == ["u1": 7500, "u2": 2500])
    }

    @Test("Criterion 11: Careem Pay settlements satisfy Invariant 4 and zero-out liabilities")
    func criterion11() {
        let t = [txn("t-careem-1", amount: 10000, payer: prakarsh, group: "g1")]
        let splits = [split("t-careem-1", prakarsh, 5000), split("t-careem-1", rahul, 5000)]
        #expect(Balances.bilateral(transactions: t, splits: splits, settlements: [])[rahul]?[prakarsh] == 5000)
        let careem = Settlement(id: "s-careem-1", groupId: "g1", senderId: rahul, recipientId: prakarsh, amountMinor: 5000,
                                method: "Careem Pay", reference: "Instant Careem Pay QR settlement", settledAt: PaydJSON.epoch)
        #expect((Balances.bilateral(transactions: t, splits: splits, settlements: [careem])[rahul]?[prakarsh] ?? 0) == 0)
    }
}
