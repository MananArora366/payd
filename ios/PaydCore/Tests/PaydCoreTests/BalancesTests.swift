import Foundation
import Testing
@testable import PaydCore

/// Mirrors web/src/lib/ledger/__tests__/ledger.test.ts — "Derived Balances & Settlements"
/// and "Debt Simplification Algorithm".
struct BalancesTests {
    private let prakarsh = "11111111-1111-1111-1111-111111111111"
    private let rahul = "22222222-2222-2222-2222-222222222222"
    private let sarah = "33333333-3333-3333-3333-333333333333"

    private func dinner(deleted: Bool = false) -> Transaction {
        Transaction(
            id: "t1", type: .expense, title: "Dinner", amountMinor: 10000, currency: "AED",
            payerId: prakarsh, groupId: "g1", deletedAt: deleted ? Date() : nil
        )
    }

    private var dinnerSplits: [TransactionSplit] {
        [
            TransactionSplit(id: "s1", transactionId: "t1", userId: prakarsh, shareMinor: 3334),
            TransactionSplit(id: "s2", transactionId: "t1", userId: rahul, shareMinor: 3333),
            TransactionSplit(id: "s3", transactionId: "t1", userId: sarah, shareMinor: 3333),
        ]
    }

    private func settlement(_ from: String, _ to: String, _ amount: Int, status: SettlementStatus = .settled) -> Settlement {
        Settlement(id: UUID().uuidString, senderId: from, recipientId: to, amountMinor: amount, currency: "AED", status: status)
    }

    @Test func netBalancesForExpense() {
        let balances = Balances.net(transactions: [dinner()], splits: dinnerSplits, settlements: [])
        #expect(balances[prakarsh] == 6666)
        #expect(balances[rahul] == -3333)
        #expect(balances[sarah] == -3333)
        #expect(balances.values.reduce(0, +) == 0)
    }

    @Test func settlementsReduceDebt() {
        let balances = Balances.net(
            transactions: [dinner()], splits: dinnerSplits,
            settlements: [settlement(rahul, prakarsh, 3333)]
        )
        #expect(balances[rahul] == 0)
        #expect(balances[sarah] == -3333)
        #expect(balances[prakarsh] == 3333)
    }

    @Test func onlySettledSettlementsCount() {
        let balances = Balances.net(
            transactions: [dinner()], splits: dinnerSplits,
            settlements: [settlement(rahul, prakarsh, 3333, status: .outstanding)]
        )
        #expect(balances[rahul] == -3333)
    }

    @Test func softDeletedTransactionsIgnored() {
        let balances = Balances.net(transactions: [dinner(deleted: true)], splits: dinnerSplits, settlements: [])
        #expect(balances[prakarsh, default: 0] == 0)
        #expect(balances[rahul, default: 0] == 0)
        #expect(balances[sarah, default: 0] == 0)
    }

    @Test func refundReversesExpense() {
        let refund = Transaction(id: "t1", type: .refund, title: "Refund", amountMinor: 10000, currency: "AED", payerId: prakarsh)
        let balances = Balances.net(transactions: [refund], splits: dinnerSplits, settlements: [])
        #expect(balances[prakarsh] == -6666)
        #expect(balances[rahul] == 3333)
    }

    @Test func userFilterSeedsZeroBalances() {
        let balances = Balances.net(transactions: [], splits: [], settlements: [], seeding: ["x"])
        #expect(balances == ["x": 0])
    }

    @Test func validateSettlementAmount() {
        #expect(Balances.isValidSettlement(3333, outstandingDebt: 3333))
        #expect(Balances.isValidSettlement(2000, outstandingDebt: 3333))
        #expect(!(Balances.isValidSettlement(5000, outstandingDebt: 3333)))
        #expect(Balances.isValidSettlement(5000, outstandingDebt: 3333, allowOverpayment: true))
        #expect(!(Balances.isValidSettlement(0, outstandingDebt: 3333, allowOverpayment: true)))
    }

    @Test func bilateralDebtsDeductSettlements() {
        let debts = Balances.bilateral(
            transactions: [dinner()], splits: dinnerSplits,
            settlements: [settlement(rahul, prakarsh, 1000)]
        )
        #expect(debts[rahul]?[prakarsh] == 2333)
        #expect(debts[sarah]?[prakarsh] == 3333)
        #expect(debts[prakarsh] == nil)
    }

    @Test func bilateralDebtClearedWhenFullyRepaid() {
        let debts = Balances.bilateral(
            transactions: [dinner()], splits: dinnerSplits,
            settlements: [settlement(rahul, prakarsh, 3333)]
        )
        #expect(debts[rahul]?[prakarsh] == nil)
    }

    @Test func personalSpend() {
        let coffee = Transaction(id: "t2", type: .expense, title: "Coffee", amountMinor: 2200, currency: "AED", payerId: prakarsh)
        let salary = Transaction(id: "t3", type: .income, title: "Pay", amountMinor: 1_500_000, currency: "AED", payerId: prakarsh)
        let spend = Balances.personalSpend(userId: prakarsh, transactions: [dinner(), coffee, salary], splits: dinnerSplits)
        #expect(spend.totalSpentMinor == 3334 + 2200)
        #expect(spend.totalIncomeMinor == 1_500_000)
        #expect(spend.netSavingsMinor == 1_500_000 - 5534)
    }

    @Test func simplifiesThreePartyDebts() {
        let result = DebtSimplifier.simplify(["alice": 100, "bob": -40, "charlie": -60])
        #expect(result.count == 2)
        #expect(result.contains(SimplifiedDebt(fromUserId: "charlie", toUserId: "alice", amountMinor: 60)))
        #expect(result.contains(SimplifiedDebt(fromUserId: "bob", toUserId: "alice", amountMinor: 40)))
    }

    @Test func simplifyEmptyWhenSettled() {
        #expect(DebtSimplifier.simplify(["user-1": 0, "user-2": 0]) == [])
    }

    @Test func simplifyIsDeterministicOnTies() {
        let balances = ["a": 50, "b": 50, "c": -50, "d": -50]
        let first = DebtSimplifier.simplify(balances)
        for _ in 0..<20 { #expect(DebtSimplifier.simplify(balances) == first) }
        #expect(first.map(\.amountMinor).reduce(0, +) == 100)
    }
}
