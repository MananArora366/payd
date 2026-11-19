import Foundation
import Testing
@testable import PaydCore

/// Mirrors the action rules in web/src/lib/store/PaydContext.tsx.
struct LedgerActionsTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private var seed: LedgerState { SeedData.make(now: now) }
    private var context: ActionContext { ActionContext(now: now, randomSuffix: "test1") }

    private func expense(_ amount: Int, shares: [ShareAllocation], group: String? = SeedIDs.flatmates) -> NewTransaction {
        NewTransaction(type: .expense, title: "Test", amountMinor: amount, payerId: SeedIDs.manan,
                       groupId: group, splits: shares)
    }

    @Test func addTransactionAppendsTransactionAndSplits() throws {
        let shares = [ShareAllocation(userId: SeedIDs.manan, shareMinor: 600), ShareAllocation(userId: SeedIDs.prakarsh, shareMinor: 400)]
        let (state, txn) = try LedgerActions.addTransaction(expense(1000, shares: shares), to: seed, context: context)
        #expect(state.transactions.count == seed.transactions.count + 1)
        #expect(state.transactions.first?.id == txn.id)
        let totalSplits = state.splits.filter { $0.transactionId == txn.id }.map(\.shareMinor).reduce(0, +)
        #expect(totalSplits == 1000)
        #expect(txn.createdBy == SeedIDs.manan)
        #expect(txn.currency == "AED")
        #expect(seed.transactions.count == 6, "Original state must not be mutated")
    }

    @Test func addTransactionRejectsMismatchedSplits() {
        let shares = [ShareAllocation(userId: SeedIDs.manan, shareMinor: 999)]
        #expect(throws: LedgerInvariantError.self) {
            try LedgerActions.addTransaction(expense(1000, shares: shares), to: seed, context: context)
        }
    }

    @Test func softDeleteAndRestore() throws {
        let id = seed.transactions[0].id
        let deleted = LedgerActions.softDeleteTransaction(id, in: seed, context: context)
        #expect(deleted.transactions.first { $0.id == id }?.deletedAt == now)
        let restored = LedgerActions.restoreTransaction(id, in: deleted, context: context)
        #expect(restored.transactions.first { $0.id == id }?.deletedAt == nil)
    }

    @Test func recordSettlementWithinDebt() throws {
        // Flatmates: Prakarsh owes Manan 24000.
        let input = NewSettlement(groupId: SeedIDs.flatmates, senderId: SeedIDs.prakarsh, recipientId: SeedIDs.manan,
                                  amountMinor: 24000, method: "Cash")
        let (state, settlement) = try LedgerActions.recordSettlement(input, in: seed, context: context)
        #expect(state.settlements.first?.id == settlement.id)
        #expect(settlement.status == .settled)
    }

    @Test func recordSettlementRejectsOverpaymentAndSelfPayment() {
        let over = NewSettlement(groupId: SeedIDs.flatmates, senderId: SeedIDs.prakarsh, recipientId: SeedIDs.manan,
                                 amountMinor: 25000, method: "Cash")
        #expect(throws: LedgerInvariantError.self) {
            try LedgerActions.recordSettlement(over, in: seed, context: context)
        }
        let allowed = NewSettlement(groupId: SeedIDs.flatmates, senderId: SeedIDs.prakarsh, recipientId: SeedIDs.manan,
                                    amountMinor: 25000, method: "Cash", allowOverpayment: true)
        #expect(throws: Never.self) { try LedgerActions.recordSettlement(allowed, in: seed, context: context) }
        let selfPay = NewSettlement(groupId: SeedIDs.flatmates, senderId: SeedIDs.manan, recipientId: SeedIDs.manan,
                                    amountMinor: 1000, method: "Cash")
        #expect(throws: LedgerInvariantError.self) { try LedgerActions.recordSettlement(selfPay, in: seed, context: context) }
    }

    @Test func createGroupAddsCreatorAsAdmin() {
        let (state, group) = LedgerActions.createGroup(name: "Ski Trip", description: "Holiday",
                                                       memberIds: [SeedIDs.aisha], in: seed, context: context)
        let members = state.groupMembers.filter { $0.groupId == group.id }
        #expect(Set(members.map(\.userId)) == [SeedIDs.manan, SeedIDs.aisha])
        #expect(members.first { $0.userId == SeedIDs.manan }?.role == .admin)
    }

    @Test func joinGroupByTokenIsIdempotent() {
        let asAisha = LedgerActions.switchUser(to: SeedIDs.aisha, in: seed)
        let (joined, result) = LedgerActions.joinGroupByToken("dubai-marina-2026", in: asAisha, context: context)
        #expect(result.success)
        #expect(result.group?.id == SeedIDs.flatmates)
        let (again, resultAgain) = LedgerActions.joinGroupByToken(SeedIDs.flatmates, in: joined, context: context)
        #expect(resultAgain.alreadyMember)
        #expect(again.groupMembers.count == joined.groupMembers.count)
    }

    @Test func updateBudgetUpsertsByCategory() {
        let updated = LedgerActions.updateBudget(limitMinor: 1, categoryId: SeedIDs.food, in: seed, context: context)
        #expect(updated.budgets.count == seed.budgets.count)
        #expect(updated.budgets.first { $0.categoryId == SeedIDs.food }?.limitMinor == 1)
        let added = LedgerActions.updateBudget(limitMinor: 7, categoryId: SeedIDs.groceries, in: seed, context: context)
        #expect(added.budgets.count == seed.budgets.count + 1)
    }

    @Test func triggerRecurringBillPostsExpenseAndStampsBill() throws {
        let bill = seed.recurringBills[0]
        let (state, txn) = try LedgerActions.triggerRecurringBillSplit(bill.id, in: seed, context: context)
        #expect(txn.title == "\(bill.title) (Monthly Split)")
        #expect(txn.amountMinor == bill.amountMinor)
        #expect(state.recurringBills.first { $0.id == bill.id }?.lastPostedAt == now)
    }

    @Test func groupQueries() {
        let balances = LedgerQueries.groupBalances(SeedIDs.flatmates, in: seed)
        #expect(balances.values.reduce(0, +) == 0)
        let snapshot = LedgerQueries.snapshot(of: seed, now: now)
        let debts = LedgerQueries.groupSimplifiedDebts(SeedIDs.flatmates, snapshot: snapshot)
        let totalDebt = debts.map(\.amountMinor).reduce(0, +)
        #expect(totalDebt > 0)
    }
}
