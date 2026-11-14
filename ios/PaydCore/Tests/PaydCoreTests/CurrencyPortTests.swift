import Foundation
import Testing
@testable import PaydCore

/// Port of web/src/lib/ledger/__tests__/currency.test.ts (string inputs only: the app never passes
/// JS numbers, so the `number` overload cases are not applicable).
struct CurrencyPortTests {
    private func error(_ text: String) -> String {
        if case let .failure(error) = Currency.tryParseMajorToMinor(text) { return error.message }
        Issue.record("expected \(text) to be rejected")
        return ""
    }

    @Test("parseMajorToMinor: valid input", arguments: [
        ("100", 10000), ("100.00", 10000), ("100.50", 10050), ("100.5", 10050), ("0.05", 5), ("19.99", 1999),
        (".5", 50), ("5.", 500), ("007.10", 710), ("  42  ", 4200), ("+3", 300), ("0", 0), ("-0", 0),
        ("1,250.50", 125050), ("1,234,567.89", 123456789), ("AED 12.50", 1250), ("aed12.50", 1250), ("12.50 AED", 1250),
    ])
    func validInput(_ input: String, _ expected: Int) {
        #expect(Currency.parseMajorToMinor(input, currency: "AED") == expected)
    }

    @Test("rounds half-up to 2dp without float error")
    func roundsHalfUp() {
        #expect(Currency.parseMajorToMinor("1.005") == 101)
        #expect(Currency.parseMajorToMinor("12.345") == 1235)
        #expect(Currency.parseMajorToMinor("12.344999") == 1234)
        #expect(Currency.parseMajorToMinor("0.004") == 0)
        #expect(Currency.parseMajorToMinor("0.005") == 1)
        #expect(Currency.parseMajorToMinor("9.995") == 1000)
        #expect(Currency.parseMajorToMinor("99.999") == 10000)
        #expect(Currency.parseMajorToMinor("-1.005") == -101)
    }

    @Test("keeps the sign for negatives so callers can reject them")
    func keepsSign() {
        #expect(Currency.parseMajorToMinor("-5") == -500)
        #expect(Currency.parseMajorToMinor("-0.01") == -1)
        #expect(Currency.parseMajorToMinor("AED -5") == -500)
        #expect(Currency.parseMajorToMinor("-1,000") == -100000)
    }

    @Test("accepts exactly the cap and rejects anything above it")
    func cap() {
        let cap = Currency.maxMajorAmount * 100
        #expect(Currency.parseMajorToMinor("1000000000000") == cap)
        #expect(Currency.parseMajorToMinor("1,000,000,000,000.00") == cap)
        #expect(Currency.parseMajorToMinor("1000000000000.01") == 0)
        #expect(Currency.parseMajorToMinor("999999999999.995") == cap)
        #expect(Currency.parseMajorToMinor("1000000000000.005") == 0)
        #expect(Currency.parseMajorToMinor("99999999999999999999") == 0)
    }

    @Test("respects currency decimals")
    func currencyDecimals() {
        #expect(Currency.parseMajorToMinor("12.34", currency: "USD") == 1234)
        #expect(Currency.parseMajorToMinor("$12.34", currency: "USD") == 1234)
        #expect(Currency.parseMajorToMinor("1.239", currency: "XYZ") == 124)
    }

    @Test("parseMajorToMinor: invalid input returns 0", arguments: [
        "1e3", "1E3", "1e21", "1.5e2", "1.2.3", "1..2", "--5", "5-", "1-2", "-", "+", ".", "", "   ", "abc", "12abc",
        "NaN", "Infinity", "1,25", "12,34.5", ",100", "1 000", "$5", "AED",
    ])
    func invalidInput(_ input: String) {
        #expect(Currency.parseMajorToMinor(input, currency: "AED") == 0)
    }

    @Test("returns ok with the value for valid input")
    func tryParseOK() {
        #expect(Currency.tryParseMajorToMinor("1,250.50") == .success(125050))
        #expect(Currency.tryParseMajorToMinor("0") == .success(0))
    }

    @Test("returns friendly, specific error messages")
    func friendlyErrors() {
        #expect(error("").lowercased().contains("enter an amount"))
        #expect(error("1e3").contains("scientific notation"))
        #expect(error("1.2.3").contains("one decimal point"))
        #expect(error("5-").contains("minus"))
        #expect(error("1,25").contains("thousands separators"))
        #expect(error("abc").contains("numbers only"))
        #expect(error("2000000000000") == "That amount is too large. The maximum is AED 1,000,000,000,000.")
        for text in ["", "1e3", "abc", "1.2.3"] {
            #expect(!error(text).lowercased().contains("invariant"))
        }
    }

