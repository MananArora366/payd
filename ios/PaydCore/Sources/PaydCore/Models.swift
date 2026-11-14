import Foundation

// Swift mirror of web/src/types/database.ts and the persisted `payd_state_v3` blob
// (web/src/lib/store/PaydContext.tsx). All money is integer minor units (fils).
// Every type has explicit CodingKeys; optionals the web stores as `null` are encoded as null,
// optionals the web leaves `undefined` are omitted. Decoding accepts a missing key or null.

public enum TransactionType: String, Codable, Sendable, CaseIterable { case expense, income, refund, transfer, adjustment }
public enum GroupRole: String, Codable, Sendable { case admin, member }
public enum SettlementStatus: String, Codable, Sendable {
    case outstanding, partiallySettled = "partially_settled", settled, disputed
}
public enum SplitMethod: String, Codable, Sendable, CaseIterable { case equal, exact, percentage, shares }
public enum RecurringFrequency: String, Codable, Sendable, CaseIterable { case weekly, monthly, yearly }
public enum BudgetPeriod: String, Codable, Sendable { case weekly, monthly, yearly }
public enum AuditAction: String, Codable, Sendable { case insert, update, softDelete = "soft_delete", restore }
public enum AuditRecordType: String, Codable, Sendable { case transaction, settlement, group, split }

public struct User: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let email: String
    public let defaultCurrency: String
    public let avatarUrl: String?
    public let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name, email, defaultCurrency = "default_currency", avatarUrl = "avatar_url", createdAt = "created_at"
    }

    public init(id: String, name: String, email: String, defaultCurrency: String = Currency.defaultCode,
                avatarUrl: String? = nil, createdAt: Date) {
        self.id = id
        self.name = name
        self.email = email
        self.defaultCurrency = defaultCurrency
        self.avatarUrl = avatarUrl
        self.createdAt = createdAt
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(name, forKey: .name)
        try c.encode(email, forKey: .email)
        try c.encode(defaultCurrency, forKey: .defaultCurrency)
        try c.encodeNullable(avatarUrl, forKey: .avatarUrl)
        try c.encode(createdAt, forKey: .createdAt)
    }

    public func with(name: String? = nil, defaultCurrency: String? = nil) -> User {
        User(id: id, name: name ?? self.name, email: email, defaultCurrency: defaultCurrency ?? self.defaultCurrency,
             avatarUrl: avatarUrl, createdAt: createdAt)
    }
}

public struct Group: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let description: String?
    public let imageUrl: String?
    public let currency: String
    public let creatorId: String
    public let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name, description, imageUrl = "image_url", currency, creatorId = "creator_id", createdAt = "created_at"
    }

    public init(id: String, name: String, description: String? = nil, imageUrl: String? = nil,
                currency: String = Currency.defaultCode, creatorId: String, createdAt: Date) {
        self.id = id
        self.name = name
        self.description = description
        self.imageUrl = imageUrl
        self.currency = currency
        self.creatorId = creatorId
        self.createdAt = createdAt
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(name, forKey: .name)
        try c.encodeNullable(description, forKey: .description)
        try c.encodeIfPresent(imageUrl, forKey: .imageUrl)
        try c.encode(currency, forKey: .currency)
        try c.encode(creatorId, forKey: .creatorId)
        try c.encode(createdAt, forKey: .createdAt)
    }
}

public struct GroupMember: Codable, Sendable, Hashable {
    public let groupId: String
    public let userId: String
    public let role: GroupRole
    public let joinedAt: Date

    enum CodingKeys: String, CodingKey {
        case groupId = "group_id", userId = "user_id", role, joinedAt = "joined_at"
    }

    public init(groupId: String, userId: String, role: GroupRole = .member, joinedAt: Date) {
        self.groupId = groupId
        self.userId = userId
        self.role = role
        self.joinedAt = joinedAt
    }
}

/// Type only (unused by the UI), mirrors `GroupInvite`.
public struct GroupInvite: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let groupId: String
    public let token: String
    public let createdBy: String
    public let expiresAt: Date
    public let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, groupId = "group_id", token, createdBy = "created_by", expiresAt = "expires_at", createdAt = "created_at"
    }

    public init(id: String, groupId: String, token: String, createdBy: String, expiresAt: Date, createdAt: Date) {
        self.id = id
        self.groupId = groupId
        self.token = token
        self.createdBy = createdBy
        self.expiresAt = expiresAt
        self.createdAt = createdAt
    }
}

