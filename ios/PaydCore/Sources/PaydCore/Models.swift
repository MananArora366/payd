import Foundation

// Swift mirror of web/src/types/database.ts.
// All money is stored as integer minor units (fils/cents): Invariant 1, no floats.
// JSON uses snake_case keys (see PaydJSON) so payloads match the web app and its API.

public enum TransactionType: String, Codable, Sendable, CaseIterable {
    case expense, income, refund, transfer, adjustment
}

public enum SettlementStatus: String, Codable, Sendable {
    case outstanding
    case partiallySettled = "partially_settled"
    case settled
    case disputed
}

public enum GroupRole: String, Codable, Sendable { case admin, member }

public enum SplitMethod: String, Codable, Sendable, CaseIterable { case equal, exact, percentage, shares }

public enum RecurringFrequency: String, Codable, Sendable, CaseIterable { case weekly, monthly, yearly }

public enum BudgetPeriod: String, Codable, Sendable { case weekly, monthly, yearly }

public struct User: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let email: String
    public let defaultCurrency: String
    public let avatarUrl: String?
    public let createdAt: Date

    public init(id: String, name: String, email: String, defaultCurrency: String = Currency.defaultCode,
                avatarUrl: String? = nil, createdAt: Date = Date()) {
        self.id = id
        self.name = name
        self.email = email
        self.defaultCurrency = defaultCurrency
        self.avatarUrl = avatarUrl
        self.createdAt = createdAt
    }
}

public struct Group: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let description: String?
    public let currency: String
    public let creatorId: String
    public let createdAt: Date

    public init(id: String, name: String, description: String? = nil, currency: String = Currency.defaultCode,
                creatorId: String, createdAt: Date = Date()) {
        self.id = id
        self.name = name
        self.description = description
        self.currency = currency
        self.creatorId = creatorId
        self.createdAt = createdAt
    }
}

public struct GroupMember: Codable, Sendable, Hashable {
    public let groupId: String
    public let userId: String
    public let role: GroupRole
    public let joinedAt: Date

    public init(groupId: String, userId: String, role: GroupRole = .member, joinedAt: Date = Date()) {
        self.groupId = groupId
        self.userId = userId
        self.role = role
        self.joinedAt = joinedAt
    }
}

public struct Category: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    /// SF Symbol name used by the iOS UI (the web stores a Lucide icon name).
    public let icon: String

    public init(id: String, name: String, icon: String) {
        self.id = id
        self.name = name
        self.icon = icon
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

    public init(id: String, type: TransactionType, title: String, amountMinor: Int, currency: String,
                categoryId: String? = nil, payerId: String, groupId: String? = nil, paymentMethod: String? = nil,
                notes: String? = nil, occurredAt: Date = Date(), deletedAt: Date? = nil,
                createdBy: String? = nil, createdAt: Date = Date()) {
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
        self.createdAt = createdAt
    }

    public var isDeleted: Bool { deletedAt != nil }

    /// Returns a copy with `deletedAt` replaced (soft delete / restore without mutation).
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

    public init(id: String, groupId: String? = nil, senderId: String, recipientId: String, amountMinor: Int,
                currency: String, method: String = "Cash", reference: String? = nil,
                status: SettlementStatus = .settled, settledAt: Date = Date(), createdAt: Date = Date()) {
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
        self.createdAt = createdAt
    }
}

public struct Budget: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let userId: String
    public let categoryId: String?
    public let limitMinor: Int
    public let period: BudgetPeriod

    public init(id: String, userId: String, categoryId: String? = nil, limitMinor: Int, period: BudgetPeriod = .monthly) {
        self.id = id
        self.userId = userId
        self.categoryId = categoryId
        self.limitMinor = limitMinor
        self.period = period
    }
}

public struct ShareAllocation: Codable, Sendable, Hashable {
    public let userId: String
    public let shareMinor: Int

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
    /// 1–31 (day of month) or 1–7 (day of week).
    public let dueDay: Int
    public let notes: String?
    public let autoPost: Bool
    public let lastPostedAt: Date?
    public let splits: [ShareAllocation]
    public let createdAt: Date

    public init(id: String, title: String, amountMinor: Int, currency: String, categoryId: String? = nil,
                payerId: String, groupId: String? = nil, frequency: RecurringFrequency, dueDay: Int,
                notes: String? = nil, autoPost: Bool = false, lastPostedAt: Date? = nil,
                splits: [ShareAllocation], createdAt: Date = Date()) {
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
}

public struct ReceiptLineItem: Codable, Sendable, Hashable {
    public let name: String
    public let quantity: Int
    public let priceMinor: Int

    public init(name: String, quantity: Int, priceMinor: Int) {
        self.name = name
        self.quantity = quantity
        self.priceMinor = priceMinor
    }
}

/// The full persisted ledger, equivalent to the web app's `payd_state_v1` localStorage blob.
public struct LedgerState: Codable, Sendable, Hashable {
    public internal(set) var users: [User]
    public internal(set) var currentUserId: String
    public internal(set) var categories: [Category]
    public internal(set) var groups: [Group]
    public internal(set) var groupMembers: [GroupMember]
    public internal(set) var transactions: [Transaction]
    public internal(set) var splits: [TransactionSplit]
    public internal(set) var settlements: [Settlement]
    public internal(set) var budgets: [Budget]
    public internal(set) var recurringBills: [RecurringBill]

    public init(users: [User], currentUserId: String, categories: [Category], groups: [Group],
                groupMembers: [GroupMember], transactions: [Transaction], splits: [TransactionSplit],
                settlements: [Settlement], budgets: [Budget], recurringBills: [RecurringBill]) {
        self.users = users
        self.currentUserId = currentUserId
        self.categories = categories
        self.groups = groups
        self.groupMembers = groupMembers
        self.transactions = transactions
        self.splits = splits
        self.settlements = settlements
        self.budgets = budgets
        self.recurringBills = recurringBills
    }
}

/// Shared JSON coders: snake_case keys and ISO-8601 dates, matching the web app.
public enum PaydJSON {
    public static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }

    public static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
