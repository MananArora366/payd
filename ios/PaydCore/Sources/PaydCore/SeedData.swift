import Foundation

// Port of web/src/lib/store/initialData.ts. IDs, names, amounts, notes and orders are identical to
// the web demo so both apps show the same balances. `Date.now() - N * 86400000` is `now - N days`;
// every `new Date().toISOString()` is `now`.

public enum SeedIDs {
    public static let manan = "11111111-1111-1111-1111-111111111111"
    public static let prakarsh = "22222222-2222-2222-2222-222222222222"
    public static let veer = "33333333-3333-3333-3333-333333333333"
    public static let aisha = "44444444-4444-4444-4444-444444444444"
    public static let omar = "55555555-5555-5555-5555-555555555555"
    public static let zara = "66666666-6666-6666-6666-666666666666"
    public static let flatmates = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    public static let hattaTrip = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    public static let food = "c0000001-0000-0000-0000-000000000001"
    public static let groceries = "c0000002-0000-0000-0000-000000000002"
    public static let transportation = "c0000003-0000-0000-0000-000000000003"
    public static let shopping = "c0000004-0000-0000-0000-000000000004"
    public static let entertainment = "c0000005-0000-0000-0000-000000000005"
    public static let rent = "c0000006-0000-0000-0000-000000000006"
    public static let utilities = "c0000007-0000-0000-0000-000000000007"
    public static let healthcare = "c0000008-0000-0000-0000-000000000008"
    public static let education = "c0000009-0000-0000-0000-000000000009"
    public static let travel = "c0000010-0000-0000-0000-000000000010"
    public static let subscriptions = "c0000011-0000-0000-0000-000000000011"
    public static let other = "c0000012-0000-0000-0000-000000000012"
}

public enum SeedData {
    private static let day: TimeInterval = 86_400
    private static let hour: TimeInterval = 3_600

    public static func make(now: Date) -> LedgerState {
        let now = now.truncatedToMilliseconds
        return LedgerState(
            users: users(now: now),
            currentUserId: SeedIDs.manan,
            categories: categories(now: now),
            groups: groups(now: now),
            groupMembers: groupMembers(now: now),
            transactions: transactions(now: now),
            splits: splits(now: now),
            settlements: settlements(now: now),
            budgets: budgets(now: now),
            auditLogs: [],
            recurringBills: recurringBills(now: now)
        )
    }

    /// Byte-for-byte the web `initialsAvatar(name)` data URL (mint disc, dark green initials).
    public static func initialsAvatar(_ name: String) -> String {
        let initials = name.jsSpaceSplit.map { $0.first.map(String.init) ?? "" }.joined().prefix(2).uppercased()
        let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"120\" height=\"120\"><rect width=\"120\" height=\"120\" fill=\"#bbf7d0\"/><text x=\"50%\" y=\"50%\" dy=\".35em\" text-anchor=\"middle\" font-family=\"DM Sans, sans-serif\" font-size=\"48\" font-weight=\"600\" fill=\"#14532d\">\(initials)</text></svg>"
        return "data:image/svg+xml;utf8,\(encodeURIComponent(svg))"
    }

    public static func users(now: Date) -> [User] {
        let ago = { (days: Double) in now.addingTimeInterval(-days * day) }
        let people: [(String, String, String, Double)] = [
            (SeedIDs.manan, "Manan Arora", "manan@payd.app", 30),
            (SeedIDs.prakarsh, "Prakarsh Thakur", "prakarsh@payd.app", 28),
            (SeedIDs.veer, "Veer Nanwani", "veer@payd.app", 25),
            (SeedIDs.aisha, "Aisha Rahman", "aisha@payd.app", 20),
            (SeedIDs.omar, "Omar Haddad", "omar@payd.app", 18),
            (SeedIDs.zara, "Zara Kapoor", "zara@payd.app", 12),
        ]
        return people.map { id, name, email, days in
            User(id: id, name: name, email: email, defaultCurrency: "AED", avatarUrl: initialsAvatar(name),
                 createdAt: ago(days))
        }
    }

    public static func categories(now: Date) -> [Category] {
        [
            (SeedIDs.food, "Food and dining", "UtensilsCrossed"),
            (SeedIDs.groceries, "Groceries", "ShoppingCart"),
            (SeedIDs.transportation, "Transportation", "Car"),
            (SeedIDs.shopping, "Shopping", "ShoppingBag"),
            (SeedIDs.entertainment, "Entertainment", "Film"),
            (SeedIDs.rent, "Rent and accommodation", "Home"),
            (SeedIDs.utilities, "Utilities and bills", "Zap"),
            (SeedIDs.healthcare, "Healthcare", "HeartPulse"),
            (SeedIDs.education, "Education", "GraduationCap"),
            (SeedIDs.travel, "Travel", "Plane"),
            (SeedIDs.subscriptions, "Subscriptions", "Repeat"),
            (SeedIDs.other, "Other", "MoreHorizontal"),
        ].map { Category(id: $0.0, name: $0.1, icon: $0.2, createdAt: now) }
    }

