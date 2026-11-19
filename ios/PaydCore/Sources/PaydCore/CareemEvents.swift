import Foundation

// Client side of the Careem → Payd event intake: the lenient decode of web/src/lib/careem/events.ts
// (CareemEventSchema), the polling helpers of lib/careem/useCareemEvents.ts, the prompt helpers of
// components/careem/CareemSplitPrompt.tsx and the "Split it" prefill of app/page.tsx:63-88.

public enum CareemService: String, Codable, Sendable { case food, groceries, ride, box }

public struct CareemEventItem: Codable, Sendable, Hashable {
    public let name: String
    public let quantity: Int
    public let amountMinor: Int

    enum CodingKeys: String, CodingKey { case name, quantity, amountMinor = "amount_minor" }

    public init(name: String, quantity: Int = 1, amountMinor: Int) {
        self.name = name
        self.quantity = quantity
        self.amountMinor = amountMinor
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try c.decode(String.self, forKey: .name)
        quantity = try c.decodeIfPresent(Int.self, forKey: .quantity) ?? 1
        amountMinor = try c.decode(Int.self, forKey: .amountMinor)
        guard quantity >= 0, amountMinor >= 0 else {
            throw DecodingError.dataCorruptedError(forKey: .amountMinor, in: c, debugDescription: "Negative item value")
        }
    }
}

/// A pending Careem order/ride (`GET /api/careem/events`). Snake_case keys, Zod defaults on decode.
public struct CareemEvent: Codable, Sendable, Hashable, Identifiable {
    public static let eventTypes: Set<String> = ["order.placed", "ride.booked"]

    public let id: String
    /// "order.placed" or "ride.booked".
    public let type: String
    public let service: CareemService
    public let sourceTool: String
    public let occurredAt: String
    public let title: String
    public let merchant: String?
    public let amountMinor: Int
    public let currency: String
    public let reference: String?
    public let items: [CareemEventItem]
    /// "pending" for events the user still has to answer.
    public let status: String

    enum CodingKeys: String, CodingKey {
        case id, type, service, sourceTool = "source_tool", occurredAt = "occurred_at", title, merchant
        case amountMinor = "amount_minor", currency, reference, items, status
    }

    public init(id: String, type: String, service: CareemService, sourceTool: String = "unknown",
                occurredAt: String = "", title: String = "", merchant: String? = nil, amountMinor: Int,
                currency: String = "AED", reference: String? = nil, items: [CareemEventItem] = [],
                status: String = "pending") {
        self.id = id
        self.type = type
        self.service = service
        self.sourceTool = sourceTool
        self.occurredAt = occurredAt
        self.title = title
        self.merchant = merchant
        self.amountMinor = amountMinor
        self.currency = currency
        self.reference = reference
        self.items = items
        self.status = status
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        type = try c.decode(String.self, forKey: .type)
        service = try c.decode(CareemService.self, forKey: .service)
        sourceTool = try c.decodeIfPresent(String.self, forKey: .sourceTool) ?? "unknown"
        occurredAt = try c.decodeIfPresent(String.self, forKey: .occurredAt) ?? ""
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        merchant = try c.decodeIfPresent(String.self, forKey: .merchant)
        amountMinor = try c.decode(Int.self, forKey: .amountMinor)
        currency = (try c.decodeIfPresent(String.self, forKey: .currency) ?? "AED").uppercased()
        reference = try c.decodeIfPresent(String.self, forKey: .reference)
        items = try c.decodeIfPresent([CareemEventItem].self, forKey: .items) ?? []
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? ""
        guard !id.isEmpty, CareemEvent.eventTypes.contains(type), amountMinor >= 0 else {
            throw DecodingError.dataCorruptedError(forKey: .id, in: c, debugDescription: "Invalid Careem event")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(type, forKey: .type)
        try c.encode(service, forKey: .service)
        try c.encode(sourceTool, forKey: .sourceTool)
        try c.encode(occurredAt, forKey: .occurredAt)
        try c.encode(title, forKey: .title)
        try c.encodeNullable(merchant, forKey: .merchant)
        try c.encode(amountMinor, forKey: .amountMinor)
        try c.encode(currency, forKey: .currency)
        try c.encodeNullable(reference, forKey: .reference)
        try c.encode(items, forKey: .items)
        try c.encode(status, forKey: .status)
    }
}

public enum CareemEvents {
    /// `POLL_INTERVAL_MS` in seconds.
    public static let pollIntervalSeconds: Double = 2