public struct Category: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    /// Lucide icon name exactly as the web stores it (e.g. `UtensilsCrossed`); the app maps it.
    public let icon: String
    public let userId: String?
    public let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name, icon, userId = "user_id", createdAt = "created_at"
    }

    public init(id: String, name: String, icon: String, userId: String? = nil, createdAt: Date) {
        self.id = id
        self.name = name
        self.icon = icon
        self.userId = userId
        self.createdAt = createdAt
    }
}

public struct Transaction: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let type: TransactionType
    public let title: String
    public let amountMinor: Int
    public let currency: String
    public let categoryId: String?
    public let payerId: String
    public let groupId: String?
    public let paymentMethod: String?
    public let notes: String?
    public let occurredAt: Date
    public let deletedAt: Date?
    public let createdBy: String
    public let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, type, title, amountMinor = "amount_minor", currency, categoryId = "category_id", payerId = "payer_id"
        case groupId = "group_id", paymentMethod = "payment_method", notes, occurredAt = "occurred_at"
        case deletedAt = "deleted_at", createdBy = "created_by", createdAt = "created_at"
    }

    public init(id: String, type: TransactionType, title: String, amountMinor: Int, currency: String = Currency.defaultCode,
                categoryId: String? = nil, payerId: String, groupId: String? = nil, paymentMethod: String? = nil,
                notes: String? = nil, occurredAt: Date = Date(), deletedAt: Date? = nil, createdBy: String? = nil,
                createdAt: Date? = nil) {
        self.id = id
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
        self.deletedAt = deletedAt
        self.createdBy = createdBy ?? payerId
        self.createdAt = createdAt ?? occurredAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        type = try c.decode(TransactionType.self, forKey: .type)
        title = try c.decode(String.self, forKey: .title)
        amountMinor = try c.decode(Int.self, forKey: .amountMinor)
        currency = try c.decode(String.self, forKey: .currency)
        categoryId = try c.decodeIfPresent(String.self, forKey: .categoryId)
        payerId = try c.decode(String.self, forKey: .payerId)
        groupId = try c.decodeIfPresent(String.self, forKey: .groupId)
        paymentMethod = try c.decodeIfPresent(String.self, forKey: .paymentMethod)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        occurredAt = try c.decode(Date.self, forKey: .occurredAt)
        deletedAt = try c.decodeOptionalDate(forKey: .deletedAt)
        createdBy = try c.decode(String.self, forKey: .createdBy)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(type, forKey: .type)
        try c.encode(title, forKey: .title)
        try c.encode(amountMinor, forKey: .amountMinor)
        try c.encode(currency, forKey: .currency)
        try c.encodeNullable(categoryId, forKey: .categoryId)
        try c.encode(payerId, forKey: .payerId)
        try c.encodeNullable(groupId, forKey: .groupId)
        try c.encodeIfPresent(paymentMethod, forKey: .paymentMethod)
        try c.encodeNullable(notes, forKey: .notes)
        try c.encode(occurredAt, forKey: .occurredAt)
        try c.encodeIfPresent(deletedAt, forKey: .deletedAt)
        try c.encode(createdBy, forKey: .createdBy)
        try c.encode(createdAt, forKey: .createdAt)
    }

    public var isDeleted: Bool { deletedAt != nil }

    /// Copy with `deletedAt` replaced (soft delete / restore without mutation).
    public func withDeletedAt(_ date: Date?) -> Transaction {
        Transaction(id: id, type: type, title: title, amountMinor: amountMinor, currency: currency,
                    categoryId: categoryId, payerId: payerId, groupId: groupId, paymentMethod: paymentMethod,
                    notes: notes, occurredAt: occurredAt, deletedAt: date, createdBy: createdBy, createdAt: createdAt)
    }
}

