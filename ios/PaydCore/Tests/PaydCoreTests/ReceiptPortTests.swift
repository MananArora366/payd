import Foundation
import Testing
@testable import PaydCore

/// Port of web/src/lib/ledger/__tests__/receipt.test.ts blocks "Functionality 2" and
/// "Payd Lens local OCR parser" (upload validation and the route are server-only).
struct ReceiptPortTests {
    private let manan = SeedIDs.manan, rahul = SeedIDs.prakarsh, sarah = SeedIDs.veer
    private let now = isoDate("2026-11-14T12:00:00Z")
    private var samples: [String: ReceiptScanResult] { ReceiptSamples.all(now: now) }

    /// `ReceiptScanSchema.parse` equivalent: encode then decode leniently.
    private func validated(_ key: String) throws -> ReceiptScanResult {
        let sample = try #require(samples[key])
        return try PaydJSON.decoder.decode(ReceiptScanResult.self, from: PaydJSON.encoder.encode(sample))
    }

    @Test("Validates Al Safadi UAE receipt with 5% VAT and 15-digit TRN")
    func alSafadi() throws {
        let r = try validated("al_safadi")
        #expect(r.merchantName.contains("Al Safadi"))
        #expect(r.currency == "AED")
        #expect(r.totalMinor == 26000)
        #expect(r.subtotalMinor == 24762)
        #expect(r.vatMinor == 1238)
        #expect(r.trn == "100345678900003")
        #expect(r.lineItems.count == 6)
        #expect(r.date == "2026-11-14")
    }

    @Test("Acceptance Test 7: Itemized split proportionally distributes 5% VAT and matches totalMinor exactly")
    func itemizedVat() throws {
        let r = try validated("al_safadi")
        let all = [manan, rahul, sarah]
        let shares = try ItemizedShares.calculate(totalMinor: r.totalMinor, lineItems: r.lineItems,
                                                  assignments: [0: [manan], 1: [rahul], 2: all, 3: all, 4: all, 5: [sarah]],
                                                  participantIds: all)
        #expect(shares.sum == 26000)
        #expect((shares[manan] ?? 0) > 0 && (shares[rahul] ?? 0) > 0 && (shares[sarah] ?? 0) > 0)
        #expect((shares[rahul] ?? 0) > (shares[manan] ?? 0))
        #expect((shares[rahul] ?? 0) > (shares[sarah] ?? 0))
    }

    @Test("Fallbacks to equal split if no specific items are assigned in itemized mode")
    func equalFallback() throws {
        let r = try validated("carrefour")
        let shares = try ItemizedShares.calculate(totalMinor: r.totalMinor, lineItems: r.lineItems, assignments: [:],
                                                  participantIds: [manan, rahul])
        #expect(shares[manan] == 5000 && shares[rahul] == 5000)
    }

    @Test("Validates LuLu Hypermarket UAE receipt with 5% VAT and exact integer minor-unit sum")
    func lulu() throws {
        let r = try validated("lulu")
        #expect(r.merchantName.contains("LuLu"))
        #expect(r.totalMinor == 4130 && r.subtotalMinor == 3934 && r.vatMinor == 196)
        #expect(r.trn == "100282231000003")
        #expect(r.lineItems.count == 5)
        #expect(r.lineItems.reduce(0) { $0 + $1.priceMinor } == 4130)
        let all = [manan, rahul, sarah]
        let shares = try ItemizedShares.calculate(totalMinor: r.totalMinor, lineItems: r.lineItems,
                                                  assignments: [0: [manan], 1: [rahul], 2: [sarah], 3: all, 4: [manan]],
                                                  participantIds: all)
        #expect(shares.sum == 4130)
        #expect((shares[manan] ?? 0) > (shares[rahul] ?? 0))
        #expect(shares.keys == all)
    }

