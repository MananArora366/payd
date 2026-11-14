import Foundation

/// Shared JSON coders for the web's `payd_state_v3` blob and API bodies.
/// Keys come from each type's explicit `CodingKeys` (the top-level blob is camelCase, records
/// are snake_case), dates are ISO-8601 UTC with milliseconds exactly like JS `toISOString()`.
public enum PaydJSON {
    /// `userInfo` key carrying the `now` used for seed fallbacks while decoding a blob.
    public static let nowKey = CodingUserInfoKey(rawValue: "com.payd.PaydCore.now")!

    public static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(isoString(date))
        }
        return encoder
    }

    public static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            if let text = try? container.decode(String.self) {
                return parseDate(text) ?? epoch
            }
            if let millis = try? container.decode(Double.self), millis.isFinite {
                return Date(timeIntervalSince1970: millis / 1000)
            }
            // `new Date(garbage)` is NaN, which the web sorts as 0.
            return epoch
        }
        return decoder
    }

    /// The date an unparseable timestamp decodes to (the web treats NaN dates as 0).
    public static let epoch = Date(timeIntervalSince1970: 0)

    /// JS `Date#getTime()`: whole milliseconds since 1970.
    public static func epochMillis(_ date: Date) -> Int {
        Int((date.timeIntervalSince1970 * 1000).rounded())
    }

    /// The date for whole milliseconds since 1970.
    public static func date(epochMillis: Int) -> Date {
        Date(timeIntervalSince1970: Double(epochMillis) / 1000)
    }

    /// JS `toISOString()`: `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'`.
    public static func isoString(_ date: Date) -> String {
        let millis = epochMillis(date)
        let seconds = PaydMath.floorDiv(millis, 1000)
        let parts = utcCalendar.dateComponents([.year, .month, .day, .hour, .minute, .second],
                                               from: Date(timeIntervalSince1970: Double(seconds)))
        func pad(_ value: Int?, _ width: Int) -> String {
            let text = String(value ?? 0)
            return String(repeating: "0", count: max(0, width - text.count)) + text
        }
        return "\(pad(parts.year, 4))-\(pad(parts.month, 2))-\(pad(parts.day, 2))T"
            + "\(pad(parts.hour, 2)):\(pad(parts.minute, 2)):\(pad(parts.second, 2)).\(pad(millis - seconds * 1000, 3))Z"
    }

    private static let isoPattern = JSRegex(
        "^(\\d{4})-(\\d{2})-(\\d{2})(?:T(\\d{2}):(\\d{2})(?::(\\d{2})(?:\\.(\\d+))?)?(Z|[+-]\\d{2}:?\\d{2})?)?$", "i")

    /// `Date.parse` for ISO-8601 strings: with or without fractional seconds, `Z` or any offset;
    /// date-only strings are UTC and date-times without an offset are local time (JS rules).
    /// Returns nil where JS gives NaN.
    public static func parseDate(_ text: String) -> Date? {
        guard let match = isoPattern.firstMatch(text.jsTrimmed),
              let year = match[1].flatMap(Int.init), let month = match[2].flatMap(Int.init),
              let day = match[3].flatMap(Int.init) else { return nil }
        let hasTime = match[4] != nil
        let hour = match[4].flatMap(Int.init) ?? 0
        let minute = match[5].flatMap(Int.init) ?? 0
        let second = match[6].flatMap(Int.init) ?? 0
        let millis = match[7].map { Int(String(($0 + "00").prefix(3))) ?? 0 } ?? 0
        guard (1...12).contains(month), (1...31).contains(day), hour <= 24, minute <= 59, second <= 59 else { return nil }
        if hour == 24 && (minute > 0 || second > 0 || millis > 0) { return nil }

        var timeZone: TimeZone = hasTime ? .current : utc
        var isLocal = hasTime
        if let zone = match[8], zone.uppercased() != "Z" {
            let digits = zone.dropFirst().filter(\.isNumber)
            guard digits.count == 4, let hh = Int(digits.prefix(2)), let mm = Int(digits.suffix(2)),
                  hh <= 23, mm <= 59 else { return nil }
            let offset = (hh * 3600 + mm * 60) * (zone.hasPrefix("-") ? -1 : 1)
            guard let fixed = TimeZone(secondsFromGMT: offset) else { return nil }
            timeZone = fixed
            isLocal = false
        } else if match[8] != nil {
            timeZone = utc
            isLocal = false
        }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        // Validate the calendar date (JS rejects 2026-02-31).
        let midnight = DateComponents(calendar: calendar, timeZone: timeZone, year: year, month: month, day: day)
        guard let dayStart = calendar.date(from: midnight),
              calendar.component(.day, from: dayStart) == day,
              calendar.component(.month, from: dayStart) == month else { return nil }
        let seconds = Double(hour * 3600 + minute * 60 + second) + Double(millis) / 1000
        if isLocal {
            let local = DateComponents(calendar: calendar, timeZone: timeZone, year: year, month: month, day: day,
                                       hour: hour == 24 ? 0 : hour, minute: minute, second: second)
            guard let base = calendar.date(from: local) else { return nil }
            let rolled = hour == 24 ? calendar.date(byAdding: .day, value: 1, to: base) ?? base : base
            return rolled.addingTimeInterval(Double(millis) / 1000)
        }
        return dayStart.addingTimeInterval(seconds)
    }

    static let utc = TimeZone(identifier: "UTC") ?? TimeZone(secondsFromGMT: 0) ?? .current

    static var utcCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        return calendar
    }
}

extension Date {
    /// The same instant truncated to whole milliseconds (JS `Date` precision).
    var truncatedToMilliseconds: Date {
        PaydJSON.date(epochMillis: Int((timeIntervalSince1970 * 1000).rounded(.down)))
    }
}

extension KeyedEncodingContainer {
    /// Writes `null` for nil (the web stores `null` and compares with `=== null`).
    mutating func encodeNullable<T: Encodable>(_ value: T?, forKey key: Key) throws {
        if let value { try encode(value, forKey: key) } else { try encodeNil(forKey: key) }
    }
}

extension KeyedDecodingContainer {
    /// Optional timestamp: missing, `null` or `""` (falsy in JS) → nil; garbage → epoch.
    func decodeOptionalDate(forKey key: Key) throws -> Date? {
        if let text = try? decodeIfPresent(String.self, forKey: key) {
            return text.isEmpty ? nil : (PaydJSON.parseDate(text) ?? PaydJSON.epoch)
        }
        return try decodeIfPresent(Date.self, forKey: key)
    }
}
