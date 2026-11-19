import Foundation

// Port of every action in web/src/lib/store/PaydContext.tsx as a pure function: each takes a
// LedgerState (plus an injected clock and randomness) and returns a new one. Inputs are never modified.

/// Injected clock + randomness so actions stay pure and testable.
public struct ActionContext: Sendable {
    public let now: Date
    /// 5 lowercase base-36 characters (`Math.random().toString(36).substring(2, 7)`).
    public let randomSuffix: String

    public init(now: Date, randomSuffix: String) {
        self.now = now
        self.randomSuffix = randomSuffix
    }

    /// The real clock (whole milliseconds, like `Date.now()`) and a random suffix.
    public static func live() -> ActionContext {
        let alphabet = Array("0123456789abcdefghijklmnopqrstuvwxyz")
        let suffix = String((0..<5).map { _ in alphabet[Int.random(in: 0..<alphabet.count)] })
        return ActionContext(now: Date().truncatedToMilliseconds, randomSuffix: suffix)
    }

    /// `Date.now()`.
    public var epochMillis: Int { PaydJSON.epochMillis(now) }
}

/// `AddTransactionInput`.
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

/// `RecordSettlementInput`.
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

    var validationInput: SettlementValidationInput {
        SettlementValidationInput(senderId: senderId, recipientId: recipientId, amountMinor: amountMinor,
                                  groupId: groupId, allowOverpayment: allowOverpayment)
    }
}

/// `Omit<RecurringBill, 'id' | 'created_at'>`.
public struct NewRecurringBill: Sendable, Hashable {
    public let title: String
    public let amountMinor: Int
    public let currency: String
    public let categoryId: String?
    public let payerId: String
    public let groupId: String?
    public let frequency: RecurringFrequency
    public let dueDay: Int
    public let notes: String?
    public let autoPost: Bool
    public let lastPostedAt: Date?
    public let splits: [ShareAllocation]

    public init(title: String, amountMinor: Int, currency: String = Currency.ledgerCode, categoryId: String?,
                payerId: String, groupId: String?, frequency: RecurringFrequency, dueDay: Int, notes: String?,
                autoPost: Bool = false, lastPostedAt: Date? = nil, splits: [ShareAllocation]) {
        self.title = title
        self.amountMinor = amountMinor
        self.currency = currency
        self.categoryId = categoryId
        self.payerId = payerId
        self.groupId = groupId
        self.frequency = frequency
        self.dueDay = dueDay
        self.notes = notes
        self.autoPost = autoPost
        self.lastPostedAt = lastPostedAt
        self.splits = splits
    }
}

/// `Partial<User>` as used by the profile screen.
public struct UserProfileUpdate: Sendable, Hashable {
    public let name: String?
    public let defaultCurrency: String?

    public init(name: String? = nil, defaultCurrency: String? = nil) {
        self.name = name
        self.defaultCurrency = defaultCurrency
    }
}

/// `JoinGroupResult`.
public struct JoinGroupResult: Sendable, Equatable {
    public let success: Bool
    public let group: Group?
    public let error: String?
    /// True when the user was already in the group (success is still true).
    public let alreadyMember: Bool
    /// Friendly status text, e.g. "You're already a member of Dubai Flatmates."
    public let message: String?

    public init(success: Bool, group: Group? = nil, error: String? = nil, alreadyMember: Bool = false,
                message: String? = nil) {
        self.success = success
        self.group = group
        self.error = error
        self.alreadyMember = alreadyMember
        self.message = message
    }
}

public enum LedgerActions {
    private static func json(_ value: some Encodable) -> JSONValue {
        (try? JSONValue(encoding: value)) ?? .null
    }

    private static func audit(_ action: AuditAction, _ recordType: AuditRecordType, recordId: String,
                              before: JSONValue?, after: JSONValue?, state: LedgerState,
                              context: ActionContext) -> AuditLog {
        AuditLog(id: "al-\(context.epochMillis)", actorId: LedgerQueries.currentUser(in: state).id, action: action,
                 recordType: recordType, recordId: recordId, before: before, after: after, createdAt: context.now)
    }

