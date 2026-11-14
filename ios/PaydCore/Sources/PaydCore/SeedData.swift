import Foundation

// Port of web/src/lib/store/initialData.ts. IDs and amounts are identical to the web demo
// so both apps show the same balances. All timestamps derive from `now` for determinism.

public enum SeedIDs {
    public static let manan = "11111111-1111-1111-1111-111111111111"
    public static let rahul = "22222222-2222-2222-2222-222222222222"
    public static let sarah = "33333333-3333-3333-3333-333333333333"
    public static let priya = "44444444-4444-4444-4444-444444444444"
    public static let flatmates = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    public static let hattaTrip = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    public static let food = "c0000001-0000-0000-0000-000000000001"
    public static let groceries = "c0000002-0000-0000-0000-000000000002"
    public static let utilities = "c0000007-0000-0000-0000-000000000007"
    public static let other = "c0000012-0000-0000-0000-000000000012"
}

public enum SeedData {
    private static let day: TimeInterval = 86_400
    private static let hour: TimeInterval = 3_600

    public static func make(now: Date = Date()) -> LedgerState {
        let ago = { (seconds: TimeInterval) in now.addingTimeInterval(-seconds) }
        return LedgerState(
            users: users(ago),
            currentUserId: SeedIDs.manan,
            categories: categories,
            groups: groups(ago),
            groupMembers: groupMembers(now),
            transactions: transactions(ago),
            splits: splits(now),
            settlements: settlements(ago),
            budgets: budgets,
            recurringBills: recurringBills(ago)
        )
    }

    public static let categories: [Category] = [
        Category(id: SeedIDs.food, name: "Food and dining", icon: "fork.knife"),
        Category(id: SeedIDs.groceries, name: "Groceries", icon: "cart"),
        Category(id: "c0000003-0000-0000-0000-000000000003", name: "Transportation", icon: "car"),
        Category(id: "c0000004-0000-0000-0000-000000000004", name: "Shopping", icon: "bag"),
        Category(id: "c0000005-0000-0000-0000-000000000005", name: "Entertainment", icon: "film"),
        Category(id: "c0000006-0000-0000-0000-000000000006", name: "Rent and accommodation", icon: "house"),
        Category(id: SeedIDs.utilities, name: "Utilities and bills", icon: "bolt"),
        Category(id: "c0000008-0000-0000-0000-000000000008", name: "Healthcare", icon: "heart.text.square"),
        Category(id: "c0000009-0000-0000-0000-000000000009", name: "Education", icon: "graduationcap"),
        Category(id: "c0000010-0000-0000-0000-000000000010", name: "Travel", icon: "airplane"),
        Category(id: "c0000011-0000-0000-0000-000000000011", name: "Subscriptions", icon: "repeat"),
        Category(id: SeedIDs.other, name: "Other", icon: "ellipsis.circle"),
    ]

    private static let budgets: [Budget] = [
        Budget(id: "b0000001-0000-0000-0000-000000000001", userId: SeedIDs.manan, limitMinor: 500_000),
        Budget(id: "b0000002-0000-0000-0000-000000000002", userId: SeedIDs.manan, categoryId: SeedIDs.food, limitMinor: 120_000),
    ]

    private static func users(_ ago: (TimeInterval) -> Date) -> [User] {
        [
            User(id: SeedIDs.manan, name: "Manan Arora", email: "manan@payd.app", createdAt: ago(30 * day)),
            User(id: SeedIDs.rahul, name: "Rahul", email: "rahul@payd.app", createdAt: ago(28 * day)),
            User(id: SeedIDs.sarah, name: "Sarah", email: "sarah@payd.app", createdAt: ago(25 * day)),
            User(id: SeedIDs.priya, name: "Priya", email: "priya@payd.app", createdAt: ago(20 * day)),
        ]
    }

    private static func groups(_ ago: (TimeInterval) -> Date) -> [Group] {
        [
            Group(id: SeedIDs.flatmates, name: "Dubai Flatmates", description: "Marina apartment rent & shared groceries",
                  creatorId: SeedIDs.manan, createdAt: ago(25 * day)),
            Group(id: SeedIDs.hattaTrip, name: "Hatta Road Trip", description: "Weekend camping, fuel & barbecue snacks",
                  creatorId: SeedIDs.rahul, createdAt: ago(10 * day)),
        ]
    }

    private static func groupMembers(_ now: Date) -> [GroupMember] {
        [
            GroupMember(groupId: SeedIDs.flatmates, userId: SeedIDs.manan, role: .admin, joinedAt: now),
            GroupMember(groupId: SeedIDs.flatmates, userId: SeedIDs.rahul, joinedAt: now),
            GroupMember(groupId: SeedIDs.flatmates, userId: SeedIDs.sarah, joinedAt: now),
            GroupMember(groupId: SeedIDs.hattaTrip, userId: SeedIDs.manan, joinedAt: now),
            GroupMember(groupId: SeedIDs.hattaTrip, userId: SeedIDs.rahul, role: .admin, joinedAt: now),
            GroupMember(groupId: SeedIDs.hattaTrip, userId: SeedIDs.priya, joinedAt: now),
        ]
    }