public struct TransactionSplit: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let transactionId: String
    public let userId: String
    public let shareMinor: Int
    public let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, transactionId = "transaction_id", userId = "user_id", shareMinor = "share_minor", createdAt = "created_at"
    }

    public init(id: String, transactionId: String, userId: String, shareMinor: Int, createdAt: Date = Date()) {
        self.id = id
        self.transactionId = transactionId
        self.userId = userId
        self.shareMinor = shareMinor
        self.createdAt = createdAt
    }
}

public struct Settlement: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let groupId: String?
    public let senderId: String
    public let recipientId: String
    public let amountMinor: Int
    public let currency: String
    public let method: String
    public let reference: String?
    public let status: SettlementStatus
    public let settledAt: Date
    public let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, groupId = "group_id", senderId = "sender_id", recipientId = "recipient_id", amountMinor = "amount_minor"
        case currency, method, reference, status, settledAt = "settled_at", createdAt = "created_at"
    }

    public init(id: String, groupId: String? = nil, senderId: String, recipientId: String, amountMinor: Int,
                currency: String = Currency.defaultCode, method: String = "Cash", reference: String? = nil,
                status: SettlementStatus = .settled, settledAt: Date = Date(), createdAt: Date? = nil) {
        self.id = id
        self.groupId = groupId
        self.senderId = senderId
        self.recipientId = recipientId
        self.amountMinor = amountMinor
        self.currency = currency
        self.method = method
        self.reference = reference
        self.status = status
        self.settledAt = settledAt
        self.createdAt = createdAt ?? settledAt
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encodeNullable(groupId, forKey: .groupId)
        try c.encode(senderId, forKey: .senderId)
        try c.encode(recipientId, forKey: .recipientId)
        try c.encode(amountMinor, forKey: .amountMinor)
        try c.encode(currency, forKey: .currency)
        try c.encode(method, forKey: .method)
        try c.encodeNullable(reference, forKey: .reference)
        try c.encode(status, forKey: .status)
        try c.encode(settledAt, forKey: .settledAt)
        try c.encode(createdAt, forKey: .createdAt)
    }
}

public struct Budget: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let userId: String
    public let categoryId: String?
    public let limitMinor: Int
    public let period: BudgetPeriod
    public let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, userId = "user_id", categoryId = "category_id", limitMinor = "limit_minor", period, createdAt = "created_at"
    }

    public init(id: String, userId: String, categoryId: String? = nil, limitMinor: Int, period: BudgetPeriod = .monthly,
                createdAt: Date) {
        self.id = id
        self.userId = userId
        self.categoryId = categoryId
        self.limitMinor = limitMinor
        self.period = period
        self.createdAt = createdAt
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(userId, forKey: .userId)
        try c.encodeNullable(categoryId, forKey: .categoryId)
        try c.encode(limitMinor, forKey: .limitMinor)
        try c.encode(period, forKey: .period)
        try c.encode(createdAt, forKey: .createdAt)
    }

    public func withLimitMinor(_ limit: Int) -> Budget {
        Budget(id: id, userId: userId, categoryId: categoryId, limitMinor: limit, period: period, createdAt: createdAt)
    }
}

/// `{ user_id, share_minor }` (RecurringBill.splits and action inputs).
public struct ShareAllocation: Codable, Sendable, Hashable {
    public let userId: String
    public let shareMinor: Int

    enum CodingKeys: String, CodingKey {
        case userId = "user_id", shareMinor = "share_minor"
    }

    public init(userId: String, shareMinor: Int) {
        self.userId = userId
        self.shareMinor = shareMinor
    }
}