    static func groups(now: Date) -> [Group] {
        [
            Group(id: SeedIDs.flatmates, name: "Dubai Flatmates", description: "Marina apartment rent & shared groceries",
                  currency: "AED", creatorId: SeedIDs.manan, createdAt: now.addingTimeInterval(-25 * day)),
            Group(id: SeedIDs.hattaTrip, name: "Hatta Road Trip", description: "Weekend camping, fuel & barbecue snacks",
                  currency: "AED", creatorId: SeedIDs.prakarsh, createdAt: now.addingTimeInterval(-10 * day)),
        ]
    }

    static func groupMembers(now: Date) -> [GroupMember] {
        [
            (SeedIDs.flatmates, SeedIDs.manan, GroupRole.admin),
            (SeedIDs.flatmates, SeedIDs.prakarsh, .member),
            (SeedIDs.flatmates, SeedIDs.veer, .member),
            (SeedIDs.hattaTrip, SeedIDs.manan, .member),
            (SeedIDs.hattaTrip, SeedIDs.prakarsh, .admin),
            (SeedIDs.hattaTrip, SeedIDs.aisha, .member),
            (SeedIDs.flatmates, SeedIDs.omar, .member),
            (SeedIDs.hattaTrip, SeedIDs.zara, .member),
        ].map { GroupMember(groupId: $0.0, userId: $0.1, role: $0.2, joinedAt: now) }
    }

    static func transactions(now: Date) -> [Transaction] {
        let daysAgo = { (days: Double) in now.addingTimeInterval(-days * day) }
        let hoursAgo = { (hours: Double) in now.addingTimeInterval(-hours * hour) }
        func txn(_ id: String, _ type: TransactionType, _ title: String, _ amount: Int, _ category: String,
                 _ payer: String, _ group: String?, _ method: String, _ notes: String, _ at: Date) -> Transaction {
            Transaction(id: id, type: type, title: title, amountMinor: amount, currency: "AED", categoryId: category,
                        payerId: payer, groupId: group, paymentMethod: method, notes: notes, occurredAt: at,
                        createdBy: payer, createdAt: at)
        }
        return [
            txn("t0000001-0000-0000-0000-000000000001", .expense, "Dinner at Al Hallab", 10000, SeedIDs.food,
                SeedIDs.manan, SeedIDs.flatmates, "Card", "Dinner with flatmates, equal split", daysAgo(2)),
            txn("t0000002-0000-0000-0000-000000000002", .expense, "Carrefour Supermarket", 24000, SeedIDs.groceries,
                SeedIDs.prakarsh, SeedIDs.flatmates, "Card", "Weekly grocery supplies", daysAgo(1)),
            txn("t0000003-0000-0000-0000-000000000003", .expense, "Specialty Coffee", 2200, SeedIDs.food,
                SeedIDs.manan, nil, "Apple Pay", "Morning flat white", hoursAgo(4)),
            txn("t0000004-0000-0000-0000-000000000004", .income, "Consulting Monthly Payout", 1_500_000, SeedIDs.other,
                SeedIDs.manan, nil, "Bank Transfer", "Client retainer", daysAgo(3)),
            txn("t0000005-0000-0000-0000-000000000005", .expense, "IKEA living room furniture", 160_000, SeedIDs.shopping,
                SeedIDs.manan, SeedIDs.flatmates, "Card", "Sofa, rug and shelving for the flat, split 4 ways", daysAgo(6)),
            txn("t0000006-0000-0000-0000-000000000006", .expense, "Hatta fuel & BBQ supplies", 52889, SeedIDs.travel,
                SeedIDs.manan, SeedIDs.hattaTrip, "Card", "ENOC fuel and Spinneys BBQ run, split 4 ways", daysAgo(9)),
        ]
    }