    /// `{ events: [...] }` → valid pending events (invalid items are skipped), newest first.
    public static func decodePending(_ body: JSONValue) -> [CareemEvent] {
        guard let items = body["events"]?.arrayValue else { return [] }
        let events = items.compactMap { try? $0.decode(CareemEvent.self) }.filter { $0.status == "pending" }
        return sortNewestFirst(events)
    }

    private static func occurredMillis(_ event: CareemEvent) -> Int {
        PaydJSON.parseDate(event.occurredAt).map(PaydJSON.epochMillis) ?? 0
    }

    /// Newest-by-occurrence first; stable, unparseable dates count as 0.
    public static func sortNewestFirst(_ events: [CareemEvent]) -> [CareemEvent] {
        events.stableSorted { occurredMillis($0) > occurredMillis($1) }
    }

    /// The event to present: the oldest pending one (last of the newest-first list).
    public static func current(_ events: [CareemEvent]) -> CareemEvent? { events.last }

    /// CareemSplitPrompt `SERVICE_META` labels.
    public static func serviceLabel(_ service: CareemService) -> String {
        switch service {
        case .ride: return "Careem Ride"
        case .food: return "Careem Food"
        case .groceries: return "Careem Quik"
        case .box: return "Careem Box"
        }
    }

    /// CareemSplitPrompt.tsx `relativeTime`: "Just now", "5 min ago", "3h ago", else "11/14/2026".
    public static func relativeTime(_ iso: String, now: Date) -> String {
        guard let date = PaydJSON.parseDate(iso) else { return "Just now" }
        let secs = max(0, PaydMath.roundedDiv(PaydJSON.epochMillis(now) - PaydJSON.epochMillis(date), 1000))
        if secs < 60 { return "Just now" }
        let mins = PaydMath.roundedDiv(secs, 60)
        if mins < 60 { return "\(mins) min ago" }
        let hrs = PaydMath.roundedDiv(mins, 60)
        if hrs < 24 { return "\(hrs)h ago" }
        return PaydFormat.defaultDate(date)
    }

    /// Total quantity of the items (`quantity || 1`).
    public static func itemCount(_ event: CareemEvent) -> Int {
        event.items.reduce(0) { $0 + ($1.quantity == 0 ? 1 : $1.quantity) }
    }

    /// "merchant · Ref X" (empty parts dropped).
    public static func subtitle(_ event: CareemEvent) -> String {
        [event.merchant.nonEmpty, event.reference.nonEmpty.map { "Ref \($0)" }].compactMap { $0 }.joined(separator: " · ")
    }

    /// page.tsx:63-88 `handleCareemSplit`: the Add-expense prefill for a Careem event.
    public static func prefill(for event: CareemEvent) -> AddExpensePrefill {
        let categoryHint: String = switch event.service {
        case .ride: "Transportation"
        case .groceries: "Groceries"
        case .food: "Food and dining"
        case .box: "box"
        }
        let notes = [
            event.merchant.nonEmpty.map { "Careem · \($0)" } ?? "Careem",
            event.reference.nonEmpty.map { "ref \($0)" },
        ].compactMap { $0 }.joined(separator: " · ")
        return AddExpensePrefill(
            title: event.title.nonEmpty ?? event.merchant.nonEmpty ?? "Careem order",
            amountMinor: event.amountMinor,
            notes: notes,
            categoryName: categoryHint,
            items: event.items.map {
                AddExpensePrefill.PrefillItem(name: $0.quantity > 1 ? "\($0.name) x\($0.quantity)" : $0.name,
                                              amountMinor: $0.amountMinor)
            },
            paymentMethod: "Careem Pay")
    }
}
