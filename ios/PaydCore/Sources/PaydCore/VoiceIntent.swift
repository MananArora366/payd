import Foundation

// Port of the pure part of web/src/lib/ai/gemini.ts:1-479 (deterministic voice parser and ledger Q&A)
// plus the request contexts built in components/voice/FloatingMicrophone.tsx. This is what the server
// itself returns when AI is off; the app uses it as the on-device fallback. Amounts are exact Decimals
// in major units (never Double); money in contexts is integer fils.

public enum VoiceIntentKind: String, Codable, Sendable {
    case addExpense = "add_expense", addIncome = "add_income", splitExpense = "split_expense"
    case recordRepayment = "record_repayment", query
}

/// `VoiceIntentSchema`.
public struct VoiceIntent: Codable, Sendable, Hashable {
    public let intent: VoiceIntentKind
    /// Major units, exact (JSON number).
    public let amount: Decimal?
    public let currency: String?
    public let category: String?
    public let payer: String?
    public let participants: [String]
    public let splitMethod: SplitMethod?
    public let groupName: String?
    public let notes: String?
    public let confidence: Double
    public let missingFields: [String]
    public let clarificationQuestion: String?

    enum CodingKeys: String, CodingKey {
        case intent, amount, currency, category, payer, participants, splitMethod = "split_method"
        case groupName = "group_name", notes, confidence, missingFields = "missing_fields"
        case clarificationQuestion = "clarification_question"
    }

    public init(intent: VoiceIntentKind, amount: Decimal?, currency: String?, category: String?, payer: String?,
                participants: [String], splitMethod: SplitMethod?, groupName: String?, notes: String?,
                confidence: Double, missingFields: [String], clarificationQuestion: String? = nil) {
        self.intent = intent
        self.amount = amount
        self.currency = currency
        self.category = category
        self.payer = payer
        self.participants = participants
        self.splitMethod = splitMethod
        self.groupName = groupName
        self.notes = notes
        self.confidence = confidence
        self.missingFields = missingFields
        self.clarificationQuestion = clarificationQuestion
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        intent = try c.decode(VoiceIntentKind.self, forKey: .intent)
        amount = try c.decodeIfPresent(Decimal.self, forKey: .amount)
        currency = try c.decodeIfPresent(String.self, forKey: .currency)
        category = try c.decodeIfPresent(String.self, forKey: .category)
        payer = try c.decodeIfPresent(String.self, forKey: .payer)
        participants = try c.decode([String].self, forKey: .participants)
        splitMethod = try c.decodeIfPresent(SplitMethod.self, forKey: .splitMethod)
        groupName = try c.decodeIfPresent(String.self, forKey: .groupName)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        confidence = try c.decode(Double.self, forKey: .confidence)
        missingFields = try c.decode([String].self, forKey: .missingFields)
        clarificationQuestion = try c.decodeIfPresent(String.self, forKey: .clarificationQuestion)
        guard (0...1).contains(confidence) else {
            throw DecodingError.dataCorruptedError(forKey: .confidence, in: c, debugDescription: "Confidence out of range")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(intent, forKey: .intent)
        try c.encodeNullable(amount, forKey: .amount)
        try c.encodeNullable(currency, forKey: .currency)
        try c.encodeNullable(category, forKey: .category)
        try c.encodeNullable(payer, forKey: .payer)
        try c.encode(participants, forKey: .participants)
        try c.encodeNullable(splitMethod, forKey: .splitMethod)
        try c.encodeNullable(groupName, forKey: .groupName)
        try c.encodeNullable(notes, forKey: .notes)
        try c.encode(confidence, forKey: .confidence)
        try c.encode(missingFields, forKey: .missingFields)
        try c.encodeNullable(clarificationQuestion, forKey: .clarificationQuestion)
    }

    /// The amount in fils (exact Decimal → minor units, half away from zero); nil without an amount.
    public var amountMinor: Int? {
        guard let amount else { return nil }
        var source = amount * 100
        var rounded = Decimal()
        NSDecimalRound(&rounded, &source, 0, .plain)
        guard abs(rounded) <= Decimal(Int.max) else { return nil }
        return NSDecimalNumber(decimal: rounded).intValue
    }

    func with(amount: Decimal?, category: String?, notes: String?, confidence: Double) -> VoiceIntent {
        VoiceIntent(intent: intent, amount: amount, currency: currency, category: category, payer: payer,
                    participants: participants, splitMethod: splitMethod, groupName: groupName, notes: notes,
                    confidence: confidence, missingFields: missingFields, clarificationQuestion: clarificationQuestion)
    }
}

/// `InterpretContext` (camelCase keys), sent with `/api/ai/interpret`.
public struct InterpretContext: Codable, Sendable, Hashable {
    public struct CurrentUser: Codable, Sendable, Hashable {
        public let id: String
        public let name: String
        public let currency: String

