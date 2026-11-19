import Foundation

// Port of web/src/components/recurring/recurringPeriod.ts: guards "Post Split Now" against posting
// the same bill twice in one billing period (local time, ISO weeks Monday–Sunday).

public enum RecurringPeriod {
    public static let weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    private static func isoWeek(_ date: Date, _ calendar: Calendar) -> (year: Int, week: Int) {
        var iso = Calendar(identifier: .iso8601)
        iso.timeZone = calendar.timeZone
        return (iso.component(.yearForWeekOfYear, from: date), iso.component(.weekOfYear, from: date))
    }

    private static func pad2(_ value: Int) -> String { value < 10 ? "0\(value)" : "\(value)" }

    /// `getPeriodKey`: "2026-W46", "2026", "2026-11".
    public static func periodKey(_ date: Date, _ frequency: RecurringFrequency, calendar: Calendar = .current) -> String {
        switch frequency {
        case .weekly:
            let (year, week) = isoWeek(date, calendar)
            return "\(year)-W\(pad2(week))"
        case .yearly:
            return "\(calendar.component(.year, from: date))"
        case .monthly:
            return "\(calendar.component(.year, from: date))-\(pad2(calendar.component(.month, from: date)))"
        }
    }

    /// True when the bill was already posted in the period containing `now`.
    public static func isPostedInCurrentPeriod(_ bill: RecurringBill, now: Date, calendar: Calendar = .current) -> Bool {
        guard let last = bill.lastPostedAt else { return false }
        return periodKey(last, bill.frequency, calendar: calendar) == periodKey(now, bill.frequency, calendar: calendar)
    }

    /// "week 46 of 2026", "2026", "November 2026".
    public static func describePeriod(_ date: Date, _ frequency: RecurringFrequency, calendar: Calendar = .current) -> String {
        switch frequency {
        case .weekly:
            let (year, week) = isoWeek(date, calendar)
            return "week \(week) of \(year)"
        case .yearly: return "\(calendar.component(.year, from: date))"
        case .monthly: return PaydFormat.monthYear(date, timeZone: calendar.timeZone)
        }
    }

    /// 1–7 (Mon–Sun) for weekly, 1–31 otherwise.
    public static func dueDayRange(_ frequency: RecurringFrequency) -> ClosedRange<Int> {
        frequency == .weekly ? 1...7 : 1...31
    }

    public static func clampDueDay(_ day: Int, _ frequency: RecurringFrequency) -> Int {
        let range = dueDayRange(frequency)
        return min(range.upperBound, max(range.lowerBound, day))
    }

    /// "Every Monday", "Due on the 1st", "Yearly on the 15th".
    public static func formatDueDay(_ day: Int, _ frequency: RecurringFrequency) -> String {
        if frequency == .weekly { return "Every \(weekdayNames[clampDueDay(day, .weekly) - 1])" }
        let n = clampDueDay(day, frequency)
        let suffix = (11...13).contains(n % 100) ? "th" : n % 10 == 1 ? "st" : n % 10 == 2 ? "nd" : n % 10 == 3 ? "rd" : "th"
        return frequency == .yearly ? "Yearly on the \(n)\(suffix)" : "Due on the \(n)\(suffix)"
    }
}
