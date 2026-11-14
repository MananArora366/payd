import Foundation

// Port of web/src/lib/ledger/currency.ts.
// Invariant 1: integer minor units. Parsing is string-based and overflow-safe; no floats.

public struct CurrencyConfig: Sendable, Hashable {
    public let code: String
    public let symbol: String
    public let name: String
    public let decimals: Int
}

/// A user-facing parse failure; `message` is the web's exact text.
public struct ParseError: Error, Sendable, Equatable {
    public let message: String

    public init(_ message: String) {
        self.message = message
    }
}

public enum Currency {
    public static let defaultCode = "AED"
    /// `LEDGER_CURRENCY` (addExpenseLogic.ts, profileForm.ts): the ledger is AED-only.
    public static let ledgerCode = "AED"
    /// `MAX_MAJOR_AMOUNT` (1e12 major units).
    public static let maxMajorAmount = 1_000_000_000_000

    public static let supported: [String: CurrencyConfig] = [
        "AED": CurrencyConfig(code: "AED", symbol: "AED", name: "UAE Dirham", decimals: 2),
        "USD": CurrencyConfig(code: "USD", symbol: "$", name: "US Dollar", decimals: 2),
        "EUR": CurrencyConfig(code: "EUR", symbol: "€", name: "Euro", decimals: 2),
        "GBP": CurrencyConfig(code: "GBP", symbol: "£", name: "British Pound", decimals: 2),
        "INR": CurrencyConfig(code: "INR", symbol: "₹", name: "Indian Rupee", decimals: 2),
        "SAR": CurrencyConfig(code: "SAR", symbol: "﷼", name: "Saudi Riyal", decimals: 2),
        "CAD": CurrencyConfig(code: "CAD", symbol: "CA$", name: "Canadian Dollar", decimals: 2),
        "AUD": CurrencyConfig(code: "AUD", symbol: "A$", name: "Australian Dollar", decimals: 2),
    ]

    public static func config(for code: String = defaultCode) -> CurrencyConfig {
        let upper = code.uppercased()
        return supported[upper] ?? CurrencyConfig(code: upper, symbol: upper, name: upper, decimals: 2)
    }

    public static func symbol(for code: String = defaultCode) -> String {
        config(for: code).symbol
    }

    /// `formatMinorUnits`: 10000 → "AED 100.00", -1 → "-AED 0.01", 5 USD → "$0.05". Never "-0".
    public static func format(_ amountMinor: Int, currency: String = defaultCode) -> String {
        let config = config(for: currency)
        let factor = UInt(PaydMath.pow10(config.decimals))
        let magnitude = amountMinor.magnitude
        let whole = groupThousands(magnitude / factor)
        let fraction = String(magnitude % factor)
        let body = config.decimals > 0
            ? "\(whole).\(String(repeating: "0", count: max(0, config.decimals - fraction.count)))\(fraction)"
            : whole
        let withSymbol = config.symbol.jsLength > 1 ? "\(config.symbol) \(body)" : "\(config.symbol)\(body)"
        return amountMinor < 0 ? "-\(withSymbol)" : withSymbol
    }

    private static let digitPattern = JSRegex("\\d")
    private static let exponentPattern = JSRegex("[eE]")
    private static let signPattern = JSRegex("[-+]")
    private static let commaPattern = JSRegex(",")
    private static let groupedOnlyPattern = JSRegex("^[\\d,.]+$")
    private static let amountPattern = JSRegex("^(\\d{1,3}(?:,\\d{3})+|\\d*)(?:\\.(\\d*))?$")

