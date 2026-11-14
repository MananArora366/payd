import Foundation
import OSLog
import PaydCore

/// The scan step of ReceiptScannerModal.tsx:244-291: POST /api/ai/receipt-scan on the configured server, falling
/// back to on-device Apple Vision OCR + `ReceiptTextParser` when the server is unreachable or has no OCR
/// (`ocr_unavailable`), just as the web server falls back to local-ocr.ts.
enum ReceiptScanService {
    static let unreadableFallback = "We couldn't read this receipt. Try a clearer photo or enter it manually."
    static let unreachableMessage = "We couldn't reach Payd Lens. Check your connection, or enter the receipt manually."

    private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "lens")

    /// The receipt, or the message to show with the "Try another photo" / "Enter manually" actions.
    static func scan(_ image: LensImage, api: PaydAPI, aiEnabled: Bool) async -> Result<ReceiptScanResult, LensScanFailure> {
        do {
            let response = try await api.receiptScan(ReceiptScanRequest(image: image.dataURL, mimeType: image.mimeType,
                                                                         aiEnabled: aiEnabled))
            guard let receipt = response.receipt else { return .failure(LensScanFailure(unreadableFallback)) }
            return .success(receipt)
        } catch {
            switch error {
            case let .http(_, _, code) where code == "ocr_unavailable":
                logger.info("Server has no OCR; scanning on device")
                return await scanOnDevice(image)
            case _ where error.isUnreachable:
                logger.info("Payd server unreachable; scanning on device")
                return await scanOnDevice(image)
            case let .http(_, message, _):
                return .failure(LensScanFailure(userMessage(message ?? unreadableFallback)))
            case .decoding, .offline, .network, .timeout:
                return .failure(LensScanFailure(unreadableFallback))
            }
        }
    }

    private static func scanOnDevice(_ image: LensImage) async -> Result<ReceiptScanResult, LensScanFailure> {
        let lines = await OnDeviceReceiptOCR.recognizeLines(in: image.data)
        do {
            return .success(try ReceiptTextParser.parseRawLines(lines, now: Date()))
        } catch {
            return .failure(LensScanFailure(userMessage(error.message)))
        }
    }

    /// The web shows the error text unless it looks like a transport/JSON failure (line 282).
    private static func userMessage(_ message: String) -> String {
        let lowered = message.lowercased()
        let looksTechnical = message.isEmpty || ["fetch", "network", "json"].contains(where: lowered.contains)
        return looksTechnical ? unreachableMessage : message
    }
}

struct LensScanFailure: Error {
    let message: String

    init(_ message: String) {
        self.message = message
    }
}