        public init(id: String, name: String, currency: String = "AED") {
            self.id = id
            self.name = name
            self.currency = currency
        }
    }

    public struct Named: Codable, Sendable, Hashable {
        public let id: String
        public let name: String

        public init(id: String, name: String) {
            self.id = id
            self.name = name
        }
    }

    public let currentUser: CurrentUser
    public let knownMembers: [Named]
    public let groups: [Named]
    public let categories: [String]

    public init(currentUser: CurrentUser, knownMembers: [Named], groups: [Named], categories: [String]) {
        self.currentUser = currentUser
        self.knownMembers = knownMembers
        self.groups = groups
        self.categories = categories
    }

    /// FloatingMicrophone.tsx:168-177.
    public static func from(state: LedgerState) -> InterpretContext {
        let current = LedgerQueries.currentUser(in: state)
        return InterpretContext(
            currentUser: CurrentUser(id: current.id, name: current.name, currency: "AED"),
            knownMembers: state.users.map { Named(id: $0.id, name: $0.name) },
            groups: state.groups.map { Named(id: $0.id, name: $0.name) },
            categories: state.categories.map(\.name))
    }
}

/// `QueryPersonBalance`: positive = they owe the current user (fils).
public struct QueryPerson: Codable, Sendable, Hashable {
    public let name: String
    public let netMinor: Int

    public init(name: String, netMinor: Int) {
        self.name = name
        self.netMinor = netMinor
    }
}

/// `QueryCategorySpend`.
public struct QueryCategory: Codable, Sendable, Hashable {
    public let name: String
    public let spentMinor: Int

    public init(name: String, spentMinor: Int) {
        self.name = name
        self.spentMinor = spentMinor
    }
}

/// The `dataContext` sent to `/api/ai/query` (FloatingMicrophone.tsx:261-286). Every field is optional,
/// like the web type, so partial (legacy) contexts answer too; `from(query:state:snapshot:)` fills all.
public struct QueryDataContext: Codable, Sendable, Hashable {
    public let currency: String?
    public let userNetBalance: Int?
    public let owedToMeMinor: Int?
    public let iOweMinor: Int?
    public let spentMinor: Int?
    public let incomeMinor: Int?
    public let budgetMinor: Int?
    public let people: [QueryPerson]
    public let topCategories: [QueryCategory]
    public let formattedNet: String?
    public let formattedOwedToMe: String?
    public let formattedIOwe: String?
    public let formattedSpent: String?
    public let formattedIncome: String?
    public let formattedBudget: String?
    public let formattedRemaining: String?
    public let type: String?

    enum CodingKeys: String, CodingKey {
        case currency, userNetBalance, owedToMeMinor, iOweMinor, spentMinor, incomeMinor, budgetMinor, people
        case topCategories, formattedNet, formattedOwedToMe, formattedIOwe, formattedSpent, formattedIncome
        case formattedBudget, formattedRemaining, type
    }

