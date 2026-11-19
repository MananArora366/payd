import Foundation

// Port of web/src/components/modals/careemPaySettle.ts and web/src/lib/mcp/careemPayLink.ts.
// Order is fixed (never charge first and validate later): validate → charge (only without an earlier
// successful charge) → record. A failed ledger write after a charge keeps the receipt so a retry only
// re-records and never re-charges.

/// Receipt returned by the `careem_pay_settle_debt` MCP tool.
public struct CareemPayReceipt: Codable, Sendable, Hashable {
    public let success: Bool
    public let status: String
    public let transactionRef: String
    public let amountMinor: Int
    public let careemPayDeeplink: String
    /// True for the sandbox mock: no real money moved.
    public let simulated: Bool

    enum CodingKeys: String, CodingKey {
        case success, status, transactionRef = "transaction_ref", amountMinor = "amount_minor"
        case careemPayDeeplink = "careem_pay_deeplink", simulated
    }

    public init(success: Bool = true, status: String, transactionRef: String, amountMinor: Int,
                careemPayDeeplink: String, simulated: Bool = false) {
        self.success = success
        self.status = status
        self.transactionRef = transactionRef
        self.amountMinor = amountMinor
        self.careemPayDeeplink = careemPayDeeplink
        self.simulated = simulated
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        success = try c.decode(Bool.self, forKey: .success)
        status = try c.decode(String.self, forKey: .status)
        transactionRef = try c.decode(String.self, forKey: .transactionRef)
        amountMinor = try c.decode(Int.self, forKey: .amountMinor)
        careemPayDeeplink = try c.decodeIfPresent(String.self, forKey: .careemPayDeeplink) ?? ""
        simulated = try c.decodeIfPresent(Bool.self, forKey: .simulated) ?? false
    }
}

/// `CareemPayOutcome`.
public enum CareemPayOutcome: Sendable, Equatable {
    /// Validation failed; nobody was charged.
    case invalid(message: String)
    /// The charge failed or was declined; nobody was charged.
    case chargeFailed(message: String)
    /// Charged and recorded.
    case recorded(receipt: CareemPayReceipt)
    /// Charged, but the ledger write failed. Keep `receipt` and retry recording only.
    case chargedNotRecorded(receipt: CareemPayReceipt, message: String)
}

/// Why a charge failed. Messages are internal; show `CareemPay.friendlyError(_:)`.
public enum CareemPayFailure: Error, Sendable, Equatable {
    /// `CareemPayAmountMismatchError`: Careem Pay authorised something other than requested.
    case amountMismatch(CareemPayReceipt)
    /// `CareemPayDeclinedError`: Careem Pay (or the MCP tool) refused the request.
    case declined(String)
    /// The server could not be reached (network / timeout).
    case transport(String)
    /// Any other failure, e.g. a non-2xx response ("Careem Pay request failed (HTTP 403)").
    case failed(String)
}

public enum CareemPay {
    private static let nonAlphanumeric = JSRegex("[^a-z0-9]")

    /// `careemPayTag`: "Rahul Mehta" → "@rahulmehta.careem".
    public static func tag(for name: String?) -> String {
        let handle = nonAlphanumeric.replacing(in: (name.nonEmpty ?? "payd").lowercased(), with: "")
        return "@\(handle.nonEmpty ?? "payd").careem"
    }

    /// `careemPayLink`: shareable web link for a Careem Pay request.
    public static func payLink(tag: String, amountMinor: Int) -> String {
        "https://careem.me/pay?tag=\(encodeURIComponent(tag))&amount=\(Currency.filsToAedString(amountMinor))&currency=AED"
    }

    /// `careemPayDeeplink`: in-app link to the Careem Pay transfer screen (phone wins over tag).
    public static func deeplink(tag: String?, phone: String?, amountMinor: Int) -> String {
        let who = phone.nonEmpty.map { "phone=\(encodeURIComponent($0))" } ?? "tag=\(encodeURIComponent(tag ?? ""))"
        return "careem://pay/transfer?\(who)&amount=\(Currency.filsToAedString(amountMinor))&currency=AED"
    }

