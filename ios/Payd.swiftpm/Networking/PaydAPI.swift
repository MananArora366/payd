import Foundation
import OSLog
import PaydCore

/// Failure of a call to the Payd web server.
enum PaydAPIError: Error, Equatable {
    /// No server address configured.
    case offline
    /// Transport failure (unreachable, DNS, TLS, cancelled).
    case network(String)
    case timeout
    /// The server answered non-2xx (or `success: false`); message/code come from the body when present.
    case http(status: Int, message: String?, code: String?)
    case decoding(String)

    var isUnreachable: Bool {
        switch self {
        case .offline, .network, .timeout: true
        case .http, .decoding: false
        }
    }
}

/// Client for the web app's API routes on a configurable base URL. Never sends an API key (the web
/// client never does either); AI providers are configured on the server.
struct PaydAPI: Sendable {
    let baseURL: URL?

    private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "api")
    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: configuration)
    }()

    /// POST /api/ai/interpret.
    func interpret(_ body: InterpretRequest) async throws(PaydAPIError) -> InterpretResponse {
        let (data, status) = try await send("POST", "/api/ai/interpret", body: try encode(body), timeout: 20)
        let response: InterpretResponse? = decodeIfPossible(data)
        guard (200..<300).contains(status), let response, response.success, response.intent != nil else {
            throw .http(status: status, message: response?.error ?? Self.errorField(data), code: nil)
        }
        return response
    }

    /// POST /api/ai/query.
    func query(_ body: QueryRequest) async throws(PaydAPIError) -> QueryResponse {
        let (data, status) = try await send("POST", "/api/ai/query", body: try encode(body), timeout: 20)
        let response: QueryResponse? = decodeIfPossible(data)
        guard (200..<300).contains(status), let response, response.success, response.answer != nil else {
            throw .http(status: status, message: response?.error ?? Self.errorField(data), code: nil)
        }
        return response
    }

    /// POST /api/ai/receipt-scan.
    func receiptScan(_ body: ReceiptScanRequest) async throws(PaydAPIError) -> ReceiptScanResponse {
        let (data, status) = try await send("POST", "/api/ai/receipt-scan", body: try encode(body), timeout: 60)
        guard (200..<300).contains(status) else {
            let json = JSONValue.parse(data)
            throw .http(status: status, message: json?["error"]?.stringValue, code: json?["code"]?.stringValue)
        }
        let response: ReceiptScanResponse
        do {
            response = try PaydJSON.decoder.decode(ReceiptScanResponse.self, from: data)
        } catch {
            throw .decoding(String(describing: error))
        }
        guard response.success, response.receipt != nil else {
            throw .http(status: status, message: response.error, code: response.code)
        }
        return response
    }

    /// GET /api/careem/events → the pending events (lenient decode, invalid items skipped).
    func careemEvents() async throws(PaydAPIError) -> [CareemEvent] {
        let (data, status) = try await send("GET", "/api/careem/events", body: nil, timeout: 10, noStore: true)
        guard (200..<300).contains(status) else {
            throw .http(status: status, message: Self.errorField(data), code: nil)
        }
        // useCareemEvents.ts:66 — a body without an `events` array is ignored, keeping the current state.
        guard let json = JSONValue.parse(data), json["events"]?.arrayValue != nil else {
            throw .decoding("Careem events body has no events array")
        }
        return CareemEvents.decodePending(json)
    }

    /// POST /api/careem/events/<id> (useCareemEvents.ts:106-125). Never throws.
    func decideCareemEvent(id: String, decision: CareemDecision) async -> CareemDecideResult {
        do {
            let body = try encode(CareemDecisionBody(decision: decision))
            let (_, status) = try await send("POST", "/api/careem/events/\(encodeURIComponent(id))",
                                             body: body, timeout: 10, noStore: true)
            if (200..<300).contains(status) { return .ok }
            if status == 409 { return .alreadyDecided }
            if status == 404 { return .notFound }
            return .server
        } catch {
            return .network
        }
    }

    /// POST /api/mcp JSON-RPC `careem_pay_settle_debt` (CareemPayModal.tsx:28-56).
    func careemPaySettle(recipientTag: String, recipientName: String?, amountMinor: Int,
                         note: String) async throws(CareemPayFailure) -> CareemPayReceipt {
        let rpc = CareemPay.mcpRequestBody(recipientTag: recipientTag, recipientName: recipientName,
                                           amountMinor: amountMinor, note: note,
                                           id: PaydJSON.epochMillis(Date()))
        let data: Data
        let status: Int
        do {
            (data, status) = try await send("POST", "/api/mcp", body: try encode(rpc), timeout: 20)
        } catch {
            throw .transport(error == .offline ? "Network request failed" : Self.describe(error))
        }
        return try CareemPay.parseMCPResponse(httpOK: (200..<300).contains(status), httpStatus: status,
                                              body: JSONValue.parse(data), requestedMinor: amountMinor)
    }

    // MARK: - Transport

    private func send(_ method: String, _ path: String, body: Data?, timeout: TimeInterval,
                      noStore: Bool = false) async throws(PaydAPIError) -> (Data, Int) {
        guard let baseURL, let url = URL(string: baseURL.absoluteString + path) else { throw .offline }
        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if noStore { request.setValue("no-store", forHTTPHeaderField: "Cache-Control") }
        request.httpBody = body
        do {
            let (data, response) = try await Self.session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw PaydAPIError.network("Not an HTTP response") }
            return (data, http.statusCode)
        } catch let error as PaydAPIError {
            throw error
        } catch let error as URLError where error.code == .timedOut {
            Self.logger.error("\(method, privacy: .public) \(path, privacy: .public) timed out")
            throw .timeout
        } catch {
            Self.logger.error("\(method, privacy: .public) \(path, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
            throw .network(error.localizedDescription)
        }
    }

    private func encode(_ value: some Encodable) throws(PaydAPIError) -> Data {
        do {
            return try PaydJSON.encoder.encode(value)
        } catch {
            throw .decoding(String(describing: error))
        }
    }

    private func decodeIfPossible<T: Decodable>(_ data: Data) -> T? {
        try? PaydJSON.decoder.decode(T.self, from: data)
    }

    private static func errorField(_ data: Data) -> String? {
        JSONValue.parse(data)?["error"]?.stringValue
    }

    private static func describe(_ error: PaydAPIError) -> String {
        switch error {
        case .offline: "Network request failed"
        case let .network(message): message
        case .timeout: "Network timeout"
        case let .http(status, message, _): message ?? "HTTP \(status)"
        case let .decoding(message): message
        }
    }
}
