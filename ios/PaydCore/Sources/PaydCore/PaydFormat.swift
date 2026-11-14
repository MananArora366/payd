import Foundation

/// Display helpers copied from the web components (fixed `en_US_POSIX`, current time zone by default).
public enum PaydFormat {
    private static func format(_ date: Date, _ pattern: String, _ timeZone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = pattern
        return formatter.string(from: date)
    }

    /// `toLocaleDateString('en-US', { month: 'short', day: 'numeric' })` → "Nov 14".
    public static func shortDate(_ d: Date, timeZone: TimeZone = .current) -> String { format(d, "MMM d", timeZone) }

    /// Drawer date: "Nov 14, 2026, 09:05 AM".
    public static func longDateTime(_ d: Date, timeZone: TimeZone = .current) -> String {
        format(d, "MMM d, yyyy, hh:mm a", timeZone)
    }

    /// `{ month: 'long' }` → "November".
    public static func monthName(_ d: Date, timeZone: TimeZone = .current) -> String { format(d, "MMMM", timeZone) }

    /// `{ month: 'long', year: 'numeric' }` → "November 2026".
    public static func monthYear(_ d: Date, timeZone: TimeZone = .current) -> String { format(d, "MMMM yyyy", timeZone) }

    /// `toLocaleDateString('en-AE')` → "14/11/2026".
    public static func aeDate(_ d: Date, timeZone: TimeZone = .current) -> String { format(d, "dd/MM/yyyy", timeZone) }

    /// `toLocaleDateString()` (en-US default) → "11/14/2026".
    public static func defaultDate(_ d: Date, timeZone: TimeZone = .current) -> String { format(d, "M/d/yyyy", timeZone) }

    /// `new Date().toISOString().split('T')[0]` (UTC day).
    public static func isoDay(_ d: Date) -> String { String(PaydJSON.isoString(d).prefix(10)) }

    /// `${n} ${n === 1 ? one : many}` (HomeView.tsx:20).
    public static func plural(_ n: Int, _ one: String, _ many: String) -> String { "\(n) \(n == 1 ? one : many)" }

    /// `name.split(' ').map(n => n[0]).join('').slice(0, 2)` (Navbar, SettleUpCard; not uppercased).
    public static func initialsNavbar(_ name: String) -> String {
        String(name.jsSpaceSplit.map { $0.first.map(String.init) ?? "" }.joined().prefix(2))
    }

    /// NewSplitModal.tsx:40-45 `initialsOf`.
    public static func initialsFirstLast(_ name: String) -> String {
        let parts = name.jsTrimmed.split(whereSeparator: { jsWhitespace.contains($0) }).map(String.init)
        guard let first = parts.first, let last = parts.last else { return "?" }
        if parts.count == 1 { return String(first.prefix(2)).uppercased() }
        return (String(first.prefix(1)) + String(last.prefix(1))).uppercased()
    }

    /// `name.slice(0, 1)`.
    public static func firstLetter(_ name: String) -> String { String(name.prefix(1)) }

    /// `name.split(' ')[0]`.
    public static func firstName(_ name: String) -> String { name.jsSpaceSplit.first ?? "" }

    /// HomeView.tsx:80-90 `getCategoryEmoji`.
    public static func categoryEmojiHome(_ categoryName: String?) -> String {
        let lower = (categoryName ?? "").lowercased()
        let has = { (words: [String]) in words.contains { lower.contains($0) } }
        if has(["food", "dining", "restaurant"]) { return "🍣" }
        if has(["grocer"]) { return "🛒" }
        if has(["utility", "bill", "electricity", "wifi"]) { return "⚡" }
        if has(["transport", "careem", "taxi"]) { return "🚗" }
        if has(["coffee"]) { return "☕" }
        if has(["travel", "flight"]) { return "✈️" }
        if has(["entertainment", "movie"]) { return "🎬" }
        return "💳"
    }

    /// TransactionsView.tsx:52-62 `getCategoryEmoji` (shorter keyword lists than Home).
    public static func categoryEmojiActivity(_ categoryName: String?) -> String {
        let lower = (categoryName ?? "").lowercased()
        let has = { (words: [String]) in words.contains { lower.contains($0) } }
        if has(["food", "dining"]) { return "🍣" }
        if has(["grocer"]) { return "🛒" }
        if has(["utility", "bill", "wifi"]) { return "⚡" }
        if has(["transport", "careem"]) { return "🚗" }
        if has(["coffee"]) { return "☕" }
        if has(["travel"]) { return "✈️" }
        if has(["entertainment"]) { return "🎬" }
        return "💳"
    }

    /// lib/icons.tsx `getGroupEmoji`.
    public static func groupEmoji(_ groupName: String) -> String {
        let lower = groupName.lowercased()
        let has = { (words: [String]) in words.contains { lower.contains($0) } }
        if has(["flat", "apartment", "villa", "home", "house", "rent", "roommate"]) { return "🏙️" }
        if has(["supper", "food", "dinner", "lunch", "brunch", "coffee"]) { return "🍷" }
        if has(["camp", "hatta", "road", "desert"]) { return "🏕️" }
        if has(["trip", "holiday", "vacation", "beach", "travel"]) { return "🌴" }
        if has(["office", "work", "team"]) { return "💼" }
        if has(["dubai", "abu dhabi", "sharjah"]) { return "🌆" }
        return "👥"
    }

    /// `t.charAt(0).toUpperCase() + t.slice(1)`.
    public static func titleCaseFirst(_ s: String) -> String { s.jsCapitalizedFirst }
}
