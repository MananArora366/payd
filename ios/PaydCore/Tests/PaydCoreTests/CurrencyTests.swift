import Foundation
import Testing
@testable import PaydCore

/// Mirrors web/src/lib/ledger/__tests__/ledger.test.ts — "Currency & Minor Units Utilities".
struct CurrencyTests {
    @Test func formatsMinorUnits() {
        #expect(Currency.format(10000, currency: "AED") == "AED 100.00")
        #expect(Currency.format(3333, currency: "AED") == "AED 33.33")
        #expect(Currency.format(5, currency: "USD") == "$0.05")
        #expect(Currency.format(0, currency: "EUR") == "€0.00")
    }

    @Test func formatsThousandsSeparatorAndNegatives() {
        #expect(Currency.format(1_500_000, currency: "AED") == "AED 15,000.00")
        #expect(Currency.format(-3333, currency: "AED") == "-AED 33.33")
    }

    @Test func parsesMajorStringsWithoutFloatErrors() {
        #expect(Currency.parseMajorToMinor("100") == 10000)
        #expect(Currency.parseMajorToMinor("100.00") == 10000)
        #expect(Currency.parseMajorToMinor("100.50") == 10050)
        #expect(Currency.parseMajorToMinor("0.05") == 5)
        #expect(Currency.parseMajorToMinor("19.99") == 1999)
        #expect(Currency.parseMajorToMinor(19.99) == 1999)
    }

    @Test func parseStripsSymbolsAndHandlesEdgeInput() {
        #expect(Currency.parseMajorToMinor("AED 1,250.75") == 125075)
        #expect(Currency.parseMajorToMinor("-12.5") == -1250)
        #expect(Currency.parseMajorToMinor("12.999") == 1299)
        #expect(Currency.parseMajorToMinor("") == 0)
        #expect(Currency.parseMajorToMinor(".") == 0)
        #expect(Currency.parseMajorToMinor("abc") == 0)
    }

    @Test func minorToMajor() {
        #expect(Currency.minorToMajor(10050) == 100.5)
        #expect(Currency.minorToMajor(3333) == 33.33)
    }

    @Test func symbols() {
        #expect(Currency.symbol(for: "AED") == "AED")
        #expect(Currency.symbol(for: "USD") == "$")
        #expect(Currency.symbol(for: "EUR") == "€")
        #expect(Currency.symbol(for: "INR") == "₹")
        #expect(Currency.symbol(for: "xyz") == "XYZ")
    }
}
