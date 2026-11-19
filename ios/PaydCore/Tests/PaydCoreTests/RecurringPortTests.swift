import Foundation
import Testing
@testable import PaydCore

/// Port of web/src/lib/ledger/__tests__/recurring.test.ts (feature suite + per-period guard).
struct RecurringPortTests {
    private let manan = SeedIDs.manan, rahul = SeedIDs.prakarsh, sarah = SeedIDs.veer

    @Test("Feature 1: Tap-to-Claim handles fractional shared dishes with zero remainder loss")
    func tapToClaim() throws {
        let items = [ReceiptItem(name: "Truffle Fries", priceMinor: 4500), ReceiptItem(name: "Wagyu Slider", priceMinor: 7500),
                     ReceiptItem(name: "Mocktails", priceMinor: 3000)]
        let shares = try ItemizedShares.calculate(totalMinor: 15000, lineItems: items,
                                                  assignments: [0: [manan, rahul], 1: [rahul], 2: [manan, sarah]],
                                                  participantIds: [manan, rahul, sarah])
        #expect(shares.sum == 15000)
        #expect(shares == [manan: 3750, rahul: 9750, sarah: 1500])
    }

    @Test("Feature 6: Recurring Subscriptions preserves zero-sum split invariants")
    func recurringZeroSum() throws {
        let shares = try Splits.equal(38900, among: [manan, rahul, sarah])
        #expect(shares.sum == 38900)
        #expect(shares.values.sorted(by: >) == [12967, 12967, 12966])
    }

    @Test("Feature 4: Fair Payer Roulette calculates fair equal share allocation when triggered")
    func roulette() throws {
        #expect(try Splits.equal(4500, among: [manan, rahul, sarah]) == [manan: 1500, rahul: 1500, sarah: 1500])
    }

    // MARK: per-period guard (local time)

    private func at(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12) -> Date {
        Calendar.current.date(from: DateComponents(year: y, month: m, day: d, hour: h)) ?? PaydJSON.epoch
    }

    private func bill(_ frequency: RecurringFrequency, _ lastPosted: Date?) -> RecurringBill {
        RecurringBill(id: "r", title: "Bill", amountMinor: 100, payerId: manan, frequency: frequency, dueDay: 1,
                      lastPostedAt: lastPosted, splits: [], createdAt: PaydJSON.epoch)
    }

    @Test("never-posted bills are not blocked")
    func neverPosted() {
        #expect(!RecurringPeriod.isPostedInCurrentPeriod(bill(.monthly, nil), now: at(2026, 11, 14)))
    }

    @Test("monthly: same calendar month is blocked, next month is not")
    func monthly() {
        let b = bill(.monthly, at(2026, 11, 1))
        #expect(RecurringPeriod.isPostedInCurrentPeriod(b, now: at(2026, 11, 30)))
        #expect(!RecurringPeriod.isPostedInCurrentPeriod(b, now: at(2026, 12, 1)))
        #expect(!RecurringPeriod.isPostedInCurrentPeriod(b, now: at(2027, 11, 5)))
    }

    @Test("weekly: same ISO week (Mon-Sun) is blocked, next week is not")
    func weekly() {
        let b = bill(.weekly, at(2026, 11, 9))
        #expect(RecurringPeriod.isPostedInCurrentPeriod(b, now: at(2026, 11, 15)))
        #expect(!RecurringPeriod.isPostedInCurrentPeriod(b, now: at(2026, 11, 16)))
    }

    @Test("weekly keys handle the ISO year boundary")
    func isoYearBoundary() {
        #expect(RecurringPeriod.periodKey(at(2026, 12, 31), .weekly) == RecurringPeriod.periodKey(at(2027, 1, 1), .weekly))
        #expect(RecurringPeriod.periodKey(at(2026, 12, 31), .weekly) == "2026-W53")
    }

    @Test("yearly: same year is blocked")
    func yearly() {
        let b = bill(.yearly, at(2026, 1, 2))
        #expect(RecurringPeriod.isPostedInCurrentPeriod(b, now: at(2026, 12, 31)))
        #expect(!RecurringPeriod.isPostedInCurrentPeriod(b, now: at(2027, 1, 1)))
    }

    @Test("ignores malformed timestamps")
    func malformed() throws {
        let json = """
        {"id":"r","title":"Bill","amount_minor":100,"currency":"AED","category_id":null,"payer_id":"u","group_id":null,
         "frequency":"monthly","due_day":1,"notes":null,"auto_post":false,"last_posted_at":"not-a-date","splits":[],
         "created_at":"2026-01-01T00:00:00.000Z"}
        """
        let decoded = try PaydJSON.decoder.decode(RecurringBill.self, from: Data(json.utf8))
        #expect(!RecurringPeriod.isPostedInCurrentPeriod(decoded, now: Date()))
    }

    @Test("due day is clamped to 1-7 for weekly and 1-31 otherwise")
    func dueDay() {
        #expect(RecurringPeriod.clampDueDay(15, .weekly) == 7)
        #expect(RecurringPeriod.clampDueDay(0, .monthly) == 1)
        #expect(RecurringPeriod.clampDueDay(45, .monthly) == 31)
        #expect(RecurringPeriod.formatDueDay(1, .weekly) == "Every Monday")
        #expect(RecurringPeriod.formatDueDay(2, .monthly) == "Due on the 2nd")
        #expect(RecurringPeriod.formatDueDay(11, .monthly) == "Due on the 11th")
        #expect(RecurringPeriod.formatDueDay(15, .yearly) == "Yearly on the 15th")
        #expect(RecurringPeriod.formatDueDay(23, .monthly) == "Due on the 23rd")
    }

    @Test("describes periods like the web")
    func describe() {
        #expect(RecurringPeriod.describePeriod(at(2026, 11, 14), .weekly) == "week 46 of 2026")
        #expect(RecurringPeriod.describePeriod(at(2026, 11, 14), .yearly) == "2026")
        #expect(RecurringPeriod.describePeriod(at(2026, 11, 14), .monthly) == "November 2026")
        #expect(RecurringPeriod.periodKey(at(2026, 11, 14), .monthly) == "2026-11")
    }
}