    @Test("always returns a safe integer, and 0 for anything tryParse rejects (fuzz)")
    func fuzz() {
        var rnd = Mulberry32(seed: 42)
        let alphabet = Array("0123456789.,-+eE aAD$")
        for _ in 0..<20000 {
            let length = rnd.int(12)
            var s = ""
            for _ in 0..<length { s.append(alphabet[rnd.int(Double(alphabet.count))]) }
            let value = Currency.parseMajorToMinor(s)
            #expect(abs(value) <= Currency.maxMajorAmount * 100)
            switch Currency.tryParseMajorToMinor(s) {
            case .failure: #expect(value == 0)
            case let .success(parsed): #expect(value == parsed)
            }
        }
    }

    @Test("round-trips with formatMinorUnits for random amounts")
    func roundTrip() {
        var rnd = Mulberry32(seed: 7)
        for _ in 0..<20000 {
            let scale = rnd.next() < 0.5 ? 100_000.0 : Double(Currency.maxMajorAmount * 100)
            let minor = rnd.int(scale)
            #expect(Currency.parseMajorToMinor(Currency.format(minor, currency: "AED"), currency: "AED") == minor)
            #expect(Currency.parseMajorToMinor(Currency.minorToMajorString(minor)) == minor)
        }
    }

    @Test("matches exact half-up rounding of 3-decimal strings")
    func threeDecimals() {
        var rnd = Mulberry32(seed: 99)
        for _ in 0..<20000 {
            let thousandths = rnd.int(1e12)
            let fraction = thousandths % 1000
            let padded = String(repeating: "0", count: 3 - String(fraction).count) + String(fraction)
            let expected = thousandths / 10 + (thousandths % 10 >= 5 ? 1 : 0)
            #expect(Currency.parseMajorToMinor("\(thousandths / 1000).\(padded)") == expected)
        }
    }

    @Test("formats integer minor units")
    func formats() {
        #expect(Currency.format(10000, currency: "AED") == "AED 100.00")
        #expect(Currency.format(125050, currency: "AED") == "AED 1,250.50")
        #expect(Currency.format(-1, currency: "AED") == "-AED 0.01")
        #expect(Currency.format(5, currency: "USD") == "$0.05")
        #expect(Currency.format(123456789, currency: "AED") == "AED 1,234,567.89")
    }

    @Test("never shows negative zero")
    func noNegativeZero() {
        #expect(Currency.format(-0, currency: "AED") == "AED 0.00")
    }

    @Test("never contains more than one decimal point (fuzz)")
    func formatShape() throws {
        var rnd = Mulberry32(seed: 3)
        let shape = try NSRegularExpression(pattern: "^-?AED \\d{1,3}(,\\d{3})*\\.\\d{2}$")
        for _ in 0..<5000 {
            let magnitude = pow(10, Double(rnd.int(16)))
            let minor = Int(((rnd.next() - 0.5) * magnitude).rounded())
            let out = Currency.format(minor, currency: "AED")
            #expect(shape.firstMatch(in: out, range: NSRange(location: 0, length: (out as NSString).length)) != nil, "\(out)")
        }
    }

    @Test("helper strings: toFixed(2), toString(), filsToAedString, locale decimal comma")
    func helperStrings() {
        #expect(Currency.minorToMajorString(123450) == "1234.50")
        #expect(Currency.minorToMajorString(-500) == "-5.00")
        #expect(Currency.minorToMajorPlainString(500000) == "5000")
        #expect(Currency.minorToMajorPlainString(500050) == "5000.5")
        #expect(Currency.minorToMajorPlainString(5) == "0.05")
        #expect(Currency.filsToAedString(9667) == "96.67")
        #expect(Currency.filsToAedString(-5) == "-0.05")
        #expect(Currency.normalizeLocaleDecimalInput("12,5", decimalSeparator: ",") == "12.5")
        #expect(Currency.normalizeLocaleDecimalInput("1,250.5", decimalSeparator: ",") == "1,250.5")
        #expect(Currency.normalizeLocaleDecimalInput("12,5", decimalSeparator: ".") == "12,5")
    }
}