    public init(currency: String? = nil, userNetBalance: Int? = nil, owedToMeMinor: Int? = nil, iOweMinor: Int? = nil,
                spentMinor: Int? = nil, incomeMinor: Int? = nil, budgetMinor: Int? = nil, people: [QueryPerson] = [],
                topCategories: [QueryCategory] = [], formattedNet: String? = nil, formattedOwedToMe: String? = nil,
                formattedIOwe: String? = nil, formattedSpent: String? = nil, formattedIncome: String? = nil,
                formattedBudget: String? = nil, formattedRemaining: String? = nil, type: String? = nil) {
        self.currency = currency
        self.userNetBalance = userNetBalance
        self.owedToMeMinor = owedToMeMinor
        self.iOweMinor = iOweMinor
        self.spentMinor = spentMinor
        self.incomeMinor = incomeMinor
        self.budgetMinor = budgetMinor
        self.people = people
        self.topCategories = topCategories
        self.formattedNet = formattedNet
        self.formattedOwedToMe = formattedOwedToMe
        self.formattedIOwe = formattedIOwe
        self.formattedSpent = formattedSpent
        self.formattedIncome = formattedIncome
        self.formattedBudget = formattedBudget
        self.formattedRemaining = formattedRemaining
        self.type = type
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        currency = try c.decodeIfPresent(String.self, forKey: .currency)
        userNetBalance = try c.decodeIfPresent(Int.self, forKey: .userNetBalance)
        owedToMeMinor = try c.decodeIfPresent(Int.self, forKey: .owedToMeMinor)
        iOweMinor = try c.decodeIfPresent(Int.self, forKey: .iOweMinor)
        spentMinor = try c.decodeIfPresent(Int.self, forKey: .spentMinor)
        incomeMinor = try c.decodeIfPresent(Int.self, forKey: .incomeMinor)
        budgetMinor = try c.decodeIfPresent(Int.self, forKey: .budgetMinor)
        people = try c.decodeIfPresent([QueryPerson].self, forKey: .people) ?? []
        topCategories = try c.decodeIfPresent([QueryCategory].self, forKey: .topCategories) ?? []
        formattedNet = try c.decodeIfPresent(String.self, forKey: .formattedNet)
        formattedOwedToMe = try c.decodeIfPresent(String.self, forKey: .formattedOwedToMe)
        formattedIOwe = try c.decodeIfPresent(String.self, forKey: .formattedIOwe)
        formattedSpent = try c.decodeIfPresent(String.self, forKey: .formattedSpent)
        formattedIncome = try c.decodeIfPresent(String.self, forKey: .formattedIncome)
        formattedBudget = try c.decodeIfPresent(String.self, forKey: .formattedBudget)
        formattedRemaining = try c.decodeIfPresent(String.self, forKey: .formattedRemaining)
        type = try c.decodeIfPresent(String.self, forKey: .type)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(currency, forKey: .currency)
        try c.encodeIfPresent(userNetBalance, forKey: .userNetBalance)
        try c.encodeIfPresent(owedToMeMinor, forKey: .owedToMeMinor)
        try c.encodeIfPresent(iOweMinor, forKey: .iOweMinor)
        try c.encodeIfPresent(spentMinor, forKey: .spentMinor)
        try c.encodeIfPresent(incomeMinor, forKey: .incomeMinor)
        // The web sends `budgetMinor: null` when there is no monthly budget.
        try c.encodeNullable(budgetMinor, forKey: .budgetMinor)
        try c.encode(people, forKey: .people)
        try c.encode(topCategories, forKey: .topCategories)
        try c.encodeIfPresent(formattedNet, forKey: .formattedNet)
        try c.encodeIfPresent(formattedOwedToMe, forKey: .formattedOwedToMe)
        try c.encodeIfPresent(formattedIOwe, forKey: .formattedIOwe)
        try c.encodeIfPresent(formattedSpent, forKey: .formattedSpent)
        try c.encodeIfPresent(formattedIncome, forKey: .formattedIncome)
        try c.encodeIfPresent(formattedBudget, forKey: .formattedBudget)
        try c.encodeIfPresent(formattedRemaining, forKey: .formattedRemaining)
        try c.encodeIfPresent(type, forKey: .type)
    }