public struct RecurringBill: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let title: String
    public let amountMinor: Int
    public let currency: String
    public let categoryId: String?
    public let payerId: String
    public let groupId: String?
    public let frequency: RecurringFrequency
    /// 1–31 (day of month) or 1–7 (day of week, Monday = 1).
    public let dueDay: Int
    public let notes: String?
    public let autoPost: Bool
    public let lastPostedAt: Date?
    public let splits: [ShareAllocation]
    public let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, amountMinor = "amount_minor", currency, categoryId = "category_id", payerId = "payer_id"
        case groupId = "group_id", frequency, dueDay = "due_day", notes, autoPost = "auto_post"
        case lastPostedAt = "last_posted_at", splits, createdAt = "created_at"
    }

    public init(id: String, title: String, amountMinor: Int, currency: String = Currency.defaultCode,
                categoryId: String? = nil, payerId: String, groupId: String? = nil, frequency: RecurringFrequency,
                dueDay: Int, notes: String? = nil, autoPost: Bool = false, lastPostedAt: Date? = nil,
                splits: [ShareAllocation], createdAt: Date) {
        self.id = id
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
        self.createdAt = createdAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        amountMinor = try c.decode(Int.self, forKey: .amountMinor)
        currency = try c.decode(String.self, forKey: .currency)
        categoryId = try c.decodeIfPresent(String.self, forKey: .categoryId)
        payerId = try c.decode(String.self, forKey: .payerId)
        groupId = try c.decodeIfPresent(String.self, forKey: .groupId)
        frequency = try c.decode(RecurringFrequency.self, forKey: .frequency)
        dueDay = try c.decode(Int.self, forKey: .dueDay)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        autoPost = try c.decode(Bool.self, forKey: .autoPost)
        lastPostedAt = try c.decodeOptionalDate(forKey: .lastPostedAt)
        splits = try c.decode([ShareAllocation].self, forKey: .splits)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(title, forKey: .title)
        try c.encode(amountMinor, forKey: .amountMinor)
        try c.encode(currency, forKey: .currency)
        try c.encodeNullable(categoryId, forKey: .categoryId)
        try c.encode(payerId, forKey: .payerId)
        try c.encodeNullable(groupId, forKey: .groupId)
        try c.encode(frequency, forKey: .frequency)
        try c.encode(dueDay, forKey: .dueDay)
        try c.encodeNullable(notes, forKey: .notes)
        try c.encode(autoPost, forKey: .autoPost)
        try c.encodeNullable(lastPostedAt, forKey: .lastPostedAt)
        try c.encode(splits, forKey: .splits)
        try c.encode(createdAt, forKey: .createdAt)
    }

    public func withLastPostedAt(_ date: Date?) -> RecurringBill {
        RecurringBill(id: id, title: title, amountMinor: amountMinor, currency: currency, categoryId: categoryId,
                      payerId: payerId, groupId: groupId, frequency: frequency, dueDay: dueDay, notes: notes,
                      autoPost: autoPost, lastPostedAt: date, splits: splits, createdAt: createdAt)
    }
}

public struct AuditLog: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let actorId: String?
    public let action: AuditAction
    public let recordType: AuditRecordType
    public let recordId: String
    public let before: JSONValue?
    public let after: JSONValue?
    public let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, actorId = "actor_id", action, recordType = "record_type", recordId = "record_id", before, after
        case createdAt = "created_at"
    }

    public init(id: String, actorId: String?, action: AuditAction, recordType: AuditRecordType, recordId: String,
                before: JSONValue?, after: JSONValue?, createdAt: Date) {
        self.id = id
        self.actorId = actorId
        self.action = action
        self.recordType = recordType
        self.recordId = recordId
        self.before = before
        self.after = after
        self.createdAt = createdAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        actorId = try c.decodeIfPresent(String.self, forKey: .actorId)
        action = try c.decode(AuditAction.self, forKey: .action)
        recordType = try c.decode(AuditRecordType.self, forKey: .recordType)
        recordId = try c.decode(String.self, forKey: .recordId)
        before = try c.decodeIfPresent(JSONValue.self, forKey: .before).flatMap { $0 == .null ? nil : $0 }
        after = try c.decodeIfPresent(JSONValue.self, forKey: .after).flatMap { $0 == .null ? nil : $0 }
        createdAt = try c.decode(Date.self, forKey: .createdAt)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encodeNullable(actorId, forKey: .actorId)
        try c.encode(action, forKey: .action)
        try c.encode(recordType, forKey: .recordType)
        try c.encode(recordId, forKey: .recordId)
        try c.encodeNullable(before, forKey: .before)
        try c.encodeNullable(after, forKey: .after)
        try c.encode(createdAt, forKey: .createdAt)
    }
}

/// The whole persisted ledger: the web's `payd_state_v3` localStorage blob (camelCase keys).
public struct LedgerState: Codable, Sendable, Hashable {
    public let users: [User]
    public let currentUserId: String
    public let categories: [Category]
    public let groups: [Group]
    public let groupMembers: [GroupMember]
    public let transactions: [Transaction]
    public let splits: [TransactionSplit]
    public let settlements: [Settlement]
    public let budgets: [Budget]
    public let auditLogs: [AuditLog]
    public let recurringBills: [RecurringBill]

