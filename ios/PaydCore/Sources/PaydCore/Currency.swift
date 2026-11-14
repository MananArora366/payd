import Foundation

// Port of web/src/lib/ledger/currency.ts.
// Invariant 1: integer minor units. Parsing is string-based so no float rounding can leak in.

public struct CurrencyConfig: Sendable, Hashable {
    public let code: String
    public let symbol: String
    public let name: String
    public let decimals: Int
}

public enum Currency {
    public static let defaultCode = "AED"

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

    /// Formats minor units for display, e.g. 10000 AED → "AED 100.00", 5 USD → "$0.05".
    public static func format(_ amountMinor: Int, currency: String = defaultCode) -> String {
        let config = config(for: currency)
        let factor = pow10(config.decimals)
        let absMinor = amountMinor.magnitude
        let whole = absMinor / UInt(factor)
        let frac = absMinor % UInt(factor)

        let fracText = String(frac).leftPadded(to: config.decimals)
        let amountText = config.decimals > 0 ? "\(groupThousands(whole)).\(fracText)" : groupThousands(whole)
        let sign = amountMinor < 0 ? "-" : ""
        let separator = config.symbol.count > 1 ? " " : ""
        return "\(sign)\(config.symbol)\(separator)\(amountText)"
    }

    /// Parses a major-unit string ("AED 1,250.75", "19.99", "-12.5") into minor units.
    /// Extra fraction digits are truncated; unparseable input returns 0 (matches the web).
    public static func parseMajorToMinor(_ text: String, currency: String = defaultCode) -> Int {
        let config = config(for: currency)
        let sanitized = text.filter { $0.isASCII && ($0.isNumber || $0 == "." || $0 == "-") }
        guard !sanitized.isEmpty, sanitized != "-", sanitized != "." else { return 0 }

        let isNegative = sanitized.hasPrefix("-")
        let unsigned = sanitized.replacingOccurrences(of: "-", with: "")
        let parts = unsigned.split(separator: ".", omittingEmptySubsequences: false)
        let wholeText = parts.first.map(String.init) ?? ""
        let rawFrac = parts.count > 1 ? String(parts[1]) : ""
        let fracText = String(rawFrac.prefix(config.decimals)).rightPadded(to: config.decimals)

        let whole = Int(wholeText) ?? 0
        let frac = Int(fracText) ?? 0
        let total = whole * pow10(config.decimals) + frac
        return isNegative ? -total : total
    }

    /// Parses a Double by first fixing it to the currency's decimals (19.99 → "19.99" → 1999).
    public static func parseMajorToMinor(_ value: Double, currency: String = defaultCode) -> Int {
        let decimals = config(for: currency).decimals
        return parseMajorToMinor(String(format: "%.\(decimals)f", value), currency: currency)
    }

    /// Converts minor units to a major Double. For display and text fields only, never for maths.
    public static func minorToMajor(_ amountMinor: Int, currency: String = defaultCode) -> Double {
        let decimals = config(for: currency).decimals
        return Double(amountMinor) / Double(pow10(decimals))
    }

    private static func pow10(_ exponent: Int) -> Int {
        (0..<exponent).reduce(1) { acc, _ in acc * 10 }
    }

    private static func groupThousands(_ value: UInt) -> String {
        let digits = Array(String(value))
        return digits.enumerated().reduce(into: "") { result, pair in
            let remaining = digits.count - pair.offset
            if pair.offset > 0 && remaining % 3 == 0 { result.append(",") }
            result.append(pair.element)
        }
    }
}

private extension String {
    func leftPadded(to length: Int) -> String {
        count >= length ? self : String(repeating: "0", count: length - count) + self
    }

    func rightPadded(to length: Int) -> String {
        count >= length ? self : self + String(repeating: "0", count: length - count)
    }
}