    /// PaydContext.tsx:294-347. The only check is that the splits sum to the amount.
    public static func addTransaction(_ input: NewTransaction, to state: LedgerState,
                                      context: ActionContext) throws(LedgerInvariantError) -> (LedgerState, Transaction) {
        let splitSum = input.splits.reduce(0) { $0 + $1.shareMinor }
        if splitSum != input.amountMinor {
            throw LedgerInvariantError("Split sum (\(splitSum)) does not equal transaction amount (\(input.amountMinor))")
        }
        let txnId = "t-\(context.epochMillis)-\(context.randomSuffix)"
        let txn = Transaction(
            id: txnId, type: input.type, title: input.title, amountMinor: input.amountMinor, currency: "AED",
            categoryId: input.categoryId.nonEmpty, payerId: input.payerId, groupId: input.groupId.nonEmpty,
            paymentMethod: input.paymentMethod.nonEmpty ?? "Card", notes: input.notes.nonEmpty,
            occurredAt: input.occurredAt ?? context.now, createdBy: LedgerQueries.currentUser(in: state).id,
            createdAt: context.now)
        let newSplits = input.splits.enumerated().map { index, split in
            TransactionSplit(id: "sp-\(txnId)-\(index)", transactionId: txnId, userId: split.userId,
                             shareMinor: split.shareMinor, createdAt: context.now)
        }
        let entry = audit(.insert, .transaction, recordId: txnId, before: nil,
                          after: .object(["transaction": json(txn), "splits": json(newSplits)]),
                          state: state, context: context)
        let next = state.with(transactions: [txn] + state.transactions, splits: state.splits + newSplits,
                              auditLogs: [entry] + state.auditLogs)
        return (next, txn)
    }

    /// PaydContext.tsx:349-370. No-op when missing or already deleted.
    public static func softDeleteTransaction(_ id: String, in state: LedgerState, context: ActionContext) -> LedgerState {
        guard let existing = state.transactions.first(where: { $0.id == id }), !existing.isDeleted else { return state }
        let updated = existing.withDeletedAt(context.now)
        let entry = audit(.softDelete, .transaction, recordId: id, before: json(existing), after: json(updated),
                          state: state, context: context)
        return state.with(transactions: state.transactions.map { $0.id == id ? updated : $0 },
                          auditLogs: [entry] + state.auditLogs)
    }

    /// PaydContext.tsx:372-393. No-op when missing or not deleted; `after` has no `deleted_at` key.
    public static func restoreTransaction(_ id: String, in state: LedgerState, context: ActionContext) -> LedgerState {
        guard let existing = state.transactions.first(where: { $0.id == id }), existing.isDeleted else { return state }
        let updated = existing.withDeletedAt(nil)
        let entry = audit(.restore, .transaction, recordId: id, before: json(existing), after: json(updated),
                          state: state, context: context)
        return state.with(transactions: state.transactions.map { $0.id == id ? updated : $0 },
                          auditLogs: [entry] + state.auditLogs)
    }

    /// PaydContext.tsx:395-435. Validates against the unified debt model first.
    public static func recordSettlement(_ input: NewSettlement, in state: LedgerState,
                                        context: ActionContext) throws(LedgerInvariantError) -> (LedgerState, Settlement) {
        let grouped = Balances.groupedBilateral(transactions: state.transactions, splits: state.splits,
                                                settlements: state.settlements)
        let check = LedgerQueries.validateSettlement(input.validationInput, in: state, grouped: grouped,
                                                     bilateral: Balances.bilateral(fromGrouped: grouped))
        if let reason = check.reason { throw LedgerInvariantError(reason) }
        let id = "s-\(context.epochMillis)-\(context.randomSuffix)"
        let settlement = Settlement(
            id: id, groupId: input.groupId.nonEmpty, senderId: input.senderId, recipientId: input.recipientId,
            amountMinor: input.amountMinor, currency: "AED", method: input.method.nonEmpty ?? "Cash",
            reference: input.reference.nonEmpty, status: .settled, settledAt: context.now, createdAt: context.now)
        let entry = audit(.insert, .settlement, recordId: id, before: nil, after: json(settlement),
                          state: state, context: context)
        return (state.with(settlements: [settlement] + state.settlements, auditLogs: [entry] + state.auditLogs), settlement)
    }

    /// PaydContext.tsx:437-463. AED-only; the current user is the admin. No audit entry.
    public static func createGroup(name: String, description: String, memberIds: [String], currency: String = "AED",
                                   in state: LedgerState, context: ActionContext) -> (LedgerState, Group) {
        let creator = LedgerQueries.currentUser(in: state).id
        let group = Group(id: "g-\(context.epochMillis)", name: name, description: description, currency: "AED",
                          creatorId: creator, createdAt: context.now)
        let members = ([creator] + memberIds).uniqued().map {
            GroupMember(groupId: group.id, userId: $0, role: $0 == creator ? .admin : .member, joinedAt: context.now)
        }
        return (state.with(groups: [group] + state.groups, groupMembers: state.groupMembers + members), group)
    }

