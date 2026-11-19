import Testing
@testable import PaydCore

struct VoiceExpenseParserTests {
    @Test(arguments: [
        ("coffee 22 dirhams", "Coffee", 2200),
        ("Spent 45.50 on lunch", "Lunch", 4550),
        ("uber 30 AED", "Uber", 3000),
        ("I paid 120 for dinner at Al Hallab", "Dinner at Al Hallab", 12000),
        ("AED 1,250 rent", "Rent", 125000),
        ("groceries 18,75 dhs", "Groceries", 1875),
    ])
    func extractsTitleAndAmount(text: String, title: String, amountMinor: Int) {
        let draft = VoiceExpenseParser.parse(text)
        #expect(draft.title == title)
        #expect(draft.amountMinor == amountMinor)
    }

    @Test func keepsTitleWhenNoAmountIsSpoken() {
        let draft = VoiceExpenseParser.parse("taxi to the airport")
        #expect(draft.title == "Taxi to the airport")
        #expect(draft.amountMinor == nil)
    }

    @Test func emptyOrFillerOnlyTranscriptGivesEmptyTitle() {
        #expect(VoiceExpenseParser.parse("").title == "")
        #expect(VoiceExpenseParser.parse("   ").amountMinor == nil)
        #expect(VoiceExpenseParser.parse("spent 40 dirhams").title == "")
        #expect(VoiceExpenseParser.parse("spent 40 dirhams").amountMinor == 4000)
    }

    @Test func zeroOrHugeAmountsAreIgnored() {
        #expect(VoiceExpenseParser.parse("coffee 0").amountMinor == nil)
        #expect(VoiceExpenseParser.parse("coffee 99999999999999999999").amountMinor == nil)
    }
}