    /// `handleFinancialQuery` dataContext, including `queryInsights` (FloatingMicrophone.tsx:222-286).
    public static func from(query: String, state: LedgerState, snapshot: LedgerSnapshot) -> QueryDataContext {
        let current = snapshot.currentUser
        let people = state.users.filter { $0.id != current.id }.compactMap { user -> QueryPerson? in
            let theyOweMe = snapshot.bilateralDebts[user.id]?[current.id] ?? 0
            let iOweThem = snapshot.bilateralDebts[current.id]?[user.id] ?? 0
            let net = theyOweMe - iOweThem
            return net == 0 ? nil : QueryPerson(name: user.name, netMinor: net)
        }
        var transactionsById: [String: Transaction] = [:]
        for txn in state.transactions where transactionsById[txn.id] == nil { transactionsById[txn.id] = txn }
        var byCategory = Shares()
        for split in state.splits where split.userId == current.id {
            guard let txn = transactionsById[split.transactionId], !txn.isDeleted, txn.type == .expense else { continue }
            let name = LedgerQueries.category(txn.categoryId, in: state)?.name ?? "Other"
            byCategory.add(name, split.shareMinor)
        }
        let topCategories = byCategory.map { QueryCategory(name: $0.key, spentMinor: $0.value) }
            .stableSorted { $0.spentMinor > $1.spentMinor }
            .prefix(5)
        let budget = LedgerQueries.monthlyBudget(for: current.id, in: state)
        let spent = snapshot.userSpending.totalSpentMinor
        let income = snapshot.userSpending.totalIncomeMinor
        let aed = { (minor: Int) in Currency.format(minor, currency: "AED") }
        return QueryDataContext(
            currency: "AED", userNetBalance: snapshot.userNetBalance, owedToMeMinor: snapshot.userOwedToMe,
            iOweMinor: snapshot.userIOwe, spentMinor: spent, incomeMinor: income, budgetMinor: budget?.limitMinor,
            people: Array(people.prefix(50)), topCategories: Array(topCategories),
            formattedNet: aed(snapshot.userNetBalance), formattedOwedToMe: aed(snapshot.userOwedToMe),
            formattedIOwe: aed(snapshot.userIOwe), formattedSpent: aed(spent), formattedIncome: aed(income),
            formattedBudget: budget.map { aed($0.limitMinor) } ?? "None set",
            formattedRemaining: budget.map { aed(max(0, $0.limitMinor - spent)) } ?? "N/A",
            type: query.lowercased().contains("spend") ? "monthly_spend" : "balance_summary")
    }
}

public enum VoiceRules {
    public static let maxTextLength = 2000
    /// `MAX_NOTES_LENGTH`.
    public static let maxNotesLength = 140

    private static let numberWords: [String: Int] = [
        "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
        "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
        "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
        "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
    ]

    /// `parseNumberWords`: value of the first run of number words ("one hundred and twenty" → 120).
    public static func parseNumberWords(_ text: String) -> Int? {
        let lowered = text.lowercased().replacingOccurrences(of: "-", with: " ")
        let tokens = lowered.split(whereSeparator: { !("a"..."z").contains($0) }).map(String.init)
        guard let start = tokens.firstIndex(where: { numberWords[$0] != nil || $0 == "hundred" || $0 == "thousand" })
        else { return nil }
        var total = 0
        var current = 0
        var consumed = 0
        for token in tokens[start...] {
            if let value = numberWords[token] {
                current += value
                consumed += 1
            } else if token == "hundred" {
                current = (current == 0 ? 1 : current) * 100
                consumed += 1
            } else if token == "thousand" {
                total += (current == 0 ? 1 : current) * 1000
                current = 0
                consumed += 1
            } else if token == "and" && consumed > 0 {
                continue
            } else {
                break
            }
        }
        if consumed == 0 { return nil }
        let value = total + current
        return value > 0 ? value : nil
    }

    private static let currencyToken = "(?:aed|dhs?|dirhams?|usd|dollars?|bucks|eur|euros?|gbp|pounds?|inr|rupees?|\\$|€|£|₹)"
    private static let numberToken = "(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)"
    private static let currencyThenNumber = JSRegex("\(currencyToken)\\s*\(numberToken)", "i")
    private static let numberThenCurrency = JSRegex("\(numberToken)\\s*\(currencyToken)", "i")
    private static let anyNumber = JSRegex("(?:^|[^\\d.,])\(numberToken)")
    private static let posix = Locale(identifier: "en_US_POSIX")

