import Foundation

// Port of web/src/components/modals/addExpenseLogic.ts and the pure helpers in AddExpenseModal.tsx.

/// A line item in the itemized form. Empty `assignedUserIds` = shared by every participant.
public struct FormItem: Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let amountText: String
    public let assignedUserIds: [String]

    public init(id: String, name: String, amountText: String, assignedUserIds: [String] = []) {
        self.id = id
        self.name = name
        self.amountText = amountText
        self.assignedUserIds = assignedUserIds
    }

    public func with(name: String? = nil, amountText: String? = nil, assignedUserIds: [String]? = nil) -> FormItem {
        FormItem(id: id, name: name ?? self.name, amountText: amountText ?? self.amountText,
                 assignedUserIds: assignedUserIds ?? self.assignedUserIds)
    }
}

/// `AddExpensePrefill` (AddExpenseModal.tsx:28-36), e.g. from a Careem order.
public struct AddExpensePrefill: Sendable, Hashable {
    public struct PrefillItem: Sendable, Hashable {
        public let name: String
        public let amountMinor: Int

        public init(name: String, amountMinor: Int) {
            self.name = name
            self.amountMinor = amountMinor
        }
    }

    public let title: String
    public let amountMinor: Int
    public let notes: String?
    /// Category name or hint ("ride", "Transportation"); best-matched by `AddExpenseLogic.findCategoryId`.
    public let categoryName: String?
    public let items: [PrefillItem]
    public let paymentMethod: String?

    public init(title: String, amountMinor: Int, notes: String? = nil, categoryName: String? = nil,
                items: [PrefillItem] = [], paymentMethod: String? = nil) {
        self.title = title
        self.amountMinor = amountMinor
        self.notes = notes
        self.categoryName = categoryName
        self.items = items
        self.paymentMethod = paymentMethod
    }
}

public enum ExpenseSplitMethod: String, Sendable { case equal, exact, itemized }

public struct SplitInput: Sendable {
    /// `.expense` or `.income`.
    public let type: TransactionType
    public let totalMinor: Int
    public let payerId: String
    public let splitMethod: ExpenseSplitMethod
    public let participantIds: [String]
    public let exactAmounts: [String: String]
    public let items: [FormItem]
    /// Names people in error messages.
    public let nameOf: @Sendable (String) -> String

    public init(type: TransactionType, totalMinor: Int, payerId: String, splitMethod: ExpenseSplitMethod,
                participantIds: [String], exactAmounts: [String: String] = [:], items: [FormItem] = [],
                nameOf: @escaping @Sendable (String) -> String = { $0 }) {
        self.type = type
        self.totalMinor = totalMinor
        self.payerId = payerId
        self.splitMethod = splitMethod
        self.participantIds = participantIds
        self.exactAmounts = exactAmounts
        self.items = items
        self.nameOf = nameOf
    }
}

public enum AddExpenseLogic {
    /// AED 1,000,000,000 in fils.
    static let maxMinor = 1_000_000_000 * 100

    private static let amountPattern = JSRegex("^(?:\\d+|\\d{1,3}(?:,\\d{3})+)?(?:\\.\\d*)?$")
    private static let digitPattern = JSRegex("\\d")

    /// Strict AED amount → fils with a friendly message (`parseAmountInput`).
    public static func parseAmountInput(_ input: String, label: String = "amount") -> Result<Int, ParseError> {
        let s = input.jsTrimmed
        if s.isEmpty { return .failure(ParseError("Please enter an \(label).")) }
        if !amountPattern.test(s) || !digitPattern.test(s) {
            return .failure(ParseError("\"\(s)\" isn't a valid \(label). Use numbers like 42.50."))
        }
        let parts = s.split(separator: ".", omittingEmptySubsequences: false)
        let fraction = parts.count > 1 ? String(parts[1]) : ""
        if fraction.count > 2 { return .failure(ParseError("Use at most 2 decimal places for the \(label) (fils).")) }
        let value = Currency.parseMajorToMinor(s.replacingOccurrences(of: ",", with: ""), currency: Currency.ledgerCode)
        if value > maxMinor { return .failure(ParseError("That \(label) is too large.")) }
        if value <= 0 { return .failure(ParseError("Please enter an \(label) greater than 0.")) }
        return .success(value)
    }

    /// Lenient parse for live previews: invalid or empty input counts as 0.
    public static func previewMinor(_ input: String) -> Int {
        (try? parseAmountInput(input).get()) ?? 0
    }

    private static let participantsError = JSRegex("zero participants|without participants", "i")
    private static let negativeError = JSRegex("negative", "i")
    private static let exactSumError = JSRegex("Exact split allocations sum", "i")
    private static let jargonError = JSRegex("invariant|minor units", "i")

    /// Maps internal ledger messages (e.g. `LedgerInvariantError.message`) to plain language.
    public static func friendlyError(_ message: String) -> String {
        if participantsError.test(message) { return "Pick at least one person to split with." }
        if negativeError.test(message) { return "Amounts cannot be negative." }
        if exactSumError.test(message) { return "The per-person amounts don't add up to the total." }
        if jargonError.test(message) { return "We couldn't split this amount. Please check the numbers and try again." }
        return message.isEmpty ? "Failed to save transaction." : message
    }

    public static func itemsSubtotalMinor(_ items: [FormItem]) -> Int {
        items.reduce(0) { $0 + previewMinor($1.amountText) }
    }