    /// PaydContext.tsx:465-499: a full invite URL, `/join/<token>`, a group id or a demo token.
    public static func joinGroupByToken(_ input: String, in state: LedgerState,
                                        context: ActionContext) -> (LedgerState, JoinGroupResult) {
        let token = GroupLogic.extractJoinToken(input)
        if token.isEmpty { return (state, JoinGroupResult(success: false, error: "Paste an invite link or code first.")) }
        let lower = token.lowercased()
        let target = state.groups.first { $0.id == token }
            ?? (lower == "dubai-marina-2026" ? state.groups.first { $0.name.contains("Flatmates") } : nil)
            ?? (lower == "hatta-camp-2026" ? state.groups.first { $0.name.contains("Hatta") } : nil)
        guard let target else {
            return (state, JoinGroupResult(success: false, error: "That invite link is invalid or has expired."))
        }
        let current = LedgerQueries.currentUser(in: state).id
        if state.groupMembers.contains(where: { $0.groupId == target.id && $0.userId == current }) {
            return (state, JoinGroupResult(success: true, group: target, alreadyMember: true,
                                           message: "You're already a member of \(target.name)."))
        }
        let member = GroupMember(groupId: target.id, userId: current, role: .member, joinedAt: context.now)
        return (state.with(groupMembers: state.groupMembers + [member]),
                JoinGroupResult(success: true, group: target, alreadyMember: false, message: "Joined \(target.name)!"))
    }

    /// PaydContext.tsx:501-525: replaces the limit of the first matching budget, else appends a monthly one.
    public static func updateBudget(limitMinor: Int, categoryId: String?, in state: LedgerState,
                                    context: ActionContext) -> LedgerState {
        let current = LedgerQueries.currentUser(in: state).id
        let category = categoryId.nonEmpty
        if let index = state.budgets.firstIndex(where: { $0.userId == current && $0.categoryId == category }) {
            let budgets = state.budgets.enumerated().map { $0.offset == index ? $0.element.withLimitMinor(limitMinor) : $0.element }
            return state.with(budgets: budgets)
        }
        let budget = Budget(id: "b-\(context.epochMillis)", userId: current, categoryId: category,
                            limitMinor: limitMinor, period: .monthly, createdAt: context.now)
        return state.with(budgets: state.budgets + [budget])
    }

    /// PaydContext.tsx:527-532: applies the non-nil fields to the current user.
    public static func updateUserProfile(_ update: UserProfileUpdate, in state: LedgerState) -> LedgerState {
        let current = LedgerQueries.currentUser(in: state)
        let updated = current.with(name: update.name, defaultCurrency: update.defaultCurrency)
        return state.with(users: state.users.map { $0.id == current.id ? updated : $0 })
    }

    /// `switchUser`: only when the user exists.
    public static func switchUser(to userId: String, in state: LedgerState) -> LedgerState {
        guard state.users.contains(where: { $0.id == userId }) else { return state }
        return state.with(currentUserId: userId)
    }

    public static func resetToDemoData(context: ActionContext) -> LedgerState {
        SeedData.make(now: context.now)
    }

    /// PaydContext.tsx:535-543.
    public static func addRecurringBill(_ bill: NewRecurringBill, to state: LedgerState,
                                        context: ActionContext) -> (LedgerState, RecurringBill) {
        let created = RecurringBill(
            id: "rec-\(context.epochMillis)", title: bill.title, amountMinor: bill.amountMinor, currency: bill.currency,
            categoryId: bill.categoryId, payerId: bill.payerId, groupId: bill.groupId, frequency: bill.frequency,
            dueDay: bill.dueDay, notes: bill.notes, autoPost: bill.autoPost, lastPostedAt: bill.lastPostedAt,
            splits: bill.splits, createdAt: context.now)
        return (state.with(recurringBills: [created] + state.recurringBills), created)
    }

    public static func deleteRecurringBill(_ id: String, in state: LedgerState) -> LedgerState {
        state.with(recurringBills: state.recurringBills.filter { $0.id != id })
    }

    /// PaydContext.tsx:549-575: posts one cycle through `addTransaction`, then stamps `last_posted_at`.
    public static func triggerRecurringBillSplit(_ id: String, in state: LedgerState,
                                                 context: ActionContext) throws(LedgerInvariantError) -> (LedgerState, Transaction) {
        guard let bill = state.recurringBills.first(where: { $0.id == id }) else {
            throw LedgerInvariantError("Recurring bill template not found")
        }
        let period = switch bill.frequency {
        case .monthly: "Monthly"
        case .weekly: "Weekly"
        case .yearly: "Annual"
        }
        let input = NewTransaction(
            type: .expense, title: "\(bill.title) (\(period) Split)", amountMinor: bill.amountMinor,
            currency: bill.currency, categoryId: bill.categoryId, payerId: bill.payerId, groupId: bill.groupId,
            paymentMethod: "Auto-Debit / Card",
            notes: bill.notes.nonEmpty ?? "Recurring subscription automatically triggered on \(PaydFormat.aeDate(context.now))",
            splits: bill.splits)
        let (posted, txn) = try addTransaction(input, to: state, context: context)
        let bills = posted.recurringBills.map { $0.id == id ? $0.withLastPostedAt(context.now) : $0 }
        return (posted.with(recurringBills: bills), txn)
    }
}