    /// `toAmount`: positive, at most 1e12, rounded to 2 decimals (exact Decimal maths).
    private static func toAmount(_ raw: String) -> Decimal? {
        guard var value = Decimal(string: raw.replacingOccurrences(of: ",", with: ""), locale: posix),
              value > 0, value <= Decimal(Currency.maxMajorAmount) else { return nil }
        var rounded = Decimal()
        NSDecimalRound(&rounded, &value, 2, .plain)
        return rounded
    }

    /// `extractAmount`: a number next to a currency marker, then any number, then number words.
    public static func extractAmount(_ text: String) -> Decimal? {
        let lower = text.lowercased()
        if let raw = (currencyThenNumber.firstMatch(lower) ?? numberThenCurrency.firstMatch(lower))?[1],
           let value = toAmount(raw) { return value }
        if let raw = anyNumber.firstMatch(lower)?[1], let value = toAmount(raw) { return value }
        return parseNumberWords(lower).map { Decimal($0) }
    }

    private static let usd = JSRegex("\\$|\\b(?:dollars?|usd|bucks)\\b")
    private static let eur = JSRegex("€|\\b(?:euros?|eur)\\b")
    private static let gbp = JSRegex("£|\\b(?:pounds?|gbp)\\b")
    private static let inr = JSRegex("₹|\\b(?:rupees?|inr)\\b")
    private static let aedPattern = JSRegex("\\b(?:aed|dhs?|dirhams?)\\b")

    /// `detectCurrency`.
    public static func detectCurrency(_ text: String, default defaultCurrency: String) -> String {
        let t = text.lowercased()
        if usd.test(t) { return "USD" }
        if eur.test(t) { return "EUR" }
        if gbp.test(t) { return "GBP" }
        if inr.test(t) { return "INR" }
        if aedPattern.test(t) { return "AED" }
        return defaultCurrency.nonEmpty ?? "AED"
    }

    /// `CATEGORY_KEYWORDS`, in the web's order.
    static let categoryKeywords: [(category: String, keywords: [String])] = [
        ("Food and dining", ["dinner", "lunch", "breakfast", "brunch", "coffee", "cafe", "restaurant", "burger", "pizza", "food", "eating", "shawarma"]),
        ("Groceries", ["supermarket", "groceries", "grocery", "carrefour", "lulu", "milk", "vegetables"]),
        ("Transportation", ["uber", "careem", "taxi", "metro", "petrol", "fuel", "parking", "cab", "salik"]),
        ("Entertainment", ["movie", "cinema", "concert", "game", "bowling", "party"]),
        ("Rent and accommodation", ["rent", "airbnb", "housing"]),
        ("Utilities and bills", ["dewa", "wifi", "wi-fi", "internet", "electricity", "water bill", "bill", "phone"]),
        ("Healthcare", ["doctor", "pharmacy", "medicine", "hospital", "clinic"]),
        ("Education", ["course", "tuition", "books", "school", "university"]),
        ("Travel", ["flight", "airline", "hotel", "trip", "hatta"]),
        ("Subscriptions", ["netflix", "spotify", "prime", "gym"]),
        ("Shopping", ["clothes", "amazon", "mall", "shopping"]),
    ]

    private static func hasWord(_ text: String, _ word: String) -> Bool {
        JSRegex("\\b\(JSRegex.escape(word))\\b", "i").test(text)
    }

    /// `resolveCategory`: the list's spelling of `name` (case-insensitive), or nil.
    public static func resolveCategory(_ name: String?, categories: [String]) -> String? {
        guard let name = name.nonEmpty else { return nil }
        let n = name.jsTrimmed.lowercased()
        return categories.first { $0.lowercased() == n }
    }

    private static func matchCategoryKeyword(_ text: String, categories: [String]) -> String? {
        for (category, keywords) in categoryKeywords {
            guard let resolved = resolveCategory(category, categories: categories) else { continue }
            if keywords.contains(where: { hasWord(text, $0) }) { return resolved }
        }
        return nil
    }

    private static let whitespaceRun = JSRegex("\\s+")

    /// `truncateNotes`: collapses whitespace and caps the length with "…".
    public static func truncateNotes(_ text: String, max: Int = maxNotesLength) -> String {
        let clean = whitespaceRun.replacing(in: text, with: " ").jsTrimmed
        return clean.jsLength > max ? "\(clean.jsPrefix(max - 1).jsTrimmedEnd)…" : clean
    }