    private static func transactions(_ ago: (TimeInterval) -> Date) -> [Transaction] {
        [
            Transaction(id: "t0000001-0000-0000-0000-000000000001", type: .expense, title: "Dinner at Al Hallab",
                        amountMinor: 10_000, currency: "AED", categoryId: SeedIDs.food, payerId: SeedIDs.manan,
                        groupId: SeedIDs.flatmates, paymentMethod: "Card", notes: "Dinner with flatmates, equal split",
                        occurredAt: ago(2 * day), createdAt: ago(2 * day)),
            Transaction(id: "t0000002-0000-0000-0000-000000000002", type: .expense, title: "Carrefour Supermarket",
                        amountMinor: 24_000, currency: "AED", categoryId: SeedIDs.groceries, payerId: SeedIDs.rahul,
                        groupId: SeedIDs.flatmates, paymentMethod: "Card", notes: "Weekly grocery supplies",
                        occurredAt: ago(day), createdAt: ago(day)),
            Transaction(id: "t0000003-0000-0000-0000-000000000003", type: .expense, title: "Specialty Coffee",
                        amountMinor: 2_200, currency: "AED", categoryId: SeedIDs.food, payerId: SeedIDs.manan,
                        paymentMethod: "Apple Pay", notes: "Morning flat white",
                        occurredAt: ago(4 * hour), createdAt: ago(4 * hour)),
            Transaction(id: "t0000004-0000-0000-0000-000000000004", type: .income, title: "Consulting Monthly Payout",
                        amountMinor: 1_500_000, currency: "AED", categoryId: SeedIDs.other, payerId: SeedIDs.manan,
                        paymentMethod: "Bank Transfer", notes: "Client retainer",
                        occurredAt: ago(3 * day), createdAt: ago(3 * day)),
        ]
    }

    private static func splits(_ now: Date) -> [TransactionSplit] {
        let rows: [(String, String, String, Int)] = [
            ("sp1", "t0000001-0000-0000-0000-000000000001", SeedIDs.manan, 3_334),
            ("sp2", "t0000001-0000-0000-0000-000000000001", SeedIDs.rahul, 3_333),
            ("sp3", "t0000001-0000-0000-0000-000000000001", SeedIDs.sarah, 3_333),
            ("sp4", "t0000002-0000-0000-0000-000000000002", SeedIDs.manan, 8_000),
            ("sp5", "t0000002-0000-0000-0000-000000000002", SeedIDs.rahul, 8_000),
            ("sp6", "t0000002-0000-0000-0000-000000000002", SeedIDs.sarah, 8_000),
            ("sp7", "t0000003-0000-0000-0000-000000000003", SeedIDs.manan, 2_200),
            ("sp8", "t0000004-0000-0000-0000-000000000004", SeedIDs.manan, 1_500_000),
        ]
        return rows.map { TransactionSplit(id: $0.0, transactionId: $0.1, userId: $0.2, shareMinor: $0.3, createdAt: now) }
    }

    private static func settlements(_ ago: (TimeInterval) -> Date) -> [Settlement] {
        [
            Settlement(id: "s0000001-0000-0000-0000-000000000001", groupId: SeedIDs.flatmates, senderId: SeedIDs.sarah,
                       recipientId: SeedIDs.manan, amountMinor: 5_000, currency: "AED", method: "Careem Pay / Aani",
                       reference: "Dinner payback", settledAt: ago(2 * day), createdAt: ago(2 * day)),
            Settlement(id: "s0000002-0000-0000-0000-000000000002", groupId: SeedIDs.flatmates, senderId: SeedIDs.rahul,
                       recipientId: SeedIDs.manan, amountMinor: 3_333, currency: "AED", method: "Bank Transfer",
                       reference: "Split settlement", settledAt: ago(9 * day), createdAt: ago(9 * day)),
        ]
    }

    private static func recurringBills(_ ago: (TimeInterval) -> Date) -> [RecurringBill] {
        let flatmateShares = { (a: Int, b: Int, c: Int) in
            [ShareAllocation(userId: SeedIDs.manan, shareMinor: a),
             ShareAllocation(userId: SeedIDs.rahul, shareMinor: b),
             ShareAllocation(userId: SeedIDs.sarah, shareMinor: c)]
        }
        return [
            RecurringBill(id: "rec00001-0000-0000-0000-000000000001", title: "Du 5G Home High-Speed Wi-Fi",
                          amountMinor: 38_900, currency: "AED", categoryId: SeedIDs.utilities, payerId: SeedIDs.manan,
                          groupId: SeedIDs.flatmates, frequency: .monthly, dueDay: 1,
                          notes: "Du Unlimited 800 Mbps Fiber account #1092842", lastPostedAt: ago(25 * day),
                          splits: flatmateShares(12_967, 12_967, 12_966), createdAt: ago(60 * day)),
            RecurringBill(id: "rec00002-0000-0000-0000-000000000002", title: "DEWA Utilities (Electricity & Water)",
                          amountMinor: 75_000, currency: "AED", categoryId: SeedIDs.utilities, payerId: SeedIDs.sarah,
                          groupId: SeedIDs.flatmates, frequency: .monthly, dueDay: 15, notes: "DEWA Premise #20049182",
                          lastPostedAt: ago(20 * day), splits: flatmateShares(25_000, 25_000, 25_000),
                          createdAt: ago(60 * day)),
            RecurringBill(id: "rec00003-0000-0000-0000-000000000003", title: "Housekeeping & Deep Cleaning",
                          amountMinor: 24_000, currency: "AED", categoryId: SeedIDs.utilities, payerId: SeedIDs.rahul,
                          groupId: SeedIDs.flatmates, frequency: .monthly, dueDay: 10,
                          notes: "Bi-weekly apartment cleaning service",
                          splits: flatmateShares(8_000, 8_000, 8_000), createdAt: ago(40 * day)),
        ]
    }
}
