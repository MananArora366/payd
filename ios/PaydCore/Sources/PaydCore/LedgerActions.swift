import Foundation

// Port of the mutating actions in web/src/lib/store/PaydContext.tsx as pure functions:
// each takes a LedgerState and returns a new one. The input state is never modified.

public struct NewTransaction: Sendable, Hashable {
    public let type: TransactionType
    public let title: String
    public let amountMinor: Int
    public let currency: String?
    public let categoryId: String?
    public let payerId: String
    public let groupId: String?
    public let paymentMethod: String?
    public let notes: String?
    public let occurredAt: Date?
    public let splits: [ShareAllocation]

    public init(type: TransactionType, title: String, amountMinor: Int, currency: String? = nil,
                categoryId: String? = nil, payerId: String, groupId: String? = nil, paymentMethod: String? = nil,
                notes: String? = nil, occurredAt: Date? = nil, splits: [ShareAllocation]) {
        self.type = type
        self.title = title
        self.amountMinor = amountMinor
        self.currency = currency
        self.categoryId = categoryId
        self.payerId = payerId
        self.groupId = groupId
        self.paymentMethod = paymentMethod
        self.notes = notes
        self.occurredAt = occurredAt
        self.splits = splits
    }
}

public struct NewSettlement: Sendable, Hashable {
    public let groupId: String?
    public let senderId: String
    public let recipientId: String
    public let amountMinor: Int
    public let currency: String?
    public let method: String
    public let reference: String?
    public let allowOverpayment: Bool

    public init(groupId: String? = nil, senderId: String, recipientId: String, amountMinor: Int,
                currency: String? = nil, method: String, reference: String? = nil, allowOverpayment: Bool = false) {
        self.groupId = groupId
        self.senderId = senderId
        self.recipientId = recipientId
        self.amountMinor = amountMinor
        self.currency = currency
        self.method = method
        self.reference = reference
        self.allowOverpayment = allowOverpayment
    }
}

public enum LedgerActions {
    /// Demo invite tokens accepted in addition to raw group IDs (same as the web app).
    static let demoInviteTokens = ["dubai-marina-2026": SeedIDs.flatmates, "hatta-camp-2026": SeedIDs.hattaTrip]

    public static func addTransaction(_ input: NewTransaction, to state: LedgerState,
                                      now: Date = Date()) throws(LedgerError) -> (LedgerState, Transaction) {
        let title = input.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { throw .missingTitle }
        guard input.amountMinor > 0 else { throw .negativeAmount }
        guard input.splits.allSatisfy({ $0.shareMinor >= 0 }) else { throw .negativeAmount }
        let splitSum = input.splits.map(\.shareMinor).reduce(0, +)
        guard splitSum == input.amountMinor else { throw .sumMismatch(expected: input.amountMinor, actual: splitSum) }

        let txn = Transaction(
            id: newId("t"), type: input.type, title: title, amountMinor: input.amountMinor,
            currency: input.currency ?? currentUser(in: state)?.defaultCurrency ?? Currency.defaultCode,
            categoryId: input.categoryId, payerId: input.payerId, groupId: input.groupId,
            paymentMethod: input.paymentMethod ?? "Card", notes: input.notes,
            occurredAt: input.occurredAt ?? now, createdBy: state.currentUserId, createdAt: now
        )
        let splits = input.splits.map {
            TransactionSplit(id: newId("sp"), transactionId: txn.id, userId: $0.userId, shareMinor: $0.shareMinor, createdAt: now)
        }
        var next = state
        next.transactions = [txn] + state.transactions
        next.splits = state.splits + splits
        return (next, txn)
    }

    public static func softDelete(transactionId: String, in state: LedgerState,
                                  now: Date = Date()) throws(LedgerError) -> LedgerState {
        try replacingTransaction(transactionId, in: state) { $0.withDeletedAt(now) }
    }

    public static func restore(transactionId: String, in state: LedgerState) throws(LedgerError) -> LedgerState {
        try replacingTransaction(transactionId, in: state) { $0.withDeletedAt(nil) }
    }

    public static func recordSettlement(_ input: NewSettlement, in state: LedgerState,
                                        now: Date = Date()) throws(LedgerError) -> (LedgerState, Settlement) {
        guard input.senderId != input.recipientId else { throw .selfSettlement }
        let debts = Balances.bilateral(transactions: state.transactions, splits: state.splits, settlements: state.settlements)
        let currentDebt = debts[input.senderId]?[input.recipientId] ?? 0
        guard input.amountMinor > 0 else { throw .negativeAmount }
        guard Balances.isValidSettlement(input.amountMinor, outstandingDebt: currentDebt,
                                         allowOverpayment: input.allowOverpayment) else {
            throw .settlementExceedsDebt(amount: input.amountMinor, debt: currentDebt)
        }

        let settlement = Settlement(
            id: newId("s"), groupId: input.groupId, senderId: input.senderId, recipientId: input.recipientId,
            amountMinor: input.amountMinor, currency: input.currency ?? Currency.defaultCode, method: input.method,
            reference: input.reference, status: .settled, settledAt: now, createdAt: now
        )
        var next = state
        next.settlements = [settlement] + state.settlements
        return (next, settlement)
    }

