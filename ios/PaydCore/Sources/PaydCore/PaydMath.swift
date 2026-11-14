import Foundation

/// Integer replacements for the web's float maths on money (`Math.round`, percentages) and
/// JS number printing. Money never goes through `Double`.
public enum PaydMath {
    /// Floor division (`Math.floor(a / b)`), `b > 0`.
    public static func floorDiv(_ a: Int, _ b: Int) -> Int {
        let quotient = a / b
        return (a % b != 0 && (a < 0) != (b < 0)) ? quotient - 1 : quotient
    }

    /// `Math.round(n / d)` for `d > 0` (halves round toward +∞).
    public static func roundedDiv(_ n: Int, _ d: Int) -> Int {
        floorDiv(2 * n + d, 2 * d)
    }

    /// `Math.round(n / d * 100)` for `d > 0`.
    public static func roundedPercent(_ n: Int, of d: Int) -> Int {
        floorDiv(200 * n + d, 2 * d)
    }

    /// `String(Math.round(n / d * 1000) / 10)`, e.g. "33.3", "50", for `d > 0`.
    public static func oneDecimalPercentString(_ n: Int, of d: Int) -> String {
        let tenths = floorDiv(2000 * n + d, 2 * d)
        let magnitude = tenths.magnitude
        let sign = tenths < 0 ? "-" : ""
        let fraction = magnitude % 10
        return fraction == 0 ? "\(sign)\(magnitude / 10)" : "\(sign)\(magnitude / 10).\(fraction)"
    }

    /// JS `Number#toString` for a finite decimal value: "120", "120.5", "0.05".
    public static func jsNumberString(_ value: Decimal) -> String {
        let text = NSDecimalNumber(decimal: value).stringValue
        return text == "-0" ? "0" : text
    }

    /// JS `Number#toString` for doubles in the ranges the app prints (lag days, confidence).
    public static func jsNumberString(_ value: Double) -> String {
        guard value.isFinite else { return value.isNaN ? "NaN" : (value > 0 ? "Infinity" : "-Infinity") }
        if value == value.rounded(), abs(value) < 1e21 {
            return value == 0 ? "0" : String(Int(value))
        }
        return "\(value)"
    }

    /// JS `Math.round` for non-money doubles: nearest integer, halves toward +∞.
    static func jsRound(_ value: Double) -> Double {
        let floor = value.rounded(.down)
        return value - floor >= 0.5 ? floor + 1 : floor
    }

    /// `10^exponent` as Int.
    static func pow10(_ exponent: Int) -> Int {
        (0..<max(0, exponent)).reduce(1) { acc, _ in acc * 10 }
    }

    /// Exact `floor(a * b / c)` for non-negative `a`, `b` and positive `c` without overflow,
    /// provided the quotient fits in Int (always true when `b <= c` or `a <= c`).
    static func mulDiv(_ a: Int, _ b: Int, _ c: Int) -> (quotient: Int, remainder: Int) {
        let product = a.multipliedFullWidth(by: b)
        return c.dividingFullWidth((high: product.high, low: product.low))
    }
}
