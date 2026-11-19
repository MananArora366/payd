import Foundation

// Port of web/src/components/analytics/spendMath.ts (Home, Activity and analytics cards).

public enum SpendMath {
    /// `getMyExpenseShareMinor`: my split row, else the full amount of a personal expense I paid, else 0.
    public static func myExpenseShareMinor(_ t: Transaction, userId: String, splits: [TransactionSplit]) -> Int {
        guard t.type == .expense else { return 0 }
        if let mine = splits.first(where: { $0.transactionId == t.id && $0.userId == userId }) { return mine.shareMinor }
        if t.groupId.nonEmpty == nil && t.payerId == userId { return t.amountMinor }
        return 0
    }

    /// True when the user has a split row on the transaction.
    public static func isParticipant(_ t: Transaction, userId: String, splits: [TransactionSplit]) -> Bool {
        splits.contains { $0.transactionId == t.id && $0.userId == userId }
    }

    /// `sortByDateDesc`: newest `occurred_at` first, then newest `created_at` (stable, ms precision).
    public static func sortedByDateDesc(_ items: [Transaction]) -> [Transaction] {
        items.stableSorted { a, b in
            let (ao, bo) = (PaydJSON.epochMillis(a.occurredAt), PaydJSON.epochMillis(b.occurredAt))
            if ao != bo { return ao > bo }
            return PaydJSON.epochMillis(a.createdAt) > PaydJSON.epochMillis(b.createdAt)
        }
    }

    /// Non-deleted expenses of a group.
    public static func groupSpendMinor(_ groupId: String, transactions: [Transaction]) -> Int {
        transactions.filter { $0.groupId == groupId && !$0.isDeleted && $0.type == .expense }
            .reduce(0) { $0 + $1.amountMinor }
    }

    private static let careemNotes = JSRegex("^careem\\b", "i")
    private static let careemTitle = JSRegex("\\bcareem\\b", "i")

    /// Paid with Careem Pay, saved from a Careem event, or titled "Careem …".
    public static func isCareemExpense(_ t: Transaction) -> Bool {
        if t.type != .expense || t.isDeleted { return false }
        if (t.paymentMethod ?? "").lowercased().contains("careem") { return true }
        if careemNotes.test((t.notes ?? "").jsTrimmed) { return true }
        return careemTitle.test(t.title)
    }

    public static func isSameMonth(_ date: Date, _ now: Date, calendar: Calendar = .current) -> Bool {
        calendar.component(.year, from: date) == calendar.component(.year, from: now)
            && calendar.component(.month, from: date) == calendar.component(.month, from: now)
    }

    /// My share per category for expenses this month, largest first; key "other" for no category.
    public static func monthlyCategoryShares(userId: String, transactions: [Transaction], splits: [TransactionSplit],
                                             now: Date, calendar: Calendar = .current)
        -> (totals: [(id: String, totalMinor: Int)], totalMinor: Int) {
        var map = Shares()
        var total = 0
        for t in transactions where !t.isDeleted && t.type == .expense && isSameMonth(t.occurredAt, now, calendar: calendar) {
            let share = myExpenseShareMinor(t, userId: userId, splits: splits)
            guard share > 0 else { continue }
            map.add(t.categoryId.nonEmpty ?? "other", share)
            total += share
        }
        let totals = map.map { (id: $0.key, totalMinor: $0.value) }.stableSorted { $0.totalMinor > $1.totalMinor }
        return (totals, total)
    }

    /// Sums of expense and income amounts (non-deleted).
    public static func volumeByType(_ transactions: [Transaction]) -> (expenseMinor: Int, incomeMinor: Int) {
        var expense = 0
        var income = 0
        for t in transactions where !t.isDeleted {
            if t.type == .expense { expense += t.amountMinor } else if t.type == .income { income += t.amountMinor }
        }
        return (expense, income)
    }
}
