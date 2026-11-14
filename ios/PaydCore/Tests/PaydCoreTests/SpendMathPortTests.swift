import Foundation
import Testing
@testable import PaydCore

/// Port of web/src/components/analytics/spendMath.test.ts.
struct SpendMathPortTests {
    private let me = "me"

    private func t(_ id: String = "t", type: TransactionType = .expense, title: String = "Thing", amount: Int = 10000,
                   category: String? = nil, payer: String = "me", group: String? = nil, payment: String? = nil,
                   notes: String? = nil, at: String = "2026-11-10T10:00:00.000Z", deleted: String? = nil) -> Transaction {
        Transaction(id: id, type: type, title: title, amountMinor: amount, categoryId: category, payerId: payer,
                    groupId: group, paymentMethod: payment, notes: notes, occurredAt: isoDate(at),
                    deletedAt: deleted.map { PaydJSON.parseDate($0) ?? PaydJSON.epoch })
    }

    private let splits = [split("g1", "me", 3334), split("g1", "b", 3333), split("g1", "c", 3333),
                          split("g2", "b", 5000), split("g2", "c", 5000)]

    @Test("uses my split share, full amount for personal, 0 when not a participant or income")
    func myShare() {
        #expect(SpendMath.myExpenseShareMinor(t("g1", payer: "b", group: "G"), userId: me, splits: splits) == 3334)
        #expect(SpendMath.myExpenseShareMinor(t("p1"), userId: me, splits: splits) == 10000)
        #expect(SpendMath.myExpenseShareMinor(t("g2", payer: "b", group: "G"), userId: me, splits: splits) == 0)
        #expect(SpendMath.myExpenseShareMinor(t("i1", type: .income), userId: me, splits: splits) == 0)
        #expect(!SpendMath.isParticipant(t("g2"), userId: me, splits: splits))
        #expect(SpendMath.isParticipant(t("g1"), userId: me, splits: splits))
    }

    @Test("sorts newest first without mutating")
    func sorts() {
        let list = [t("a", at: "2026-11-01T00:00:00Z"), t("b", at: "2026-11-12T00:00:00Z"), t("c", at: "2026-11-05T00:00:00Z")]
        #expect(SpendMath.sortedByDateDesc(list).map(\.id) == ["b", "c", "a"])
        #expect(list.map(\.id) == ["a", "b", "c"])
    }

    @Test("group spend excludes income, refunds and deleted")
    func groupSpend() {
        let list = [t("1", amount: 1000, group: "G"), t("2", type: .income, amount: 99999, group: "G"),
                    t("3", type: .refund, amount: 500, group: "G"),
                    t("4", amount: 700, group: "G", deleted: "2026-11-11T00:00:00Z"), t("5", amount: 300, group: "H")]
        #expect(SpendMath.groupSpendMinor("G", transactions: list) == 1000)
    }

    @Test("detects Careem by payment method / notes / title, not by \"ride\" substring or income")
    func careem() {
        #expect(SpendMath.isCareemExpense(t(payment: "Careem Pay")))
        #expect(SpendMath.isCareemExpense(t(notes: "Careem · Careem Ride · ref X")))
        #expect(SpendMath.isCareemExpense(t(title: "Careem ride to Dubai Marina")))
        #expect(!SpendMath.isCareemExpense(t(title: "Bride shower gift")))
        #expect(!SpendMath.isCareemExpense(t(title: "Friday ride share")))
        #expect(!SpendMath.isCareemExpense(t(type: .income, payment: "Careem Pay")))
    }

    @Test("category shares count only my share in the current month")
    func categoryShares() {
        let now = isoDate("2026-11-14T12:00:00Z")
        let list = [t("g1", category: "food", payer: "b", group: "G"), t("g2", category: "food", payer: "b", group: "G"),
                    t("p1", amount: 2000, category: "groceries"),
                    t("old", amount: 5000, category: "groceries", at: "2026-10-20T00:00:00Z"),
                    t("inc", type: .income, amount: 900000)]
        let result = SpendMath.monthlyCategoryShares(userId: me, transactions: list, splits: splits, now: now)
        #expect(result.totalMinor == 5334)
        #expect(result.totals.map(\.id) == ["food", "groceries"])
        #expect(result.totals.map(\.totalMinor) == [3334, 2000])
    }

    @Test("volume splits expense and income and skips deleted")
    func volume() {
        let list = [t(amount: 100), t(type: .income, amount: 5000), t(amount: 900, deleted: "x")]
        let volume = SpendMath.volumeByType(list)
        #expect(volume.expenseMinor == 100 && volume.incomeMinor == 5000)
    }
}
