import Foundation
import Testing
@testable import PaydCore

/// Records calls made by the fake closures (single-task test, so a lock is enough).
private final class CallLog: @unchecked Sendable {
    private let lock = NSLock()
    private var entries: [String] = []

    func add(_ entry: String) { lock.withLock { entries.append(entry) } }
    func count(_ entry: String) -> Int { lock.withLock { entries.filter { $0 == entry }.count } }
    var all: [String] { lock.withLock { entries } }
}

private struct RecordFailure: Error {}

/// Port of web/src/components/modals/careemPaySettle.test.ts (+ careemPayLink helpers).
struct CareemPaySettlePortTests {
    private let receipt = CareemPayReceipt(status: "INSTANT_AUTHORIZED", transactionRef: "CP-123", amountMinor: 9667,
                                           careemPayDeeplink: "careem://pay")

    @Test("validates BEFORE charging and never charges an invalid settlement")
    func validatesFirst() async {
        let log = CallLog()
        let receipt = receipt
        let out = await CareemPay.run(
            validate: { .failure(reason: "Too much", debtMinor: 0) },
            charge: { () async throws(CareemPayFailure) -> CareemPayReceipt in log.add("charge"); return receipt },
            record: { _ in log.add("record") },
            priorReceipt: nil)
        #expect(out == .invalid(message: "Too much"))
        #expect(log.all.isEmpty)
    }

    @Test("charges once then records on the happy path")
    func happyPath() async {
        let log = CallLog()
        let receipt = receipt
        let out = await CareemPay.run(
            validate: { log.add("validate"); return .ok(debtMinor: 9667) },
            charge: { () async throws(CareemPayFailure) -> CareemPayReceipt in log.add("charge"); return receipt },
            record: { _ in log.add("record") },
            priorReceipt: nil)
        #expect(log.all == ["validate", "charge", "record"])
        #expect(out == .recorded(receipt: receipt))
    }

    @Test("a failed charge records nothing and gives a friendly message")
    func failedCharge() async {
        let log = CallLog()
        let out = await CareemPay.run(
            validate: { .ok(debtMinor: 9667) },
            charge: { () async throws(CareemPayFailure) -> CareemPayReceipt in throw .transport("Failed to fetch") },
            record: { _ in log.add("record") },
            priorReceipt: nil)
        guard case let .chargeFailed(message) = out else {
            Issue.record("expected chargeFailed, got \(out)")
            return
        }
        #expect(message.contains("not been charged"))
        #expect(log.all.isEmpty)
    }

    @Test("ledger failure after a charge -> success-with-warning; retry only re-records (no second charge)")
    func retryOnlyRecords() async throws {
        let log = CallLog()
        let receipt = receipt
        let failing = { (_: CareemPayReceipt) throws in
            log.add("record")
            throw RecordFailure()
        }
        let first = await CareemPay.run(
            validate: { log.add("validate"); return .ok(debtMinor: 9667) },
            charge: { () async throws(CareemPayFailure) -> CareemPayReceipt in log.add("charge"); return receipt },
            record: failing, priorReceipt: nil)
        guard case let .chargedNotRecorded(kept, message) = first else {
            Issue.record("expected chargedNotRecorded, got \(first)")
            return
        }
        #expect(message.contains("CP-123"))
        #expect(!message.lowercased().contains("invariant"))
        #expect(log.count("charge") == 1)

        let second = await CareemPay.run(
            validate: { log.add("validate"); return .ok(debtMinor: 9667) },
            charge: { () async throws(CareemPayFailure) -> CareemPayReceipt in log.add("charge"); return receipt },
            record: { _ in log.add("record-ok") }, priorReceipt: kept)
        #expect(second == .recorded(receipt: receipt))
        #expect(log.count("charge") == 1)
        #expect(log.count("validate") == 1)
        #expect(log.all.last == "record-ok")
    }

    @Test("maps errors to plain language")
    func friendly() {
        #expect(CareemPay.friendlyError(.declined("Careem Pay did not authorize the transfer")).contains("didn't approve"))
        #expect(CareemPay.friendlyError(.failed("Careem Pay did not authorize the transfer")).contains("didn't approve"))
        #expect(CareemPay.friendlyError(.transport("Failed to fetch")).contains("couldn't reach"))
        #expect(CareemPay.friendlyError(.failed("Failed to fetch")).contains("couldn't reach"))
        #expect(!CareemPay.friendlyError(.failed("-32602 something internal")).contains("32602"))
        let mismatch = CareemPay.friendlyError(.amountMismatch(CareemPayReceipt(status: "INSTANT_AUTHORIZED", transactionRef: "CP-123",
                                                                                amountMinor: 1, careemPayDeeplink: "")))
        #expect(mismatch.range(of: "different amount.*CP-123", options: .regularExpression) != nil)
    }