    private static let venuePattern = JSRegex("\\bat\\s+([A-Z][\\w'&-]*(?:\\s+[A-Z][\\w'&-]*){0,2})")
    private static let currencyWords = JSRegex(currencyToken, "i")
    private static let numbers = JSRegex("\\d[\\d,.]*")
    private static let stopWords = JSRegex(
        "\\b(?:i|paid|pay|spent|spend|for|on|with|and|split|equally|between|the|a|an|me|my|just|today|yesterday)\\b", "i")

    /// `buildShortDescription`: "Dinner", "Dinner at Zuma", "Repayment from Rahul".
    public static func buildShortDescription(_ intent: VoiceIntent, maxLen: Int = 40) -> String {
        let notes = intent.notes ?? ""
        if intent.intent == .recordRepayment {
            return intent.payer.nonEmpty.map { "Repayment from \(PaydFormat.firstName($0))" } ?? "Repayment"
        }
        for (_, keywords) in categoryKeywords {
            if let keyword = keywords.first(where: { hasWord(notes, $0) }) {
                let base = keyword.jsCapitalizedFirst
                let title = venuePattern.firstMatch(notes)?[1].map { "\(base) at \($0)" } ?? base
                return title.jsPrefix(maxLen)
            }
        }
        var stripped = currencyWords.replacing(in: notes, with: " ")
        stripped = numbers.replacing(in: stripped, with: " ")
        stripped = stopWords.replacing(in: stripped, with: " ")
        stripped = whitespaceRun.replacing(in: stripped, with: " ").jsTrimmed
        if !stripped.isEmpty {
            let words = stripped.jsSpaceSplit.prefix(5).joined(separator: " ")
            return words.jsCapitalizedFirst.jsPrefix(maxLen)
        }
        if let category = intent.category.nonEmpty { return category }
        return intent.intent == .addIncome ? "Income" : "Expense"
    }

    /// `sanitizeIntent`: only listed categories, short notes, rounded amount, clamped confidence.
    public static func sanitize(_ intent: VoiceIntent, context: InterpretContext, rawTranscript: String?) -> VoiceIntent {
        var category = resolveCategory(intent.category, categories: context.categories)
        if category == nil && intent.intent != .recordRepayment && intent.intent != .query {
            category = resolveCategory("Other", categories: context.categories)
        }
        if intent.intent == .recordRepayment { category = nil }
        let notesSource = intent.notes ?? rawTranscript
        var amount: Decimal?
        if var value = intent.amount, value > 0 {
            var rounded = Decimal()
            NSDecimalRound(&rounded, &value, 2, .plain)
            amount = rounded
        }
        let confidence = intent.confidence.isFinite ? intent.confidence : 0.5
        return intent.with(amount: amount, category: category, notes: notesSource.nonEmpty.map { truncateNotes($0) },
                           confidence: min(1, max(0, confidence)))
    }

    private static let queryIntent = JSRegex("\\b(how much|who owes|who do i owe|balance|what is my|what's my|did i spend|how am i doing)\\b")
    private static let repaymentIntent = JSRegex("\\b(paid me back|paid back|repaid|settled|pay back|paid off)\\b")
    private static let incomeIntent = JSRegex("\\b(income|salary|received|earned|got paid|freelance)\\b")
    private static let splitIntent = JSRegex("\\b(split|between|with)\\b")