    /// Drops claims by removed participants; returns names of items left without a claimant.
    public static func pruneClaims(_ items: [FormItem], participantIds: [String]) -> (items: [FormItem], orphaned: [String]) {
        let keep = Set(participantIds)
        var orphaned: [String] = []
        let next = items.map { item -> FormItem in
            if item.assignedUserIds.allSatisfy(keep.contains) { return item }
            let assigned = item.assignedUserIds.filter(keep.contains)
            if assigned.isEmpty { orphaned.append(item.name.nonEmpty ?? "Item") }
            return item.with(assignedUserIds: assigned)
        }
        return (next, orphaned)
    }

    private static func format(_ minor: Int) -> String { Currency.format(minor, currency: Currency.ledgerCode) }

    /// `computeSplits`: the splits to save; every share positive and the total exact.
    public static func computeSplits(_ input: SplitInput) -> Result<[ShareAllocation], ParseError> {
        let participantIds = input.participantIds.uniqued()
        let nameOf = input.nameOf
        let total = input.totalMinor
        if total <= 0 { return .failure(ParseError("Please enter an amount greater than 0.")) }
        if input.type == .income { return .success([ShareAllocation(userId: input.payerId, shareMinor: total)]) }
        if participantIds.isEmpty { return .failure(ParseError("Pick at least one person to split with.")) }

        let shares: Shares
        do {
            switch input.splitMethod {
            case .equal:
                if total < participantIds.count {
                    return .failure(ParseError(
                        "\(format(total)) is too small to split between \(participantIds.count) people. Someone would owe nothing."))
                }
                shares = try Splits.equal(total, among: participantIds)
            case .exact:
                var allocations = Shares()
                for uid in participantIds {
                    let raw = (input.exactAmounts[uid] ?? "").jsTrimmed
                    if raw.isEmpty {
                        return .failure(ParseError("Enter an amount for \(nameOf(uid)), or remove them from the split."))
                    }
                    switch parseAmountInput(raw, label: "amount for \(nameOf(uid))") {
                    case let .failure(error): return .failure(error)
                    case let .success(value): allocations.set(uid, value)
                    }
                }
                let sum = allocations.total
                if sum != total {
                    let diff = total - sum
                    return .failure(ParseError(
                        "Per-person amounts add up to \(format(sum)), but the total is \(format(total)) (\(diff > 0 ? "short by" : "over by") \(format(abs(diff))))."))
                }
                shares = try Splits.exact(total, allocations: allocations)
            case .itemized:
                var prices: [Int] = []
                for item in input.items {
                    let raw = item.amountText.jsTrimmed
                    if raw.isEmpty {
                        prices.append(0)
                        continue
                    }
                    switch parseAmountInput(raw, label: "price for \"\(item.name.nonEmpty ?? "item")\"") {
                    case let .failure(error): return .failure(error)
                    case let .success(value): prices.append(value)
                    }
                }
                let keep = Set(participantIds)
                let lineItems = zip(input.items, prices).map {
                    ReceiptItem(name: $0.0.name.nonEmpty ?? "Item", quantity: 1, priceMinor: $0.1)
                }
                var assignments: [Int: [String]] = [:]
                for (index, item) in input.items.enumerated() {
                    let claimed = item.assignedUserIds.filter(keep.contains)
                    assignments[index] = claimed.isEmpty ? participantIds : claimed
                }
                shares = try ItemizedShares.calculate(totalMinor: total, lineItems: lineItems, assignments: assignments,
                                                      participantIds: participantIds)
            }
        } catch {
            return .failure(ParseError(friendlyError(error.message)))
        }

        let zero = participantIds.filter { (shares[$0] ?? 0) <= 0 }
        if !zero.isEmpty {
            return .failure(ParseError(
                "\(zero.map(nameOf).joined(separator: ", ")) would owe nothing with this split. Remove them from the split or adjust the amounts."))
        }
        let splits = participantIds.map { ShareAllocation(userId: $0, shareMinor: shares[$0] ?? 0) }
        if splits.reduce(0, { $0 + $1.shareMinor }) != total {
            return .failure(ParseError("We couldn't split this amount exactly. Please check the numbers."))
        }
        return .success(splits)
    }

    private static let categoryHints: [(match: JSRegex, keywords: [String])] = [
        (JSRegex("ride|taxi|car|transport|trip|cab", "i"), ["transport", "travel", "ride", "taxi"]),
        (JSRegex("grocer|quik|supermarket|market", "i"), ["grocer"]),
        (JSRegex("food|dining|restaurant|meal|dinner|lunch", "i"), ["food", "dining", "restaurant"]),
        (JSRegex("box|deliver|courier|parcel|package", "i"), ["delivery", "shipping", "courier", "other"]),
    ]

    /// AddExpenseModal.tsx:39-61: exact name, then partial match, then keyword synonyms.
    public static func findCategoryId(_ categories: [Category], hint: String?) -> String? {
        guard let hint = hint.nonEmpty else { return nil }
        let h = hint.jsTrimmed.lowercased()
        if let exact = categories.first(where: { $0.name.lowercased() == h }) { return exact.id }
        if let partial = categories.first(where: { h.isEmpty || $0.name.lowercased().contains(h) || h.contains($0.name.lowercased()) }) {
            return partial.id
        }
        for rule in categoryHints where rule.match.test(h) {
            for keyword in rule.keywords {
                if let hit = categories.first(where: { $0.name.lowercased().contains(keyword) }) { return hit.id }
            }
        }
        return nil
    }

    private static let moneyKeystroke = JSRegex("^[0-9.,]*$")
    private static let numberKeystroke = JSRegex("^[0-9.]*$")

    /// Only digits, "," and "." may be typed into money fields.
    public static func isMoneyKeystroke(_ text: String) -> Bool { moneyKeystroke.test(text) }

    /// Percent / share fields: digits and a decimal point (NewSplitModal).
    public static func isNumberKeystroke(_ text: String) -> Bool { numberKeystroke.test(text) }
}