    private func ok(_ body: JSONValue, isError: Bool = false) throws -> JSONValue {
        let text = String(decoding: try PaydJSON.encoder.encode(body), as: UTF8.self)
        return ["jsonrpc": "2.0", "id": 1, "result": ["isError": .bool(isError), "content": [["type": "text", "text": .string(text)]]]]
    }

    private var receiptJSON: JSONValue {
        ["success": true, "status": "INSTANT_AUTHORIZED", "transaction_ref": "CP-123", "amount_minor": 9667,
         "careem_pay_deeplink": "careem://pay"]
    }

    @Test("accepts an authorized receipt for the exact amount")
    func acceptsReceipt() throws {
        guard case var .object(body) = receiptJSON else { return }
        body = body.setting("simulated", true)
        let r = try CareemPay.parseMCPResponse(httpOK: true, httpStatus: 200, body: try ok(.object(body)), requestedMinor: 9667)
        #expect(r.transactionRef == "CP-123")
        #expect(r.simulated)
    }

    @Test("treats isError tool results (HTTP 200) as declined, without charging")
    func isErrorDeclined() throws {
        let body: JSONValue = ["success": false, "error": "User confirmation required", "prompt": "Please confirm"]
        #expect(throws: CareemPayFailure.declined("User confirmation required")) {
            try CareemPay.parseMCPResponse(httpOK: true, httpStatus: 200, body: try ok(body, isError: true), requestedMinor: 9667)
        }
        #expect(CareemPay.friendlyError(.declined("User confirmation required")).contains("didn't approve"))
    }

    @Test("rejects HTTP errors, JSON-RPC errors, garbage and amount mismatches")
    func rejects() throws {
        #expect(throws: CareemPayFailure.failed("Careem Pay request failed (HTTP 403)")) {
            try CareemPay.parseMCPResponse(httpOK: false, httpStatus: 403, body: ["error": "Forbidden"], requestedMinor: 9667)
        }
        #expect(throws: CareemPayFailure.declined("nope")) {
            try CareemPay.parseMCPResponse(httpOK: true, httpStatus: 200, body: ["error": ["code": -32601, "message": "nope"]],
                                           requestedMinor: 9667)
        }
        #expect(throws: CareemPayFailure.declined("Careem Pay did not authorize the transfer")) {
            try CareemPay.parseMCPResponse(httpOK: true, httpStatus: 200, body: ["result": ["content": [["text": "not json"]]]],
                                           requestedMinor: 9667)
        }
        let mismatched = try ok(receiptJSON)
        #expect(throws: CareemPayFailure.amountMismatch(receipt)) {
            try CareemPay.parseMCPResponse(httpOK: true, httpStatus: 200, body: mismatched, requestedMinor: 100)
        }
    }

    @Test("tags, links and the MCP request body")
    func links() {
        #expect(CareemPay.tag(for: "Rahul Mehta") == "@rahulmehta.careem")
        #expect(CareemPay.tag(for: nil) == "@payd.careem")
        #expect(CareemPay.tag(for: "!!!") == "@payd.careem")
        #expect(CareemPay.payLink(tag: "@rahulmehta.careem", amountMinor: 9667)
            == "https://careem.me/pay?tag=%40rahulmehta.careem&amount=96.67&currency=AED")
        #expect(CareemPay.deeplink(tag: "@a.careem", phone: nil, amountMinor: 500) == "careem://pay/transfer?tag=%40a.careem&amount=5.00&currency=AED")
        #expect(CareemPay.deeplink(tag: "@a.careem", phone: "+971 50", amountMinor: 5) == "careem://pay/transfer?phone=%2B971%2050&amount=0.05&currency=AED")
        let body = CareemPay.mcpRequestBody(recipientTag: "@a.careem", recipientName: "Aisha", amountMinor: 500, note: "Hi", id: 7)
        #expect(body["method"] == "tools/call")
        #expect(body["params"]?["name"] == "careem_pay_settle_debt")
        #expect(body["params"]?["arguments"]?["confirmed_by_user"] == true)
        #expect(body["params"]?["arguments"]?["amountMinor"]?.intValue == 500)
        #expect(body["params"]?["arguments"]?["recipientName"] == "Aisha")
        let noName = CareemPay.mcpRequestBody(recipientTag: "@a", recipientName: "", amountMinor: 1, note: "", id: 1)
        #expect(noName["params"]?["arguments"]?["recipientName"] == nil)
    }
}