    /// `deterministicParseIntent`: the rule-based parser used when no LLM is enabled or it fails.
    public static func deterministicParseIntent(_ transcript: String, context: InterpretContext) -> VoiceIntent {
        let text = transcript.lowercased().jsTrimmed
        var missing: [String] = []

        let intent: VoiceIntentKind
        if queryIntent.test(text) { intent = .query }
        else if repaymentIntent.test(text) { intent = .recordRepayment }
        else if incomeIntent.test(text) { intent = .addIncome }
        else if splitIntent.test(text) { intent = .splitExpense }
        else { intent = .addExpense }

        let amount = extractAmount(transcript)
        let currency = detectCurrency(transcript, default: context.currentUser.currency.nonEmpty ?? "AED")
        let keywordCategory = matchCategoryKeyword(text, categories: context.categories)

        var participants: [String] = []
        for member in context.knownMembers {
            let first = PaydFormat.firstName(member.name.lowercased())
            if !first.isEmpty && hasWord(text, first) && !participants.contains(member.name) {
                participants.append(member.name)
            }
        }

        var group: String?
        for candidate in context.groups where text.contains(candidate.name.lowercased()) { group = candidate.name }

        var splitMethod: SplitMethod?
        if intent == .splitExpense {
            if text.contains("percent") { splitMethod = .percentage }
            else if text.contains("share") { splitMethod = .shares }
            else if text.contains("exact") { splitMethod = .exact }
            else { splitMethod = .equal }
        }

        var payer: String? = context.currentUser.name
        for member in context.knownMembers {
            let first = PaydFormat.firstName(member.name.lowercased())
            if text.contains("\(first) paid") || text.contains("paid by \(first)") || text.contains("\(first) repaid")
                || text.contains("\(first) settled") {
                payer = member.name
            }
        }

        if intent == .splitExpense && !participants.isEmpty
            && !participants.contains(context.currentUser.name) && payer == context.currentUser.name {
            participants.insert(context.currentUser.name, at: 0)
        }

        if intent != .query {
            if amount == nil { missing.append("amount") }
            if intent == .splitExpense && participants.isEmpty { missing.append("participants") }
        }

        var clarification: String?
        if missing.contains("amount") {
            clarification = intent == .recordRepayment ? "How much was paid back?" : "How much was the expense?"
        } else if missing.contains("participants") {
            clarification = "Who would you like to split this with?"
        }

        var category: String?
        if intent == .addExpense || intent == .splitExpense || intent == .addIncome {
            category = keywordCategory ?? resolveCategory("Other", categories: context.categories)
        }

        // Heuristic confidence: rule-based parsing is never as sure as a full model.
        var confidence = 0.45
        if intent == .query {
            confidence = 0.7
        } else {
            if amount != nil { confidence += 0.2 }
            if keywordCategory != nil || intent == .recordRepayment || intent == .addIncome { confidence += 0.1 }
            if intent != .splitExpense || !participants.isEmpty { confidence += 0.1 }
            confidence -= 0.15 * Double(missing.count)
        }
        confidence = PaydMath.jsRound(min(0.85, max(0.1, confidence)) * 100) / 100

        return VoiceIntent(intent: intent, amount: amount, currency: currency, category: category, payer: payer,
                           participants: participants, splitMethod: splitMethod, groupName: group,
                           notes: truncateNotes(transcript), confidence: confidence, missingFields: missing,
                           clarificationQuestion: clarification)
    }

    private static func aed(_ minor: Int) -> String { Currency.format(minor, currency: "AED") }

    private static let personQuestion = JSRegex("\\b(owes?|owed|balance|settle[ds]?|even)\\b")
    private static let whoOwesMe = JSRegex("who owes me|owes me the most|who.*owe.*me")
    private static let amIOwed = JSRegex("how much am i owed|owed to me|am i owed")
    private static let doIOwe = JSRegex("who do i owe|how much do i owe|do i owe|what do i owe|\\bi owe\\b")
    private static let categoryQuestion = JSRegex("categor|most on|biggest expense|top spend")
    private static let budgetQuestion = JSRegex("budget|remaining|left to spend")
    private static let spendQuestion = JSRegex("spen[dt]")
    private static let incomeQuestion = JSRegex("income|earn")