    /// `tryParseMajorToMinor` for strings (currency.ts:96-176), with the web's exact messages.
    public static func tryParseMajorToMinor(_ text: String, currency: String = defaultCode) -> Result<Int, ParseError> {
        let config = config(for: currency)
        let decimals = config.decimals
        let tooLarge = ParseError("That amount is too large. The maximum is \(config.code) 1,000,000,000,000.")

        var str = text.jsTrimmed
        if str.isEmpty { return .failure(ParseError("Please enter an amount.")) }

        var sign = ""
        if let first = str.first, first == "-" || first == "+" {
            sign = String(first)
            str = String(str.dropFirst()).jsTrimmedStart
        }
        let markers = [config.code, config.symbol].filter { !$0.isEmpty }.map(JSRegex.escape).joined(separator: "|")
        str = JSRegex("^(?:\(markers))\\s*", "i").replacing(in: str, global: false, with: "")
        if sign.isEmpty, let first = str.first, first == "-" || first == "+" {
            sign = String(first)
            str = String(str.dropFirst())
        }
        str = JSRegex("\\s*(?:\(markers))$", "i").replacing(in: str, global: false, with: "")

        if exponentPattern.test(str) && digitPattern.test(str) {
            return .failure(ParseError("Please enter a plain number like 12.50 (no scientific notation)."))
        }
        if str.filter({ $0 == "." }).count > 1 {
            return .failure(ParseError("An amount can only have one decimal point."))
        }
        if signPattern.test(str) {
            return .failure(ParseError("Please enter a valid amount (misplaced minus or plus sign)."))
        }

        let match = amountPattern.firstMatch(str)
        let wholeGroup = match?[1] ?? ""
        let fracGroup = match?[2]
        guard match != nil, !(wholeGroup.isEmpty && (fracGroup ?? "").isEmpty) else {
            if commaPattern.test(str) && groupedOnlyPattern.test(str) {
                return .failure(ParseError("Please check the thousands separators, e.g. 1,250.50."))
            }
            return .failure(ParseError("Please enter a valid amount using numbers only, e.g. 12.50."))
        }

        let withoutCommas = wholeGroup.replacingOccurrences(of: ",", with: "")
        let stripped = String(withoutCommas.drop(while: { $0 == "0" }))
        let wholeDigits = stripped.isEmpty ? "0" : stripped
        let fracDigits = Array(fracGroup ?? "")

        // Length guard before any numeric conversion (1e12 has 13 digits).
        if wholeDigits.count > String(maxMajorAmount).count { return .failure(tooLarge) }

        let kept = String(fracDigits.prefix(decimals)) + String(repeating: "0", count: max(0, decimals - fracDigits.count))
        let roundUp = fracDigits.count > decimals && fracDigits[decimals] >= "5"
        guard var magnitude = Int(wholeDigits + kept) else { return .failure(tooLarge) }
        if roundUp { magnitude += 1 }
        if magnitude > maxMajorAmount * PaydMath.pow10(decimals) { return .failure(tooLarge) }

        return .success(sign == "-" && magnitude != 0 ? -magnitude : magnitude)
    }

    /// `parseMajorToMinor`: the parsed value, or 0 for any invalid input (callers reject <= 0).
    public static func parseMajorToMinor(_ text: String, currency: String = defaultCode) -> Int {
        (try? tryParseMajorToMinor(text, currency: currency).get()) ?? 0
    }

    /// `(m / 100).toFixed(2)`: "1234.50", "-5.00", "0.00".
    public static func minorToMajorString(_ minor: Int) -> String {
        let magnitude = minor.magnitude
        let fraction = magnitude % 100
        return "\(minor < 0 ? "-" : "")\(magnitude / 100).\(fraction < 10 ? "0" : "")\(fraction)"
    }

    /// `(m / 100).toString()`: "5000", "5000.5", "0.05".
    public static func minorToMajorPlainString(_ minor: Int) -> String {
        PaydMath.jsNumberString(Decimal(minor) / 100)
    }

    /// `filsToAedString` (careemPayLink.ts:14-18).
    public static func filsToAedString(_ minor: Int) -> String {
        let magnitude = minor.magnitude
        let fraction = magnitude % 100
        return "\(minor < 0 ? "-" : "")\(magnitude / 100).\(fraction < 10 ? "0" : "")\(fraction)"
    }

    /// Keystroke fix for devices whose decimal key is ",": a single "," (with no ".") becomes ".",
    /// so "12,5" typed on a comma keypad means AED 12.50 instead of a thousands separator.
    public static func normalizeLocaleDecimalInput(_ text: String, decimalSeparator: String) -> String {
        guard decimalSeparator == ",", !text.contains("."), text.filter({ $0 == "," }).count == 1 else { return text }
        return text.replacingOccurrences(of: ",", with: ".")
    }

    private static func groupThousands(_ value: UInt) -> String {
        let digits = Array(String(value))
        var result = ""
        for (offset, digit) in digits.enumerated() {
            if offset > 0 && (digits.count - offset) % 3 == 0 { result.append(",") }
            result.append(digit)
        }
        return result
    }
}
