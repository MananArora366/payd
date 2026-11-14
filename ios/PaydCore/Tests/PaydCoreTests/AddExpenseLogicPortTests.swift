import Foundation
import Testing
@testable import PaydCore

/// Port of web/src/components/modals/addExpenseLogic.test.ts (+ AddExpenseModal helpers).
struct AddExpenseLogicPortTests {
    private func item(_ name: String, _ amount: String, _ assigned: [String] = []) -> FormItem {
        FormItem(id: name, name: name, amountText: amount, assignedUserIds: assigned)
    }

    private func input(_ total: Int, _ method: ExpenseSplitMethod, _ participants: [String], type: TransactionType = .expense,
                       exact: [String: String] = [:], items: [FormItem] = [],
                       nameOf: @escaping @Sendable (String) -> String = { $0 }) -> SplitInput {
        SplitInput(type: type, totalMinor: total, payerId: "a", splitMethod: method, participantIds: participants,
                   exactAmounts: exact, items: items, nameOf: nameOf)
    }

    private func byUser(_ result: Result<[ShareAllocation], ParseError>) -> [String: Int]? {
        guard case let .success(splits) = result else { return nil }
        return Dictionary(uniqueKeysWithValues: splits.map { ($0.userId, $0.shareMinor) })
    }

    @Test("accepts plain and grouped amounts")
    func accepts() {
        #expect(AddExpenseLogic.parseAmountInput("42.5") == .success(4250))
        #expect(AddExpenseLogic.parseAmountInput("1,250.50") == .success(125050))
        #expect(AddExpenseLogic.parseAmountInput(".5") == .success(50))
        #expect(AddExpenseLogic.parseAmountInput(" 10 ") == .success(1000))
    }

    @Test("rejects", arguments: ["", "0", "0.00", "1e3", "1.2.3", "-5", "abc", "12,34", "1.234", ".", "1e21"])
    func rejects(_ text: String) {
        guard case let .failure(error) = AddExpenseLogic.parseAmountInput(text) else {
            Issue.record("\(text) should be rejected")
            return
        }
        #expect(error.message.range(of: "invariant|minor units", options: [.regularExpression, .caseInsensitive]) == nil)
    }

    @Test("rejects absurdly large amounts")
    func tooLarge() {
        #expect((try? AddExpenseLogic.parseAmountInput("99999999999999").get()) == nil)
        #expect(AddExpenseLogic.parseAmountInput("2000000000") == .failure(ParseError("That amount is too large.")))
    }

    @Test("messages are verbatim")
    func messages() {
        #expect(AddExpenseLogic.parseAmountInput("") == .failure(ParseError("Please enter an amount.")))
        #expect(AddExpenseLogic.parseAmountInput("abc") == .failure(ParseError("\"abc\" isn't a valid amount. Use numbers like 42.50.")))
        #expect(AddExpenseLogic.parseAmountInput("1.234") == .failure(ParseError("Use at most 2 decimal places for the amount (fils).")))
        #expect(AddExpenseLogic.parseAmountInput("0") == .failure(ParseError("Please enter an amount greater than 0.")))
    }

    @Test("splits equally to the fils")
    func equal() throws {
        let splits = try AddExpenseLogic.computeSplits(input(1000, .equal, ["a", "b", "c"])).get()
        #expect(splits.reduce(0) { $0 + $1.shareMinor } == 1000)
    }