    public static func createGroup(name: String, description: String?, memberIds: [String],
                                   currency: String = Currency.defaultCode, in state: LedgerState,
                                   now: Date = Date()) throws(LedgerError) -> (LedgerState, Group) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw .missingTitle }
        let group = Group(id: newId("g"), name: trimmed, description: description, currency: currency,
                          creatorId: state.currentUserId, createdAt: now)
        let others = Set(memberIds).subtracting([state.currentUserId]).sorted()
        let members = [GroupMember(groupId: group.id, userId: state.currentUserId, role: .admin, joinedAt: now)]
            + others.map { GroupMember(groupId: group.id, userId: $0, role: .member, joinedAt: now) }
        var next = state
        next.groups = state.groups + [group]
        next.groupMembers = state.groupMembers + members
        return (next, group)
    }

    public static func joinGroup(token: String, in state: LedgerState,
                                 now: Date = Date()) throws(LedgerError) -> (LedgerState, Group) {
        let groupId = demoInviteTokens[token] ?? token
        guard let group = state.groups.first(where: { $0.id == groupId }) else { throw .invalidInvite }
        let alreadyMember = state.groupMembers.contains { $0.groupId == group.id && $0.userId == state.currentUserId }
        guard !alreadyMember else { return (state, group) }
        var next = state
        next.groupMembers = state.groupMembers + [GroupMember(groupId: group.id, userId: state.currentUserId, joinedAt: now)]
        return (next, group)
    }

    public static func switchUser(to userId: String, in state: LedgerState) throws(LedgerError) -> LedgerState {
        guard state.users.contains(where: { $0.id == userId }) else { throw .notFound(userId) }
        var next = state
        next.currentUserId = userId
        return next
    }

    /// Inserts or replaces the current user's monthly budget for `categoryId` (nil = overall).
    public static func updateBudget(limitMinor: Int, categoryId: String?, in state: LedgerState) -> LedgerState {
        let matches = { (budget: Budget) in budget.userId == state.currentUserId && budget.categoryId == categoryId }
        var next = state
        if let existing = state.budgets.first(where: matches) {
            let replacement = Budget(id: existing.id, userId: existing.userId, categoryId: categoryId,
                                     limitMinor: limitMinor, period: existing.period)
            next.budgets = state.budgets.map { matches($0) ? replacement : $0 }
        } else {
            next.budgets = state.budgets + [Budget(id: newId("b"), userId: state.currentUserId,
                                                   categoryId: categoryId, limitMinor: limitMinor)]
        }
        return next
    }

    public static func addRecurringBill(_ bill: RecurringBill, to state: LedgerState) throws(LedgerError) -> LedgerState {
        guard !bill.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw .missingTitle }
        _ = try Splits.verified(Dictionary(bill.splits.map { ($0.userId, $0.shareMinor) }, uniquingKeysWith: +),
                                total: bill.amountMinor)
        var next = state
        next.recurringBills = [bill] + state.recurringBills
        return next
    }

    public static func deleteRecurringBill(id: String, in state: LedgerState) -> LedgerState {
        var next = state
        next.recurringBills = state.recurringBills.filter { $0.id != id }
        return next
    }

    /// Posts one cycle of a recurring bill as a group expense and stamps `lastPostedAt`.
    public static func triggerRecurringBill(id: String, in state: LedgerState,
                                            now: Date = Date()) throws(LedgerError) -> (LedgerState, Transaction) {
        guard let bill = state.recurringBills.first(where: { $0.id == id }) else { throw .notFound(id) }
        let period: String = switch bill.frequency {
        case .weekly: "Weekly"
        case .monthly: "Monthly"
        case .yearly: "Annual"
        }
        let input = NewTransaction(
            type: .expense, title: "\(bill.title) (\(period) Split)", amountMinor: bill.amountMinor,
            currency: bill.currency, categoryId: bill.categoryId, payerId: bill.payerId, groupId: bill.groupId,
            paymentMethod: "Auto-Debit / Card", notes: bill.notes ?? "Recurring bill posted automatically",
            occurredAt: now, splits: bill.splits
        )
        var (next, txn) = try addTransaction(input, to: state, now: now)
        next.recurringBills = state.recurringBills.map { $0.id == id ? $0.withLastPostedAt(now) : $0 }
        return (next, txn)
    }

    public static func resetToDemo(now: Date = Date()) -> LedgerState {
        SeedData.make(now: now)
    }

    // MARK: - Helpers

    static func currentUser(in state: LedgerState) -> User? {
        state.users.first { $0.id == state.currentUserId }
    }

    private static func replacingTransaction(_ id: String, in state: LedgerState,
                                             transform: (Transaction) -> Transaction) throws(LedgerError) -> LedgerState {
        guard state.transactions.contains(where: { $0.id == id }) else { throw .notFound(id) }
        var next = state
        next.transactions = state.transactions.map { $0.id == id ? transform($0) : $0 }
        return next
    }

    private static func newId(_ prefix: String) -> String {
        "\(prefix)-\(UUID().uuidString.lowercased())"
    }
}

extension RecurringBill {
    func withLastPostedAt(_ date: Date) -> RecurringBill {
        RecurringBill(id: id, title: title, amountMinor: amountMinor, currency: currency, categoryId: categoryId,
                      payerId: payerId, groupId: groupId, frequency: frequency, dueDay: dueDay, notes: notes,
                      autoPost: autoPost, lastPostedAt: date, splits: splits, createdAt: createdAt)
    }
}