    enum CodingKeys: String, CodingKey {
        case users, currentUserId, categories, groups, groupMembers, transactions, splits, settlements, budgets
        case auditLogs, recurringBills
    }

    public init(users: [User], currentUserId: String, categories: [Category], groups: [Group],
                groupMembers: [GroupMember], transactions: [Transaction], splits: [TransactionSplit],
                settlements: [Settlement], budgets: [Budget], auditLogs: [AuditLog] = [], recurringBills: [RecurringBill]) {
        self.users = users
        self.currentUserId = currentUserId
        self.categories = categories
        self.groups = groups
        self.groupMembers = groupMembers
        self.transactions = transactions
        self.splits = splits
        self.settlements = settlements
        self.budgets = budgets
        self.auditLogs = auditLogs
        self.recurringBills = recurringBills
    }

    /// Mirrors the load in PaydContext.tsx:195-212: every key is optional; a missing or null key
    /// falls back to the seed value (`auditLogs` to []); `currentUserId` is kept only when it names
    /// one of the stored users, otherwise the seed user (Manan) stays current.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let now = decoder.userInfo[PaydJSON.nowKey] as? Date ?? Date()
        let seed = SeedData.make(now: now)
        let storedUsers = try c.decodeIfPresent([User].self, forKey: .users)
        users = storedUsers ?? seed.users
        let storedCurrent = try c.decodeIfPresent(String.self, forKey: .currentUserId)
        if let storedCurrent, !storedCurrent.isEmpty, storedUsers?.contains(where: { $0.id == storedCurrent }) == true {
            currentUserId = storedCurrent
        } else {
            currentUserId = seed.currentUserId
        }
        categories = try c.decodeIfPresent([Category].self, forKey: .categories) ?? seed.categories
        groups = try c.decodeIfPresent([Group].self, forKey: .groups) ?? seed.groups
        groupMembers = try c.decodeIfPresent([GroupMember].self, forKey: .groupMembers) ?? seed.groupMembers
        transactions = try c.decodeIfPresent([Transaction].self, forKey: .transactions) ?? seed.transactions
        splits = try c.decodeIfPresent([TransactionSplit].self, forKey: .splits) ?? seed.splits
        settlements = try c.decodeIfPresent([Settlement].self, forKey: .settlements) ?? seed.settlements
        budgets = try c.decodeIfPresent([Budget].self, forKey: .budgets) ?? seed.budgets
        auditLogs = try c.decodeIfPresent([AuditLog].self, forKey: .auditLogs) ?? []
        recurringBills = try c.decodeIfPresent([RecurringBill].self, forKey: .recurringBills) ?? seed.recurringBills
    }

    /// Decodes a web `payd_state_v3` blob (or the app's own save file).
    public static func decodeWebBlob(_ data: Data, now: Date) throws -> LedgerState {
        let decoder = PaydJSON.decoder
        decoder.userInfo[PaydJSON.nowKey] = now
        return try decoder.decode(LedgerState.self, from: data)
    }

    /// Copy with the given collections replaced.
    public func with(users: [User]? = nil, currentUserId: String? = nil, categories: [Category]? = nil,
                     groups: [Group]? = nil, groupMembers: [GroupMember]? = nil, transactions: [Transaction]? = nil,
                     splits: [TransactionSplit]? = nil, settlements: [Settlement]? = nil, budgets: [Budget]? = nil,
                     auditLogs: [AuditLog]? = nil, recurringBills: [RecurringBill]? = nil) -> LedgerState {
        LedgerState(users: users ?? self.users, currentUserId: currentUserId ?? self.currentUserId,
                    categories: categories ?? self.categories, groups: groups ?? self.groups,
                    groupMembers: groupMembers ?? self.groupMembers, transactions: transactions ?? self.transactions,
                    splits: splits ?? self.splits, settlements: settlements ?? self.settlements,
                    budgets: budgets ?? self.budgets, auditLogs: auditLogs ?? self.auditLogs,
                    recurringBills: recurringBills ?? self.recurringBills)
    }
}