    @Test("blocks splits where someone would owe 0 (0.01 between 3)")
    func tooSmall() {
        #expect(AddExpenseLogic.computeSplits(input(1, .equal, ["a", "b", "c"]))
            == .failure(ParseError("AED 0.01 is too small to split between 3 people. Someone would owe nothing.")))
    }

    @Test("gives a friendly message when exact amounts do not add up")
    func exactShort() {
        #expect(AddExpenseLogic.computeSplits(input(1000, .exact, ["a", "b"], exact: ["a": "4", "b": "5"]))
            == .failure(ParseError("Per-person amounts add up to AED 9.00, but the total is AED 10.00 (short by AED 1.00).")))
    }

    @Test("itemized: total above the item subtotal is shared proportionally")
    func itemizedProportional() {
        let result = AddExpenseLogic.computeSplits(input(3750, .itemized, ["a", "b"],
                                                         items: [item("Burger", "20", ["a"]), item("Fries", "10", ["b"])]))
        #expect(byUser(result) == ["a": 2500, "b": 1250])
    }

    @Test("itemized: ignores claims by non-participants instead of losing money")
    func itemizedIgnoresOutsiders() {
        let result = AddExpenseLogic.computeSplits(input(3000, .itemized, ["a", "b"],
                                                         items: [item("Burger", "20", ["a", "zed"]), item("Fries", "10")]))
        #expect(byUser(result) == ["a": 2500, "b": 500])
    }

    @Test("itemized: blocks when a participant claimed nothing")
    func itemizedBlocks() {
        let result = AddExpenseLogic.computeSplits(input(2000, .itemized, ["a", "b"], items: [item("Burger", "20", ["a"])],
                                                         nameOf: { $0.uppercased() }))
        guard case let .failure(error) = result else {
            Issue.record("expected failure")
            return
        }
        #expect(error.message.hasPrefix("B would owe nothing"))
    }

    @Test("income goes entirely to the payer")
    func income() {
        #expect(AddExpenseLogic.computeSplits(input(500, .equal, ["a", "b"], type: .income))
            == .success([ShareAllocation(userId: "a", shareMinor: 500)]))
    }

    @Test("drops removed users and reports items left without a claimant")
    func prune() {
        let items = [item("Burger", "20", ["a", "b"]), item("Shake", "5", ["b"]), item("Fries", "10")]
        let (next, orphaned) = AddExpenseLogic.pruneClaims(items, participantIds: ["a"])
        #expect(next.map(\.assignedUserIds) == [["a"], [], []])
        #expect(orphaned == ["Shake"])
        #expect(next[2] == items[2])
    }

    @Test("sums item subtotal ignoring invalid prices")
    func subtotal() {
        #expect(AddExpenseLogic.itemsSubtotalMinor([item("x", "1.50"), item("y", "abc"), item("z", "")]) == 150)
    }

    @Test("hides ledger jargon")
    func jargon() {
        let message = LedgerInvariantError("Split sum 3 does not match").message
        #expect(!AddExpenseLogic.friendlyError(message).lowercased().contains("invariant"))
        #expect(AddExpenseLogic.friendlyError("") == "Failed to save transaction.")
        #expect(AddExpenseLogic.friendlyError("Ledger Invariant Violation: Cannot split with zero participants")
            == "Pick at least one person to split with.")
    }

    @Test("findCategoryId: exact, partial, then keyword synonyms")
    func findCategory() {
        let categories = SeedData.categories(now: PaydJSON.epoch)
        #expect(AddExpenseLogic.findCategoryId(categories, hint: "Transportation") == SeedIDs.transportation)
        #expect(AddExpenseLogic.findCategoryId(categories, hint: "food") == SeedIDs.food)
        #expect(AddExpenseLogic.findCategoryId(categories, hint: "ride") == SeedIDs.transportation)
        #expect(AddExpenseLogic.findCategoryId(categories, hint: "Quik") == SeedIDs.groceries)
        #expect(AddExpenseLogic.findCategoryId(categories, hint: "box") == SeedIDs.other)
        #expect(AddExpenseLogic.findCategoryId(categories, hint: nil) == nil)
        #expect(AddExpenseLogic.findCategoryId(categories, hint: "zzz") == nil)
    }

    @Test("keystroke filters")
    func keystrokes() {
        #expect(AddExpenseLogic.isMoneyKeystroke("1,250.5"))
        #expect(!AddExpenseLogic.isMoneyKeystroke("1e3"))
        #expect(!AddExpenseLogic.isMoneyKeystroke("-5"))
        #expect(AddExpenseLogic.isNumberKeystroke("33.3"))
        #expect(!AddExpenseLogic.isNumberKeystroke("1,2"))
        #expect(AddExpenseLogic.isNumberKeystroke(""))
    }
}
