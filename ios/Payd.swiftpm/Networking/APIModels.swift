import Foundation
import PaydCore

// Request/response bodies of the web's API routes (web/src/app/api/**). Keys are explicit.

/// POST /api/ai/interpret (app/api/ai/interpret/route.ts).
struct InterpretRequest: Encodable, Sendable {
    let transcript: String
    let context: InterpretContext
    let aiEnabled: Bool

    enum CodingKeys: String, CodingKey { case transcript, context, aiEnabled }
}

struct InterpretResponse: Decodable, Sendable {
    let success: Bool
    let provider: String?
    let model: String?
    let intent: VoiceIntent?
    let error: String?

    enum CodingKeys: String, CodingKey { case success, provider, model, intent, error }
}

/// POST /api/ai/query (app/api/ai/query/route.ts).
struct QueryRequest: Encodable, Sendable {
    let query: String
    let dataContext: QueryDataContext
    let aiEnabled: Bool

    enum CodingKeys: String, CodingKey { case query, dataContext, aiEnabled }
}

struct QueryResponse: Decodable, Sendable {
    let success: Bool
    let provider: String?
    let model: String?
    let answer: String?
    let error: String?

    enum CodingKeys: String, CodingKey { case success, provider, model, answer, error }
}

/// POST /api/ai/receipt-scan (app/api/ai/receipt-scan/route.ts).
struct ReceiptScanRequest: Encodable, Sendable {
    /// `data:image/jpeg;base64,…`
    let image: String
    let mimeType: String
    let aiEnabled: Bool

    enum CodingKeys: String, CodingKey { case image, mimeType, aiEnabled }
}

struct ReceiptScanResponse: Decodable, Sendable {
    let success: Bool
    let receipt: ReceiptScanResult?
    let error: String?
    let code: String?

    enum CodingKeys: String, CodingKey { case success, receipt, error, code }
}

/// POST /api/careem/events/<id> body (useCareemEvents.ts).
enum CareemDecision: String, Encodable, Sendable {
    case split, dismiss
}

/// useCareemEvents.ts:106-125 outcomes.
enum CareemDecideResult: Equatable, Sendable {
    case ok, alreadyDecided, notFound, network, server
}

struct CareemDecisionBody: Encodable, Sendable {
    let decision: CareemDecision

    enum CodingKeys: String, CodingKey { case decision }
}