    @Test("receipt decode applies Zod defaults and rejects invalid totals")
    func lenientDecode() throws {
        let minimal = try PaydJSON.decoder.decode(ReceiptScanResult.self, from: Data(#"{"total_minor":500}"#.utf8))
        #expect(minimal.merchantName == "UAE Merchant" && minimal.category == "Food and dining" && minimal.engine == "local_ocr")
        #expect(minimal.confidence == 0.95 && minimal.lineItems.isEmpty && minimal.date == nil)
        #expect(throws: (any Error).self) {
            try PaydJSON.decoder.decode(ReceiptScanResult.self, from: Data(#"{"total_minor":0}"#.utf8))
        }
    }

    // MARK: Local OCR parser

    private let blueOasis = [
        "BLUE OASIS BISTRO", "Jumeirah Beach Road Dubai", "TRN: 100123456700003", "Chicken Shawarma 2 x", "Falafel Plate",
        "Fresh Lemon Mint", "Hummus", "Subtotal", "VAT 5%", "TOTAL AED", "36.00", "24.50", "18.00", "15.00", "93.50",
        "4.68", "98.18", "THANK YOU",
    ]

    private let carrefour = [
        "CARREFOUR MALL OF THE EMIRATES", "TRN 100234567800003", "Date: 2026-11-10", "Milk 2L", "13.50", "Bread", "6.00",
        "Eggs 30pc", "21.00", "Subtotal", "40.50", "VAT 5%", "2.03", "TOTAL AED", "42.53",
    ]

    @Test("pairs column-split labels with prices (Blue Oasis repro)")
    func blueOasisParse() throws {
        let r = try ReceiptTextParser.parseRawLines(blueOasis, now: now)
        #expect(r.merchantName == "Blue Oasis Bistro")
        #expect(r.trn == "100123456700003")
        #expect(r.totalMinor == 9818)
        #expect(r.subtotalMinor == 9350)
        #expect(r.vatMinor == 468)
        #expect(r.lineItems == [
            ReceiptItem(name: "Chicken Shawarma", quantity: 2, priceMinor: 3600),
            ReceiptItem(name: "Falafel Plate", quantity: 1, priceMinor: 2450),
            ReceiptItem(name: "Fresh Lemon Mint", quantity: 1, priceMinor: 1800),
            ReceiptItem(name: "Hummus", quantity: 1, priceMinor: 1500),
        ])
        #expect(r.warnings == [])
        #expect(r.confidence >= 0.9)
        #expect(r.date == nil)
        #expect(r.engine == "local_ocr")
        #expect(r.notes == "Scanned on-device with Apple Vision OCR. Check the items before saving.")
    }

    @Test("uses TOTAL (not Subtotal), printed VAT (not the \"5\" in 5%) and the receipt date (Carrefour repro)")
    func carrefourParse() throws {
        let r = try ReceiptTextParser.parseRawLines(carrefour, now: now)
        #expect(r.merchantName == "Carrefour Mall Of The Emirates")
        #expect(r.category == "Groceries")
        #expect(r.trn == "100234567800003")
        #expect(r.date == "2026-11-10")
        #expect(r.totalMinor == 4253 && r.subtotalMinor == 4050 && r.vatMinor == 203)
        #expect(r.lineItems.map(\.name) == ["Milk 2L", "Bread", "Eggs 30pc"])
        #expect(r.lineItems.map(\.priceMinor) == [1350, 600, 2100])
        #expect(r.lineItems.reduce(0) { $0 + $1.priceMinor } + r.vatMinor == r.totalMinor)
    }

    @Test("parses inline rows, thousands separators, service charge and grand total")
    func inlineRows() throws {
        let r = try ReceiptTextParser.parseRawLines([
            "GOLDEN PALACE", "Date 10/11/2026", "Wagyu Platter 1,250.50", "Lobster 2 x 400.00 800.00", "Sub Total 2,050.50",
            "Service Charge 10% 205.05", "VAT 5% 112.78", "Total 2,368.33", "Grand Total AED 2,368.33", "Cash 2,400.00",
            "Change 31.67",
        ], now: now)
        #expect(r.date == "2026-11-10")
        #expect(r.lineItems == [
            ReceiptItem(name: "Wagyu Platter", quantity: 1, priceMinor: 125050),
            ReceiptItem(name: "Lobster", quantity: 2, priceMinor: 80000),
        ])
        #expect(r.subtotalMinor == 205050)
        #expect(r.vatMinor == 11278)
        #expect(r.chargesMinor == 20505)
        #expect(r.totalMinor == 236833)
        #expect(r.warnings == [])
    }

    @Test("flags and lowers confidence when items + VAT do not reconcile with the total")
    func reconcile() throws {
        var lines = carrefour
        if let index = lines.firstIndex(of: "6.00") { lines[index] = "9.00" }
        let r = try ReceiptTextParser.parseRawLines(lines, now: now)
        #expect(r.totalMinor == 4253)
        let warnings = r.warnings ?? []
        #expect(!warnings.isEmpty)
        #expect(warnings.joined(separator: " ").lowercased().contains("total"))
        #expect(r.confidence < 0.7)
    }

    @Test("refuses to fabricate: blank or amount-less OCR throws ReceiptScanError (422)", arguments: [
        [String](), ["", "  "], ["HELLO WORLD", "just a photo of a cat"],
    ])
    func refuses(_ lines: [String]) {
        #expect(throws: ReceiptScanError(ReceiptTextParser.unreadableMessage, status: 422, code: "unreadable")) {
            try ReceiptTextParser.parseRawLines(lines, now: now)
        }
    }

    @Test("ignores impossible or future dates")
    func dates() {
        #expect(ReceiptTextParser.extractDate(["Date: 31/02/2026"], now: now) == nil)
        #expect(ReceiptTextParser.extractDate(["Date: 2027-01-01"], now: now) == nil)
        #expect(ReceiptTextParser.extractDate(["12 Nov 2026"], now: now) == "2026-11-12")
        #expect(ReceiptTextParser.extractDate(["Nov 12, 2026"], now: now) == "2026-11-12")
    }

    @Test("classifies receipt labels")
    func classify() {
        #expect(ReceiptTextParser.classifyLabel("Sub Total") == .subtotal)
        #expect(ReceiptTextParser.classifyLabel("Grand Total") == .total)
        #expect(ReceiptTextParser.classifyLabel("Total VAT") == .vat)
        #expect(ReceiptTextParser.classifyLabel("Service Charge") == .charge)
        #expect(ReceiptTextParser.classifyLabel("Promo") == .discount)
        #expect(ReceiptTextParser.classifyLabel("Visa") == .payment)
        #expect(ReceiptTextParser.classifyLabel("Hummus") == .item)
        #expect(ReceiptTextParser.extractTrn(["Tel 100 123 456 700 003"]) == "100123456700003")
    }
}
