import Foundation
import Testing
@testable import PaydCore

/// Port of web/src/components/modals/newSplitLogic.test.ts. (The "never throws on garbage input"
/// cases cannot be expressed: Swift's types rule out undefined fields and unknown methods.)
struct NewSplitLogicPortTests {
    private let names = ["a": "Alice", "b": "Bob", "c": "Cara"]
    private var nameOf: (String) -> String { { [names] id in names[id] ?? id } }

    private func draft(title: String = "Dinner", amount: String = "100.00", payer: String = "a", group: String? = "g1",
                       participants: [String] = ["a", "b", "c"], method: SplitMethod = .equal,
                       values: [String: String] = [:], notes: String? = nil, category: String? = nil) -> NewSplitDraft {
        NewSplitDraft(title: title, amountInput: amount, payerId: payer, groupId: group, participantIds: participants,
                      method: method, values: values, notes: notes, categoryId: category)
    }

    private func built(_ d: NewSplitDraft, named: Bool = true) throws -> NewTransaction {
        try NewSplitLogic.build(d, nameOf: named ? nameOf : nil).get()
    }

    private func expectError(_ d: NewSplitDraft, _ pattern: String, sourceLocation: SourceLocation = #_sourceLocation) {
        guard case let .failure(error) = NewSplitLogic.build(d, nameOf: nameOf) else {
            Issue.record("expected an error matching \(pattern)", sourceLocation: sourceLocation)
            return
        }
        #expect(error.message.range(of: pattern, options: .regularExpression) != nil, "\(error.message)",
                sourceLocation: sourceLocation)
        #expect(error.message.range(of: "invariant|minor units", options: [.regularExpression, .caseInsensitive]) == nil,
                sourceLocation: sourceLocation)
    }

    private func shares(_ t: NewTransaction) -> [Int] { t.splits.map(\.shareMinor) }
    private func total(_ t: NewTransaction) -> Int { t.splits.reduce(0) { $0 + $1.shareMinor } }

    @Test("builds a full transaction input")
    func fullInput() throws {
        let t = try built(draft(title: "  Dinner  ", amount: "120.50", participants: ["a", "b"], notes: "  at Zuma ", category: "food"))
        #expect(t == NewTransaction(type: .expense, title: "Dinner", amountMinor: 12050, currency: "AED", categoryId: "food",
                                    payerId: "a", groupId: "g1", notes: "at Zuma",
                                    splits: [ShareAllocation(userId: "a", shareMinor: 6025), ShareAllocation(userId: "b", shareMinor: 6025)]))
        #expect(t.paymentMethod == nil)
    }

    @Test("defaults optional fields to null")
    func defaults() throws {
        let t = try built(draft(group: nil, notes: "   "), named: false)
        #expect(t.groupId == nil && t.categoryId == nil && t.notes == nil)
    }

    @Test("allows the payer to not be a participant")
    func payerNotParticipant() throws {
        #expect(try built(draft(participants: ["b"])).splits == [ShareAllocation(userId: "b", shareMinor: 10000)])
    }

    @Test("dedupes participants")
    func dedupes() throws {
        let t = try built(draft(participants: ["a", "b", "b", "a"]))
        #expect(t.splits.map(\.userId) == ["a", "b"])
        #expect(total(t) == 10000)
    }

    @Test("splits 100.00 three ways and sums exactly")
    func equalThree() throws {
        let t = try built(draft())
        #expect(total(t) == 10000)
        #expect(shares(t).sorted() == [3333, 3333, 3334])
    }

    @Test("rejects an amount too small for everyone to owe something")
    func tooSmall() { expectError(draft(amount: "0.02"), "too small to split between 3 people") }

    @Test("ignores values")
    func ignoresValues() throws { _ = try built(draft(values: ["a": "junk"])) }

    @Test("accepts amounts that sum to the total")
    func exactAccepts() throws {
        let t = try built(draft(method: .exact, values: ["a": "50", "b": "30.25", "c": "19.75"]))
        #expect(t.splits == [ShareAllocation(userId: "a", shareMinor: 5000), ShareAllocation(userId: "b", shareMinor: 3025),
                             ShareAllocation(userId: "c", shareMinor: 1975)])
    }

    @Test("says how much is short")
    func exactShort() { expectError(draft(method: .exact, values: ["a": "50", "b": "30", "c": "10"]), "short by .*10\\.00") }

    @Test("says how much is over")
    func exactOver() { expectError(draft(method: .exact, values: ["a": "50", "b": "30", "c": "20.01"]), "over by .*0\\.01") }

    @Test("names the person with a missing amount")
    func exactMissing() { expectError(draft(method: .exact, values: ["a": "50", "b": "50"]), "Enter an amount for Cara") }

    @Test("rejects invalid per-person amounts")
    func exactInvalid() {
        expectError(draft(method: .exact, values: ["a": "50", "b": "abc", "c": "50"]), "valid amount for Bob")
        expectError(draft(method: .exact, values: ["a": "50", "b": "-1", "c": "51"]), "Bob")
        expectError(draft(method: .exact, values: ["a": "50", "b": "49.999", "c": "0.001"]), "decimal places")
    }

    @Test("rejects a zero amount for a participant")
    func exactZero() { expectError(draft(method: .exact, values: ["a": "100", "b": "0", "c": "0"]), "Bob") }

    @Test("splits by percent")
    func percent() throws {
        #expect(shares(try built(draft(method: .percentage, values: ["a": "50", "b": "25", "c": "25"]))) == [5000, 2500, 2500])
    }

    @Test("accepts 33.33 x 3 within tolerance and sums exactly")
    func percentThirds() throws {
        #expect(total(try built(draft(method: .percentage, values: ["a": "33.33", "b": "33.33", "c": "33.33"]))) == 10000)
    }

    @Test("accepts sums right at the tolerance boundary")
    func percentBoundary() throws {
        _ = try built(draft(method: .percentage, values: ["a": "49.85", "b": "50", "c": "0"]))
        expectError(draft(method: .percentage, values: ["a": "49.84", "b": "50", "c": "0"]), "99\\.84%")
    }

    @Test("rejects percentages that do not sum to 100")
    func percentWrongSum() {
        expectError(draft(method: .percentage, values: ["a": "50", "b": "30", "c": "10"]), "add up to 90%.*100%")
        expectError(draft(method: .percentage, values: ["a": "50", "b": "50", "c": "10"]), "110%")
        #expect(NewSplitLogic.build(draft(method: .percentage, values: ["a": "50", "b": "49.5", "c": "0"]))
            == .failure(ParseError("Percentages add up to 99.5%, but they need to add up to 100%.")))
    }

    @Test("drops participants with 0%")
    func percentDropsZero() throws {
        #expect(try built(draft(method: .percentage, values: ["a": "60", "b": "40", "c": "0"])).splits
            == [ShareAllocation(userId: "a", shareMinor: 6000), ShareAllocation(userId: "b", shareMinor: 4000)])
    }

    @Test("rejects when only the payer is left after dropping zeros")
    func percentOnlyPayer() { expectError(draft(method: .percentage, values: ["a": "100", "b": "0", "c": "0"]), "only yourself") }

    @Test("rejects invalid or missing percentages with names")
    func percentInvalid() {
        expectError(draft(method: .percentage, values: ["a": "50", "b": "-50", "c": "100"]), "Bob")
        expectError(draft(method: .percentage, values: ["a": "50", "b": "50%", "c": "0"]), "Bob")
        expectError(draft(method: .percentage, values: ["a": "50", "b": "1e2", "c": "0"]), "Bob")
        expectError(draft(method: .percentage, values: ["a": "50", "b": "50"]), "percentage for Cara")
    }

    @Test("errors when a non-zero percentage rounds to a zero share")
    func percentRoundsToZero() {
        expectError(draft(amount: "0.10", method: .percentage, values: ["a": "99.9", "b": "0.1", "c": "0"]), "Bob would owe nothing")
    }

    @Test("splits by share counts")
    func sharesCounts() throws {
        #expect(shares(try built(draft(method: .shares, values: ["a": "2", "b": "1", "c": "1"]))) == [5000, 2500, 2500])
    }

    @Test("supports fractional shares (splitShares supports them) and sums exactly")
    func sharesFractional() throws {
        let t = try built(draft(method: .shares, values: ["a": "1.5", "b": "1", "c": "1"]))
        #expect(total(t) == 10000)
        #expect(t.splits.first?.shareMinor == 4286)
    }

    @Test("equal shares on 100.00 three ways sums exactly")
    func sharesEqual() throws {
        #expect(total(try built(draft(method: .shares, values: ["a": "1", "b": "1", "c": "1"]))) == 10000)
    }

    @Test("drops participants with 0 shares")
    func sharesDropsZero() throws {
        #expect(try built(draft(method: .shares, values: ["a": "1", "b": "0", "c": "3"])).splits.map(\.userId) == ["a", "c"])
    }

    @Test("rejects all-zero shares")
    func sharesAllZero() { expectError(draft(method: .shares, values: ["a": "0", "b": "0", "c": "0"]), "more than 0 shares") }

    @Test("rejects negative, invalid or missing shares")
    func sharesInvalid() {
        expectError(draft(method: .shares, values: ["a": "1", "b": "-1", "c": "1"]), "Bob")
        expectError(draft(method: .shares, values: ["a": "1", "b": "two", "c": "1"]), "Bob")
        expectError(draft(method: .shares, values: ["a": "1", "b": "1"]), "shares for Cara")
        expectError(draft(method: .shares, values: ["a": "1", "b": "1.0000001", "c": "1"]), "decimal places")
    }

    @Test("errors when a tiny share rounds to zero")
    func sharesTiny() {
        expectError(draft(amount: "0.05", method: .shares, values: ["a": "100", "b": "1", "c": "0"]), "Bob would owe nothing")
    }

    @Test("requires a title")
    func title() {
        expectError(draft(title: ""), "name")
        expectError(draft(title: "   "), "name")
    }

    @Test("rejects amount", arguments: ["", "0", "0.00", "abc", "-5", "1.234", "1e3"])
    func rejectsAmount(_ amount: String) { expectError(draft(amount: amount), "amount|decimal") }

    @Test("requires at least 2 people involved")
    func twoPeople() {
        expectError(draft(participants: ["a"]), "only yourself")
        expectError(draft(participants: ["a", "a"]), "only yourself")
    }

    @Test("requires at least one participant")
    func oneParticipant() { expectError(draft(participants: []), "at least one person") }

    @Test("requires a payer")
    func payer() { expectError(draft(payer: ""), "who paid") }

    @Test("uses user ids in messages when nameOf is omitted")
    func idsInMessages() {
        guard case let .failure(error) = NewSplitLogic.build(draft(method: .exact, values: ["a": "50", "b": "50"])) else {
            Issue.record("expected failure")
            return
        }
        #expect(error.message.contains("for c,"))
    }

    @Test("previews equal shares")
    func previewEqual() { #expect(NewSplitLogic.preview(draft()) == ["a": 3334, "b": 3333, "c": 3333]) }

    @Test("previews even without a title")
    func previewNoTitle() { #expect(NewSplitLogic.preview(draft(title: "", participants: ["a", "b"])) == ["a": 5000, "b": 5000]) }

    @Test("previews percentage and shares, omitting zero-weight people")
    func previewWeights() {
        #expect(NewSplitLogic.preview(draft(method: .percentage, values: ["a": "70", "b": "30", "c": "0"])) == ["a": 7000, "b": 3000])
        #expect(NewSplitLogic.preview(draft(method: .shares, values: ["a": "3", "b": "1", "c": "0"])) == ["a": 7500, "b": 2500])
    }

    @Test("returns {} for partial or invalid input")
    func previewInvalid() {
        for d in [
            draft(amount: ""), draft(amount: "abc"), draft(participants: []), draft(method: .exact, values: ["a": "50"]),
            draft(method: .exact, values: ["a": "50", "b": "20", "c": "20"]),
            draft(method: .percentage, values: ["a": "50", "b": "20", "c": "20"]),
            draft(method: .shares, values: ["a": "1", "b": "x", "c": "1"]), draft(amount: "0.02"),
        ] {
            #expect(NewSplitLogic.preview(d).isEmpty)
        }
    }

    @Test("returns null for equal and shares")
    func remainingNil() {
        #expect(NewSplitLogic.remaining(draft()) == nil)
        #expect(NewSplitLogic.remaining(draft(method: .shares, values: ["a": "1"])) == nil)
    }

    @Test("exact: total minus entered, ignoring invalid entries")
    func remainingExact() {
        #expect(NewSplitLogic.remaining(draft(method: .exact, values: ["a": "40", "b": "10.50"])) == .amount(minor: 4950))
        #expect(NewSplitLogic.remaining(draft(method: .exact, values: ["a": "40", "b": "abc"])) == .amount(minor: 6000))
        #expect(NewSplitLogic.remaining(draft(method: .exact, values: ["a": "60", "b": "50"])) == .amount(minor: -1000))
        #expect(NewSplitLogic.remaining(draft(method: .exact, values: ["a": "50", "b": "50"])) == .amount(minor: 0))
    }

    @Test("exact: ignores values for non-participants and handles missing total")
    func remainingExactOutsiders() {
        #expect(NewSplitLogic.remaining(draft(method: .exact, values: ["a": "40", "z": "60"])) == .amount(minor: 6000))
        #expect(NewSplitLogic.remaining(draft(amount: "", method: .exact, values: ["a": "10"])) == .amount(minor: -1000))
    }

    @Test("percentage: 100 minus sum without float noise")
    func remainingPercent() {
        let scale = Splits.weightScale
        #expect(NewSplitLogic.remaining(draft(method: .percentage, values: ["a": "50", "b": "25"])) == .percent(scaled: 25 * scale))
        #expect(NewSplitLogic.remaining(draft(method: .percentage, values: ["a": "33.33", "b": "33.33", "c": "33.33"]))
            == .percent(scaled: 10_000))
        #expect(NewSplitLogic.remaining(draft(method: .percentage, values: ["a": "70", "b": "40"])) == .percent(scaled: -10 * scale))
        #expect(NewSplitLogic.remaining(draft(method: .percentage, values: [:])) == .percent(scaled: 100 * scale))
    }

    @Test("formatRemaining copy (NewSplitModal.tsx)")
    func formatRemaining() {
        #expect(NewSplitLogic.formatRemaining(.amount(minor: 0)) == "All of the amount is assigned")
        #expect(NewSplitLogic.formatRemaining(.amount(minor: 4950)) == "AED 49.50 left to assign")
        #expect(NewSplitLogic.formatRemaining(.amount(minor: -1000)) == "AED 10.00 over")
        #expect(NewSplitLogic.formatRemaining(.percent(scaled: 0)) == "Adds up to 100%")
        #expect(NewSplitLogic.formatRemaining(.percent(scaled: 10_000)) == "0.01% left to assign")
        #expect(NewSplitLogic.formatRemaining(.percent(scaled: -10_000_000)) == "10% over")
        #expect(NewSplitLogic.formatRemaining(.percent(scaled: 12_345_000)) == "12.35% left to assign")
    }
}