    static func splits(now: Date) -> [TransactionSplit] {
        let t1 = "t0000001-0000-0000-0000-000000000001", t2 = "t0000002-0000-0000-0000-000000000002"
        let t3 = "t0000003-0000-0000-0000-000000000003", t4 = "t0000004-0000-0000-0000-000000000004"
        let t5 = "t0000005-0000-0000-0000-000000000005", t6 = "t0000006-0000-0000-0000-000000000006"
        let rows: [(String, String, Int)] = [
            (t1, SeedIDs.manan, 3334), (t1, SeedIDs.prakarsh, 3333), (t1, SeedIDs.veer, 3333),
            (t2, SeedIDs.manan, 8000), (t2, SeedIDs.prakarsh, 8000), (t2, SeedIDs.veer, 8000),
            (t3, SeedIDs.manan, 2200),
            (t4, SeedIDs.manan, 1_500_000),
            (t5, SeedIDs.manan, 40000), (t5, SeedIDs.prakarsh, 40000), (t5, SeedIDs.veer, 40000), (t5, SeedIDs.omar, 40000),
            (t6, SeedIDs.manan, 13222), (t6, SeedIDs.prakarsh, 13223), (t6, SeedIDs.aisha, 13222), (t6, SeedIDs.zara, 13222),
        ]
        return rows.enumerated().map { index, row in
            TransactionSplit(id: "sp\(index + 1)", transactionId: row.0, userId: row.1, shareMinor: row.2, createdAt: now)
        }
    }

    static func settlements(now: Date) -> [Settlement] {
        [
            Settlement(id: "s0000001-0000-0000-0000-000000000001", groupId: SeedIDs.flatmates, senderId: SeedIDs.veer,
                       recipientId: SeedIDs.manan, amountMinor: 5000, currency: "AED", method: "Careem Pay",
                       reference: "Dinner payback", status: .settled, settledAt: now.addingTimeInterval(-2 * day),
                       createdAt: now.addingTimeInterval(-2 * day)),
            // Repays the dinner (2 days ago), so it is dated after it: 36 hours ago.
            Settlement(id: "s0000002-0000-0000-0000-000000000002", groupId: SeedIDs.flatmates, senderId: SeedIDs.prakarsh,
                       recipientId: SeedIDs.manan, amountMinor: 3333, currency: "AED", method: "Bank Transfer",
                       reference: "Split settlement", status: .settled, settledAt: now.addingTimeInterval(-36 * hour),
                       createdAt: now.addingTimeInterval(-36 * hour)),
        ]
    }

    static func recurringBills(now: Date) -> [RecurringBill] {
        let ago = { (days: Double) in now.addingTimeInterval(-days * day) }
        let flatmates3 = [SeedIDs.manan, SeedIDs.prakarsh, SeedIDs.veer]
        func shares(_ amounts: [Int]) -> [ShareAllocation] {
            zip(flatmates3, amounts).map { ShareAllocation(userId: $0.0, shareMinor: $0.1) }
        }
        return [
            RecurringBill(id: "rec00001-0000-0000-0000-000000000001", title: "Du 5G Home High-Speed Wi-Fi",
                          amountMinor: 38900, currency: "AED", categoryId: SeedIDs.utilities, payerId: SeedIDs.manan,
                          groupId: SeedIDs.flatmates, frequency: .monthly, dueDay: 1,
                          notes: "Du Unlimited 800 Mbps Fiber account #1092842", autoPost: false,
                          lastPostedAt: ago(25), splits: shares([12967, 12967, 12966]), createdAt: ago(60)),
            RecurringBill(id: "rec00002-0000-0000-0000-000000000002", title: "DEWA Utilities (Electricity & Water)",
                          amountMinor: 75000, currency: "AED", categoryId: SeedIDs.utilities, payerId: SeedIDs.veer,
                          groupId: SeedIDs.flatmates, frequency: .monthly, dueDay: 15, notes: "DEWA Premise #20049182",
                          autoPost: false, lastPostedAt: ago(20), splits: shares([25000, 25000, 25000]), createdAt: ago(60)),
            RecurringBill(id: "rec00003-0000-0000-0000-000000000003", title: "Housekeeping & Deep Cleaning",
                          amountMinor: 24000, currency: "AED", categoryId: SeedIDs.utilities, payerId: SeedIDs.prakarsh,
                          groupId: SeedIDs.flatmates, frequency: .monthly, dueDay: 10,
                          notes: "Bi-weekly apartment cleaning service", autoPost: false, lastPostedAt: nil,
                          splits: shares([8000, 8000, 8000]), createdAt: ago(40)),
        ]
    }

    static func budgets(now: Date) -> [Budget] {
        [
            Budget(id: "b0000001-0000-0000-0000-000000000001", userId: SeedIDs.manan, categoryId: nil,
                   limitMinor: 500_000, period: .monthly, createdAt: now),
            Budget(id: "b0000002-0000-0000-0000-000000000002", userId: SeedIDs.manan, categoryId: SeedIDs.food,
                   limitMinor: 120_000, period: .monthly, createdAt: now),
        ]
    }
}