    /// `parseCareemPayResponse`: the receipt only if Careem Pay authorised exactly `requestedMinor` fils.
    /// Tool errors arrive as HTTP 200 with `result.isError`; transport/protocol errors as non-2xx or a
    /// JSON-RPC `error`.
    public static func parseMCPResponse(httpOK: Bool, httpStatus: Int, body: JSONValue?,
                                        requestedMinor: Int) throws(CareemPayFailure) -> CareemPayReceipt {
        guard httpOK, let data = body, data.isTruthy else {
            throw .failed("Careem Pay request failed (HTTP \(httpStatus))")
        }
        if let error = data["error"], error.isTruthy {
            let message = error["message"].flatMap { $0.isTruthy ? $0.jsString : nil }
            throw .declined(message ?? "Careem Pay request was rejected")
        }
        let text = data["result"]?["content"]?[0]?["text"]?.stringValue
        let parsed = text.flatMap { JSONValue.parse(Data($0.utf8)) }
        let isError = data["result"]?["isError"]?.isTruthy ?? false
        guard !isError, let tool = parsed, tool.isTruthy, tool["success"] == .bool(true) else {
            let message = parsed?["error"].flatMap { $0.isTruthy ? $0.jsString : nil }
            throw .declined(message ?? "Careem Pay did not authorize the transfer")
        }
        guard tool["status"]?.stringValue == "INSTANT_AUTHORIZED",
              let reference = tool["transaction_ref"]?.stringValue else {
            throw .declined("Careem Pay did not authorize the transfer")
        }
        let amount = tool["amount_minor"]?.intValue
        let deeplink = tool["careem_pay_deeplink"].flatMap { $0.isTruthy ? $0.jsString : nil } ?? ""
        let receipt = CareemPayReceipt(success: true, status: "INSTANT_AUTHORIZED", transactionRef: reference,
                                       amountMinor: amount ?? 0, careemPayDeeplink: deeplink,
                                       simulated: tool["simulated"] == .bool(true))
        if amount != requestedMinor { throw .amountMismatch(receipt) }
        return receipt
    }

    private static let networkPattern = JSRegex("failed to fetch|network|load failed|timeout|ECONN", "i")
    private static let declinedPattern = JSRegex("authori[sz]e|declin", "i")

    /// `friendlyCareemPayError`: plain-language message for a failed charge.
    public static func friendlyError(_ failure: CareemPayFailure) -> String {
        let unreachable = "We couldn't reach Careem Pay. Check your connection and try again. You have not been charged."
        let notApproved = "Careem Pay didn't approve the transfer. You have not been charged."
        switch failure {
        case let .amountMismatch(receipt):
            return "Careem Pay returned a different amount than requested (ref \(receipt.transactionRef)), "
                + "so Payd did not record it. Check your Careem Pay activity before trying again."
        case .transport:
            return unreachable
        case let .declined(message):
            return networkPattern.test(message) ? unreachable : notApproved
        case let .failed(message):
            if networkPattern.test(message) { return unreachable }
            if declinedPattern.test(message) { return notApproved }
            return "Careem Pay could not complete the transfer. You have not been charged. Please try again."
        }
    }

    /// `friendlyRecordWarning`: the ledger write failed after a successful charge.
    public static func friendlyRecordWarning(_ receipt: CareemPayReceipt) -> String {
        "Your Careem Pay transfer went through (ref \(receipt.transactionRef)), but Payd couldn't save it to your "
            + "balances yet. Tap \"Retry saving\" — you won't be charged again."
    }

    /// `runCareemPaySettlement`. With `priorReceipt`, validation and charging are skipped and only the
    /// ledger write is retried.
    public static func run(validate: () -> SettlementValidationResult,
                           charge: () async throws(CareemPayFailure) -> CareemPayReceipt,
                           record: (CareemPayReceipt) throws -> Void,
                           priorReceipt: CareemPayReceipt?) async -> CareemPayOutcome {
        let receipt: CareemPayReceipt
        if let priorReceipt {
            receipt = priorReceipt
        } else {
            if let reason = validate().reason { return .invalid(message: reason) }
            do {
                receipt = try await charge()
            } catch {
                return .chargeFailed(message: friendlyError(error))
            }
        }
        do {
            try record(receipt)
        } catch {
            return .chargedNotRecorded(receipt: receipt, message: friendlyRecordWarning(receipt))
        }
        return .recorded(receipt: receipt)
    }

    /// The JSON-RPC body POSTed to `/api/mcp` (CareemPayModal.tsx:34-52). Only called after the user
    /// pressed Settle, so `confirmed_by_user` is true. Sends schema fields only.
    public static func mcpRequestBody(recipientTag: String, recipientName: String?, amountMinor: Int,
                                      note: String, id: Int) -> JSONValue {
        var arguments: [(String, JSONValue)] = [("recipientTag", .string(recipientTag))]
        if let name = recipientName.nonEmpty { arguments.append(("recipientName", .string(name.jsPrefix(100)))) }
        arguments += [
            ("amountMinor", .number(Decimal(amountMinor))),
            ("note", .string(note.jsPrefix(300))),
            ("confirmed_by_user", .bool(true)),
        ]
        return [
            "jsonrpc": "2.0",
            "id": .number(Decimal(id)),
            "method": "tools/call",
            "params": ["name": "careem_pay_settle_debt", "arguments": .object(OrderedMap(arguments))],
        ]
    }
}
