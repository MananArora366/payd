import Foundation

// Port of the types and demo presets in web/src/lib/ai/receipt-scan.ts (Zod defaults applied on decode).

public struct ReceiptItem: Codable, Sendable, Hashable {
    public let name: String
    public let quantity: Int
    public let priceMinor: Int

    enum CodingKeys: String, CodingKey { case name, quantity, priceMinor = "price_minor" }

    public init(name: String, quantity: Int = 1, priceMinor: Int) {
        self.name = name
        self.quantity = quantity
        self.priceMinor = priceMinor
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try c.decode(String.self, forKey: .name)
        quantity = try c.decodeIfPresent(Int.self, forKey: .quantity) ?? 1
        priceMinor = try c.decode(Int.self, forKey: .priceMinor)
        guard quantity >= 1, priceMinor >= 0 else {
            throw DecodingError.dataCorruptedError(forKey: .priceMinor, in: c, debugDescription: "Invalid receipt item")
        }
    }
}

public struct ReceiptScanResult: Codable, Sendable, Hashable {
    public let merchantName: String
    public let date: String?
    public let currency: String
    /// UAE Tax Registration Number (15 digits).
    public let trn: String?
    public let subtotalMinor: Int
    public let vatMinor: Int
    public let totalMinor: Int
    public let category: String
    public let lineItems: [ReceiptItem]
    /// Service charges / tips minus discounts (signed fils).
    public let chargesMinor: Int?
    public let confidence: Double
    /// Reconciliation problems the user should check.
    public let warnings: [String]?
    public let notes: String?
    public let engine: String

    enum CodingKeys: String, CodingKey {
        case merchantName = "merchant_name", date, currency, trn, subtotalMinor = "subtotal_minor", vatMinor = "vat_minor"
        case totalMinor = "total_minor", category, lineItems = "line_items", chargesMinor = "charges_minor"
        case confidence, warnings, notes, engine
    }

    public init(merchantName: String = "UAE Merchant", date: String? = nil, currency: String = "AED", trn: String? = nil,
                subtotalMinor: Int = 0, vatMinor: Int = 0, totalMinor: Int, category: String = "Food and dining",
                lineItems: [ReceiptItem] = [], chargesMinor: Int? = nil, confidence: Double = 0.95,
                warnings: [String]? = nil, notes: String? = nil, engine: String = "local_ocr") {
        self.merchantName = merchantName
        self.date = date
        self.currency = currency
        self.trn = trn
        self.subtotalMinor = subtotalMinor
        self.vatMinor = vatMinor
        self.totalMinor = totalMinor
        self.category = category
        self.lineItems = lineItems
        self.chargesMinor = chargesMinor
        self.confidence = confidence
        self.warnings = warnings
        self.notes = notes
        self.engine = engine
    }

    /// Lenient decode applying the `ReceiptScanSchema` defaults; rejects what Zod rejects.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        merchantName = try c.decodeIfPresent(String.self, forKey: .merchantName) ?? "UAE Merchant"
        date = try c.decodeIfPresent(String.self, forKey: .date)
        currency = try c.decodeIfPresent(String.self, forKey: .currency) ?? "AED"
        trn = try c.decodeIfPresent(String.self, forKey: .trn)
        subtotalMinor = try c.decodeIfPresent(Int.self, forKey: .subtotalMinor) ?? 0
        vatMinor = try c.decodeIfPresent(Int.self, forKey: .vatMinor) ?? 0
        totalMinor = try c.decode(Int.self, forKey: .totalMinor)
        category = try c.decodeIfPresent(String.self, forKey: .category) ?? "Food and dining"
        lineItems = try c.decodeIfPresent([ReceiptItem].self, forKey: .lineItems) ?? []
        chargesMinor = try c.decodeIfPresent(Int.self, forKey: .chargesMinor)
        confidence = try c.decodeIfPresent(Double.self, forKey: .confidence) ?? 0.95
        warnings = try c.decodeIfPresent([String].self, forKey: .warnings)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        engine = try c.decodeIfPresent(String.self, forKey: .engine) ?? "local_ocr"
        guard subtotalMinor >= 0, vatMinor >= 0, totalMinor > 0, (0...1).contains(confidence) else {
            throw DecodingError.dataCorruptedError(forKey: .totalMinor, in: c, debugDescription: "Invalid receipt")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(merchantName, forKey: .merchantName)
        try c.encodeNullable(date, forKey: .date)
        try c.encode(currency, forKey: .currency)
        try c.encodeNullable(trn, forKey: .trn)
        try c.encode(subtotalMinor, forKey: .subtotalMinor)
        try c.encode(vatMinor, forKey: .vatMinor)
        try c.encode(totalMinor, forKey: .totalMinor)
        try c.encode(category, forKey: .category)
        try c.encode(lineItems, forKey: .lineItems)
        try c.encodeIfPresent(chargesMinor, forKey: .chargesMinor)
        try c.encode(confidence, forKey: .confidence)
        try c.encodeIfPresent(warnings, forKey: .warnings)
        try c.encodeNullable(notes, forKey: .notes)
        try c.encode(engine, forKey: .engine)
    }
}

