import Foundation
import Testing
@testable import PaydCore

/// Port of web/src/lib/ai/ai.test.ts blocks "deterministic parser" and "deterministic query answers"
/// (the Bedrock and route blocks are server-only).
struct VoiceRulesPortTests {
    private let ctx = InterpretContext(
        currentUser: .init(id: "u1", name: "Manan Arora", currency: "AED"),
        knownMembers: [.init(id: "u1", name: "Manan Arora"), .init(id: "u2", name: "Rahul"), .init(id: "u3", name: "Sarah")],
        groups: [.init(id: "g1", name: "Dubai Flatmates")],
        categories: ["Food and dining", "Groceries", "Transportation", "Other"])

    private func parse(_ text: String, _ context: InterpretContext? = nil) -> VoiceIntent {
        VoiceRules.deterministicParseIntent(text, context: context ?? ctx)
    }

    @Test("parses thousands separators and number words")
    func numbers() {
        #expect(VoiceRules.extractAmount("Paid AED 1,250.50 for rent") == Decimal(string: "1250.5"))
        #expect(VoiceRules.extractAmount("spent 1,250.50 dirhams") == Decimal(string: "1250.5"))
        #expect(VoiceRules.parseNumberWords("seventy five dirhams") == 75)
        #expect(VoiceRules.parseNumberWords("one hundred and twenty") == 120)
        #expect(VoiceRules.parseNumberWords("two thousand five hundred") == 2500)
        #expect(parse("Paid seventy five dirhams for lunch").amount == 75)
        #expect(VoiceRules.extractAmount("paid 12.345 for tea") == Decimal(string: "12.35"))
        #expect(parse("Paid 12.345 for tea").amountMinor == 1235)
    }

    @Test("prefers the number next to a currency marker")
    func currencyAdjacent() {
        #expect(VoiceRules.extractAmount("split with 3 people, 90 AED for pizza") == 90)
    }

    @Test("only returns categories from the supplied list")
    func categoriesFromList() {
        let i = parse("Spent 40 on netflix")
        #expect(i.category == "Other")
        let noOther = parse("Spent 40 on netflix", InterpretContext(currentUser: ctx.currentUser, knownMembers: ctx.knownMembers,
                                                                    groups: ctx.groups, categories: ["Groceries"]))
        #expect(noOther.category == nil)
    }

    @Test("repayments do not default to Food and have a payer")
    func repayments() {
        let i = parse("Rahul paid me back 80 AED")
        #expect(i.intent == .recordRepayment)
        #expect(i.category == nil)
        #expect(i.payer == "Rahul")
        #expect(i.amount == 80)
    }

    @Test("does not echo huge transcripts and does not claim fixed 0.92 confidence")
    func longTranscripts() {
        let long = "Paid 10 AED for coffee " + String(repeating: "blah ", count: 500)
        let i = parse(long)
        #expect((i.notes ?? "").count <= VoiceRules.maxNotesLength)
        #expect(i.confidence < 0.9)
        #expect(parse("Split dinner with Rahul").confidence < i.confidence)
    }

    @Test("dirham detection does not trigger on \"Abu Dhabi\"")
    func abuDhabi() {
        #expect(parse("Paid 10 dollars in Abu Dhabi").currency == "USD")
    }

    @Test("builds a short description instead of the raw transcript")
    func shortDescription() {
        #expect(VoiceRules.buildShortDescription(parse("Paid 120 AED for dinner with Rahul and Sarah")) == "Dinner")
        #expect(VoiceRules.buildShortDescription(parse("Rahul paid me back 80 AED")) == "Repayment from Rahul")
        #expect(VoiceRules.buildShortDescription(parse("Paid 50 for coffee at Tim Hortons")) == "Coffee at Tim Hortons")
    }

    @Test("split intent details: participants, group, method, confidence")
    func splitDetails() {
        let i = parse("Split 90 AED for dinner with Rahul in Dubai Flatmates by percent")
        #expect(i.intent == .splitExpense)
        #expect(i.participants == ["Manan Arora", "Rahul"])
        #expect(i.groupName == "Dubai Flatmates")
        #expect(i.splitMethod == .percentage)
        #expect(i.confidence == 0.85)
        #expect(i.missingFields.isEmpty && i.clarificationQuestion == nil)
    }

