import Foundation
import Testing
@testable import PaydCore

/// Port of the "CareemEventSchema" block of web/src/lib/careem/__tests__/events.test.ts as a client
/// decode, plus the polling/prompt/prefill helpers (useCareemEvents.ts, CareemSplitPrompt.tsx, page.tsx).
struct CareemEventsPortTests {
    private func full(_ id: String, _ overrides: [String: JSONValue] = [:]) -> JSONValue {
        var map: OrderedMap<String, JSONValue> = [
            "id": .string(id), "type": "order.placed", "service": "food", "source_tool": "cart_checkout",
            "occurred_at": "2026-11-14T10:00:00.000Z", "title": "Lunch", "merchant": "Shake Shack", "amount_minor": 5000,
            "currency": "AED", "reference": "ORD-1", "items": [["name": "Burger", "quantity": 1, "amount_minor": 5000]],
            "status": "pending",
        ]
        for (key, value) in overrides { map = map.setting(key, value) }
        return .object(map)
    }

    private func decode(_ value: JSONValue) throws -> CareemEvent { try value.decode(CareemEvent.self) }

    @Test("parses a full payload")
    func fullPayload() throws {
        let e = try decode(full("evt_1"))
        #expect(e.amountMinor == 5000)
        #expect(e.items.count == 1)
    }

    @Test("is lenient: items default to [], merchant/reference null, raw optional")
    func lenient() throws {
        let e = try decode(["id": "evt_2", "type": "ride.booked", "service": "ride", "source_tool": "create_ride",
                            "occurred_at": "2026-11-14T10:00:00.000Z", "title": "Ride", "amount_minor": 3200, "currency": "aed"])
        #expect(e.items.isEmpty)
        #expect(e.merchant == nil && e.reference == nil)
        #expect(e.currency == "AED")
        let bare = try decode(["id": "x", "type": "ride.booked", "service": "ride", "amount_minor": 1])
        #expect(bare.sourceTool == "unknown" && bare.title == "" && bare.occurredAt == "")
    }

    @Test("accepts explicit nulls and raw object")
    func nullsAndRaw() throws {
        let e = try decode(full("evt_3", ["merchant": .null, "reference": .null, "raw": ["foo": 1]]))
        #expect(e.merchant == nil)
    }

    @Test("rejects non-integer amounts (fils only)")
    func nonInteger() {
        #expect(throws: (any Error).self) { try decode(full("x", ["amount_minor": .number(Decimal(string: "12.5") ?? 0)])) }
    }

    @Test("rejects negative item amounts but allows 0 (e.g. free delivery)")
    func itemAmounts() throws {
        #expect(throws: (any Error).self) {
            try decode(full("x", ["items": [["name": "Discount", "quantity": 1, "amount_minor": -500]]]))
        }
        _ = try decode(full("x", ["items": [["name": "Delivery", "quantity": 1, "amount_minor": 0]]]))
    }

    @Test("rejects unknown type/service and missing id")
    func rejectsUnknown() {
        #expect(throws: (any Error).self) { try decode(full("x", ["type": "order.cancelled"])) }
        #expect(throws: (any Error).self) { try decode(full("x", ["service": "bike"])) }
        #expect(throws: (any Error).self) { try decode(full("")) }
        guard case let .object(map) = full("x") else { return }
        #expect(throws: (any Error).self) { try decode(.object(map.removing("id"))) }
    }

    @Test("decodePending skips invalid items and non-pending events, newest first")
    func decodePending() {
        let body: JSONValue = ["events": [
            full("early", ["occurred_at": "2026-11-14T10:01:00.000Z"]),
            full("late", ["occurred_at": "2026-11-14T10:05:00.000Z"]),
            full("bad", ["service": "bike"]),
            full("done", ["status": "split"]),
            "garbage",
        ]]
        let events = CareemEvents.decodePending(body)
        #expect(events.map(\.id) == ["late", "early"])
        #expect(CareemEvents.current(events)?.id == "early")
        #expect(CareemEvents.decodePending(["nope": 1]).isEmpty)
    }

    @Test("sortNewestFirst is stable and treats unparseable dates as 0")
    func sorts() throws {
        let events = try [
            decode(full("first")), decode(full("garbage", ["occurred_at": "not-a-date"])), decode(full("second")),
        ]
        #expect(CareemEvents.sortNewestFirst(events).map(\.id) == ["first", "second", "garbage"])
    }

    @Test("prompt helpers: labels, item count, subtitle, relative time")
    func promptHelpers() throws {
        #expect(CareemEvents.serviceLabel(.ride) == "Careem Ride")
        #expect(CareemEvents.serviceLabel(.groceries) == "Careem Quik")
        let e = try decode(full("e", ["items": [["name": "A", "quantity": 2, "amount_minor": 1], ["name": "B", "quantity": 0, "amount_minor": 1]]]))
        #expect(CareemEvents.itemCount(e) == 3)
        #expect(CareemEvents.subtitle(e) == "Shake Shack · Ref ORD-1")
        let now = isoDate("2026-11-14T12:00:00.000Z")
        #expect(CareemEvents.relativeTime("2026-11-14T11:59:31.000Z", now: now) == "Just now")
        #expect(CareemEvents.relativeTime("2026-11-14T11:55:00.000Z", now: now) == "5 min ago")
        #expect(CareemEvents.relativeTime("2026-11-14T09:00:00.000Z", now: now) == "3h ago")
        #expect(CareemEvents.relativeTime("not-a-date", now: now) == "Just now")
        #expect(CareemEvents.relativeTime("2026-11-14T13:00:00.000Z", now: now) == "Just now")
    }

    @Test("prefill matches page.tsx handleCareemSplit")
    func prefill() throws {
        let food = CareemEvents.prefill(for: try decode(full("e", ["items": [["name": "Burger", "quantity": 2, "amount_minor": 5000]]])))
        #expect(food == AddExpensePrefill(title: "Lunch", amountMinor: 5000, notes: "Careem · Shake Shack · ref ORD-1",
                                          categoryName: "Food and dining",
                                          items: [.init(name: "Burger x2", amountMinor: 5000)], paymentMethod: "Careem Pay"))
        let ride = CareemEvents.prefill(for: try decode(["id": "r", "type": "ride.booked", "service": "ride", "amount_minor": 3200]))
        #expect(ride.title == "Careem order")
        #expect(ride.notes == "Careem")
        #expect(ride.categoryName == "Transportation")
        let box = CareemEvents.prefill(for: try decode(["id": "b", "type": "order.placed", "service": "box", "merchant": "DHL", "amount_minor": 1]))
        #expect(box.title == "DHL" && box.categoryName == "box")
    }
}
