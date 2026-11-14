import Foundation
import Testing
@testable import PaydCore

/// Mirrors the action rules in web/src/lib/store/PaydContext.tsx.
struct LedgerActionsTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private var seed: LedgerState { SeedData.make(now: now) }

    private func expense(_ amount: Int, shares: [ShareAllocation], group: String? = SeedIDs.flatmates) -> NewTransaction {
        NewTransaction(type: .expense, title: "Test", amountMinor: amount, payerId: SeedIDs.manan,
                       groupId: group, splits: shares)
    }

    @Test func addTransactionAppendsTransactionAndSplits() throws {
        let shares = [ShareAllocation(userId: SeedIDs.manan, shareMinor: 600), ShareAllocation(userId: SeedIDs.rahul, shareMinor: 400)]
        let (state, txn) = try LedgerActions.addTransaction(expense(1000, shares: shares), to: seed, now: now)
        #expect(state.transactions.count == seed.transactions.count + 1)
        #expect(state.transactions.first?.id == txn.id)
        #expect(state.splits.filter { $0.transactionId == txn.id }.map(\.shareMinor).reduce(0, +) == 1000)
        #expect(txn.createdBy == SeedIDs.manan)
        #expect(txn.currency == "AED")
        #expect(seed.transactions.count == 4, "Original state must not be mutated")
    }

    @Test func addTransactionRejectsMismatchedSplits() {
        let shares = [ShareAllocation(userId: SeedIDs.manan, shareMinor: 999)]
        #expect(throws: LedgerError.sumMismatch(expected: 1000, actual: 999)) {
            try LedgerActions.addTransaction(expense(1000, shares: shares), to: seed, now: now)
        }
    }

    @Test func addTransactionRejectsBlankTitleAndNonPositiveAmount() {
        let blank = NewTransaction(type: .expense, title: "  ", amountMinor: 100, payerId: SeedIDs.manan,
                                   splits: [ShareAllocation(userId: SeedIDs.manan, shareMinor: 100)])
        #expect(throws: LedgerError.missingTitle) { try LedgerActions.addTransaction(blank, to: seed, now: now) }
        #expect(throws: LedgerError.negativeAmount) {
            try LedgerActions.addTransaction(expense(0, shares: []), to: seed, now: now)
        }
    }

    @Test func softDeleteAndRestore() throws {
        let id = seed.transactions[0].id
        let deleted = try LedgerActions.softDelete(transactionId: id, in: seed, now: now)
        #expect(deleted.transactions.first { $0.id == id }?.deletedAt == now)
        let restored = try LedgerActions.restore(transactionId: id, in: deleted)
        #expect(restored.transactions.first { $0.id == id }?.deletedAt == nil)
        #expect(throws: LedgerError.notFound("missing")) { try LedgerActions.softDelete(transactionId: "missing", in: seed) }
    }

    @Test func recordSettlementWithinDebt() throws {
        // Seed: Sarah owes Manan 3333 (dinner) and has repaid 5000, so her bilateral debt to Manan is cleared;
        // Manan owes Rahul 8000 for groceries.
        let input = NewSettlement(groupId: SeedIDs.flatmates, senderId: SeedIDs.manan, recipientId: SeedIDs.rahul,
                                  amountMinor: 8000, method: "Cash")
        let (state, settlement) = try LedgerActions.recordSettlement(input, in: seed, now: now)
        #expect(state.settlements.first?.id == settlement.id)
        #expect(settlement.status == .settled)
    }

    @Test func recordSettlementRejectsOverpaymentAndSelfPayment() {
        let over = NewSettlement(senderId: SeedIDs.manan, recipientId: SeedIDs.rahul, amountMinor: 8001, method: "Cash")
        #expect(throws: LedgerError.settlementExceedsDebt(amount: 8001, debt: 8000)) {
            try LedgerActions.recordSettlement(over, in: seed, now: now)
        }
        let allowed = NewSettlement(senderId: SeedIDs.manan, recipientId: SeedIDs.rahul, amountMinor: 8001,
                                    method: "Cash", allowOverpayment: true)
        #expect(throws: Never.self) { try LedgerActions.recordSettlement(allowed, in: seed, now: now) }
        let selfPay = NewSettlement(senderId: SeedIDs.manan, recipientId: SeedIDs.manan, amountMinor: 1, method: "Cash")
        #expect(throws: LedgerError.selfSettlement) { try LedgerActions.recordSettlement(selfPay, in: seed, now: now) }
    }

    @Test func createGroupAddsCreatorAsAdmin() throws {
        let (state, group) = try LedgerActions.createGroup(name: "Ski Trip", description: nil,
                                                           memberIds: [SeedIDs.priya], in: seed, now: now)
        let members = state.groupMembers.filter { $0.groupId == group.id }
        #expect(Set(members.map(\.userId)) == [SeedIDs.manan, SeedIDs.priya])
        #expect(members.first { $0.userId == SeedIDs.manan }?.role == .admin)
        #expect(throws: LedgerError.missingTitle) {
            try LedgerActions.createGroup(name: " ", description: nil, memberIds: [], in: seed)
        }
    }

    @Test func joinGroupByTokenIsIdempotent() throws {
        let asPriya = try LedgerActions.switchUser(to: SeedIDs.priya, in: seed)
        let (joined, group) = try LedgerActions.joinGroup(token: "dubai-marina-2026", in: asPriya, now: now)
        #expect(group.id == SeedIDs.flatmates)
        let (again, _) = try LedgerActions.joinGroup(token: SeedIDs.flatmates, in: joined, now: now)
        #expect(again.groupMembers.count == joined.groupMembers.count)
        #expect(throws: LedgerError.invalidInvite) { try LedgerActions.joinGroup(token: "nope", in: seed) }
    }

    @Test func updateBudgetUpsertsByCategory() {
        let updated = LedgerActions.updateBudget(limitMinor: 1, categoryId: SeedIDs.food, in: seed)
        #expect(updated.budgets.count == seed.budgets.count)
        #expect(updated.budgets.first { $0.categoryId == SeedIDs.food }?.limitMinor == 1)
        let added = LedgerActions.updateBudget(limitMinor: 7, categoryId: SeedIDs.groceries, in: seed)
        #expect(added.budgets.count == seed.budgets.count + 1)
    }

    @Test func triggerRecurringBillPostsExpenseAndStampsBill() throws {
        let bill = seed.recurringBills[0]
        let (state, txn) = try LedgerActions.triggerRecurringBill(id: bill.id, in: seed, now: now)
        #expect(txn.title == "\(bill.title) (Monthly Split)")
        #expect(txn.amountMinor == bill.amountMinor)
        #expect(state.recurringBills.first { $0.id == bill.id }?.lastPostedAt == now)
    }

    @Test func groupQueries() {
        let balances = LedgerQueries.groupBalances(SeedIDs.flatmates, in: seed)
        #expect(balances.values.reduce(0, +) == 0)
        #expect(Set(balances.keys) == [SeedIDs.manan, SeedIDs.rahul, SeedIDs.sarah])
        #expect(LedgerQueries.groupMembers(SeedIDs.hattaTrip, in: seed).map(\.name).sorted() == ["Manan Arora", "Priya", "Rahul"])
        let debts = LedgerQueries.simplifiedDebts(SeedIDs.flatmates, in: seed)
        #expect(debts.map(\.amountMinor).reduce(0, +) > 0)
    }

    @Test func owedSummaryForCurrentUser() {
        let summary = LedgerQueries.owedSummary(for: SeedIDs.manan, in: seed)
        // Rahul owed Manan 3333 and repaid 3333; Sarah owed 3333 and repaid 5000 → nothing owed to Manan.
        #expect(summary.owedToMeMinor == 0)
        #expect(summary.iOweMinor == 8000)
    }
}