/// `SAMPLE_UAE_RECEIPTS` (demo presets; used by tests).
public enum ReceiptSamples {
    public static func all(now: Date) -> [String: ReceiptScanResult] {
        let today = PaydFormat.isoDay(now)
        func items(_ rows: [(String, Int, Int)]) -> [ReceiptItem] {
            rows.map { ReceiptItem(name: $0.0, quantity: $0.1, priceMinor: $0.2) }
        }
        return [
            "lulu": ReceiptScanResult(
                merchantName: "LuLu Hypermarket LLC (Dubai Branch)", date: "2024-10-15", currency: "AED",
                trn: "100282231000003", subtotalMinor: 3934, vatMinor: 196, totalMinor: 4130, category: "Groceries",
                lineItems: items([("Butter Chicken Boneless", 1, 2955), ("Mutton Paneer Samosa", 1, 300),
                                  ("Vegetable Samosa Snack", 1, 300), ("Nellara Malabar Parotta 3s", 1, 550),
                                  ("Supermarket Shopping Bag", 1, 25)]),
                confidence: 0.99, notes: "LuLu Hypermarket Dubai groceries split. 5% UAE VAT itemized.", engine: "demo_sample"),
            "al_safadi": ReceiptScanResult(
                merchantName: "Al Safadi Restaurant (Sheikh Zayed Rd)", date: today, currency: "AED",
                trn: "100345678900003", subtotalMinor: 24762, vatMinor: 1238, totalMinor: 26000, category: "Food and dining",
                lineItems: items([("Chicken Biryani", 1, 5500), ("Mixed Grill Platter", 1, 9500), ("Hummus Beiruti", 1, 2800),
                                  ("Fattoush Salad", 1, 3200), ("Large Mineral Water", 2, 2000),
                                  ("Fresh Mint Lemonade", 2, 3000)]),
                confidence: 0.98, notes: "Dinner at Al Safadi with flatmates. 5% UAE VAT itemized.", engine: "demo_sample"),
            "carrefour": ReceiptScanResult(
                merchantName: "Carrefour Market (Dubai Marina Crown)", date: today, currency: "AED",
                trn: "100012345600003", subtotalMinor: 9524, vatMinor: 476, totalMinor: 10000, category: "Groceries",
                lineItems: items([("Organic Fresh Milk 2L", 2, 2200), ("Sourdough Country Bread", 1, 1650),
                                  ("Free Range Eggs 30pk", 1, 2850), ("Greek Yoghurt 1kg", 2, 2200),
                                  ("Fresh Cavendish Bananas", 1, 1100)]),
                confidence: 0.99, notes: "Weekly shared apartment supplies.", engine: "demo_sample"),
            "zaatar": ReceiptScanResult(
                merchantName: "Careem DineOut • Zaatar w Zeit (DIFC)", date: today, currency: "AED",
                trn: "100897654300003", subtotalMinor: 11810, vatMinor: 590, totalMinor: 12400, category: "Food and dining",
                lineItems: items([("Famous Chicken Wrap", 2, 6400), ("Manakeesh Zaatar & Cheese", 2, 3800),
                                  ("Spiced Potato Wedges", 1, 2200)]),
                confidence: 0.97, notes: "Careem DineOut team lunch split.", engine: "demo_sample"),
        ]
    }
}