    /// `deterministicAnswerQuery`: answers common ledger questions straight from the numbers.
    public static func deterministicAnswerQuery(_ query: String, context ctx: QueryDataContext) -> String {
        let q = query.lowercased()
        let people = ctx.people
        let owesMe = people.filter { $0.netMinor > 0 }.stableSorted { $0.netMinor > $1.netMinor }
        let iOweList = people.filter { $0.netMinor < 0 }.stableSorted { $0.netMinor < $1.netMinor }

        let owedToMe = ctx.owedToMeMinor ?? owesMe.reduce(0) { $0 + $1.netMinor }
        let iOwe = ctx.iOweMinor ?? -iOweList.reduce(0) { $0 + $1.netMinor }
        let net = ctx.userNetBalance ?? owedToMe - iOwe
        let first = { (name: String) in PaydFormat.firstName(name) }

        let person = people.first { person in
            let name = PaydFormat.firstName(person.name.lowercased())
            return !name.isEmpty && hasWord(q, name)
        }
        if let person, personQuestion.test(q) {
            let name = first(person.name)
            if person.netMinor > 0 { return "\(name) owes you \(aed(person.netMinor))." }
            if person.netMinor < 0 { return "You owe \(name) \(aed(-person.netMinor))." }
            return "You and \(name) are all settled up."
        }

        if whoOwesMe.test(q) {
            guard let top = owesMe.first else {
                if !(people.count > 0 || ctx.owedToMeMinor != nil) { return "You are owed \(aed(owedToMe)) in total." }
                // Say which way the money actually flows, so "nobody" isn't mistaken for "all settled".
                return iOweList.first.map {
                    "Nobody owes you anything right now. You owe \(first($0.name)) \(aed(-$0.netMinor))."
                } ?? "Nobody owes you anything right now."
            }
            let others = owesMe.dropFirst().prefix(2).map { "\(first($0.name)) (\(aed($0.netMinor)))" }
            return "\(first(top.name)) owes you the most: \(aed(top.netMinor))."
                + (others.isEmpty ? "" : " Also: \(others.joined(separator: ", ")).")
                + " In total you are owed \(aed(owedToMe))."
        }

        if amIOwed.test(q) {
            return owedToMe > 0 ? "You are owed \(aed(owedToMe)) in total." : "Nobody owes you anything right now."
        }

        if doIOwe.test(q) {
            if iOwe <= 0 { return "You do not owe anyone right now." }
            if !iOweList.isEmpty {
                let parts = iOweList.prefix(3).map { "\(first($0.name)) (\(aed(-$0.netMinor)))" }
                return "You owe \(aed(iOwe)) in total: \(parts.joined(separator: ", "))."
            }
            return "You owe \(aed(iOwe)) in total."
        }

        if categoryQuestion.test(q) {
            let categories = ctx.topCategories.filter { $0.spentMinor > 0 }.stableSorted { $0.spentMinor > $1.spentMinor }
            guard let top = categories.first else { return "I could not find any categorised spending yet." }
            return "Your top category is \(top.name) at \(aed(top.spentMinor))."
        }

        if budgetQuestion.test(q) {
            guard let budget = ctx.budgetMinor else { return "You have not set a monthly budget yet." }
            let remaining = budget - (ctx.spentMinor ?? 0)
            return remaining >= 0
                ? "You have \(aed(remaining)) left of your \(aed(budget)) budget."
                : "You are \(aed(-remaining)) over your \(aed(budget)) budget."
        }

        if spendQuestion.test(q) {
            if let spent = ctx.spentMinor {
                let budget = ctx.budgetMinor.map { " against a budget of \(aed($0))" } ?? ""
                return "You have spent \(aed(spent))\(budget)."
            }
            if let formatted = ctx.formattedSpent { return "You have spent \(formatted)." }
        }

        if incomeQuestion.test(q), let income = ctx.incomeMinor {
            return "Your recorded income is \(aed(income))."
        }

        if net > 0 { return "Overall you are owed \(aed(net)) (owed to you \(aed(owedToMe)), you owe \(aed(iOwe)))." }
        if net < 0 { return "Overall you owe \(aed(-net)) (you owe \(aed(iOwe)), owed to you \(aed(owedToMe)))." }
        return "You are all settled up. Your net balance is AED 0.00."
    }

    /// FloatingMicrophone.tsx:298-300: the answer shown when `/api/ai/query` cannot be reached.
    public static func offlineQueryFallback(_ context: QueryDataContext) -> String {
        let net = context.formattedNet ?? aed(context.userNetBalance ?? 0)
        let spent = context.formattedSpent ?? aed(context.spentMinor ?? 0)
        return "Your net balance is \(net). Total spent is \(spent)."
    }
}