    @Test("sanitize keeps listed categories, rounds amounts and clamps confidence")
    func sanitize() {
        let raw = VoiceIntent(intent: .addExpense, amount: Decimal(string: "12.345"), currency: "AED", category: "Netflix",
                              payer: nil, participants: [], splitMethod: nil, groupName: nil, notes: nil, confidence: 1.7,
                              missingFields: [])
        let clean = VoiceRules.sanitize(raw, context: ctx, rawTranscript: "  spent   12.345 ")
        #expect(clean.amount == Decimal(string: "12.35"))
        #expect(clean.category == "Other")
        #expect(clean.notes == "spent 12.345")
        #expect(clean.confidence == 1)
        #expect(VoiceRules.truncateNotes(String(repeating: "a", count: 200)).count == 140)
        #expect(VoiceRules.truncateNotes(String(repeating: "a", count: 200)).hasSuffix("…"))
    }

    @Test("intent JSON round-trips with snake_case keys")
    func intentJSON() throws {
        let data = try PaydJSON.encoder.encode(parse("Rahul paid me back 80 AED"))
        let text = String(decoding: data, as: UTF8.self)
        #expect(text.contains("\"missing_fields\":[]"))
        #expect(text.contains("\"amount\":80"))
        #expect(text.contains("\"split_method\":null"))
        #expect(try PaydJSON.decoder.decode(VoiceIntent.self, from: data) == parse("Rahul paid me back 80 AED"))
    }

    // MARK: deterministic query answers

    private let data = QueryDataContext(
        userNetBalance: 3000, owedToMeMinor: 8000, iOweMinor: 5000, spentMinor: 120000, budgetMinor: 200000,
        people: [.init(name: "Rahul", netMinor: 5000), .init(name: "Sarah", netMinor: 3000), .init(name: "Priya", netMinor: -5000)],
        topCategories: [.init(name: "Groceries", spentMinor: 40000), .init(name: "Food and dining", spentMinor: 60000)])

    private func answer(_ q: String, _ context: QueryDataContext? = nil) -> String {
        VoiceRules.deterministicAnswerQuery(q, context: context ?? data)
    }

    @Test("who owes me the most")
    func whoOwesMost() {
        #expect(answer("Who owes me the most?").hasPrefix("Rahul owes you the most: AED 50.00"))
        #expect(answer("Who owes me the most?")
            == "Rahul owes you the most: AED 50.00. Also: Sarah (AED 30.00). In total you are owed AED 80.00.")
    }

    @Test("who owes me the most when I only owe others (seed data shape)")
    func whoOwesSeed() {
        let seed = QueryDataContext(currency: "AED", userNetBalance: -9667, owedToMeMinor: 0, iOweMinor: 9667,
                                    people: [.init(name: "Rahul Sharma", netMinor: -9667)])
        #expect(answer("who owes me the most?", seed) == "Nobody owes you anything right now. You owe Rahul AED 96.67.")
    }

    @Test("how much do I owe")
    func howMuchOwe() { #expect(answer("How much do I owe?") == "You owe AED 50.00 in total: Priya (AED 50.00).") }

    @Test("how much am I owed")
    func howMuchOwed() { #expect(answer("How much am I owed?") == "You are owed AED 80.00 in total.") }

    @Test("net balance")
    func net() { #expect(answer("What's my balance?").contains("Overall you are owed AED 30.00")) }

    @Test("specific person")
    func person() { #expect(answer("Does Priya owe me anything?") == "You owe Priya AED 50.00.") }

    @Test("top category")
    func topCategory() { #expect(answer("What category do I spend most on?") == "Your top category is Food and dining at AED 600.00.") }

    @Test("budget and spend")
    func budget() {
        #expect(answer("How much budget is remaining?").contains("AED 800.00 left"))
        #expect(answer("How much did I spend this month?").contains("AED 1,200.00"))
    }

    @Test("works with an empty context (legacy clients)")
    func emptyContext() { #expect(answer("balance?", QueryDataContext()).contains("settled up")) }

    @Test("offline fallback text (FloatingMicrophone)")
    func offline() {
        let ctx = QueryDataContext(formattedNet: "AED 1,500.00", formattedSpent: "AED 22.00")
        #expect(VoiceRules.offlineQueryFallback(ctx) == "Your net balance is AED 1,500.00. Total spent is AED 22.00.")
    }
}
