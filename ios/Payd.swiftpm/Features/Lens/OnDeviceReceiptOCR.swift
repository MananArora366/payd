import Foundation
import ImageIO
import OSLog
import Vision

/// On-device Apple Vision OCR: the iOS equivalent of the server fallback in web/src/lib/ai/local-ocr.ts and
/// web/scripts/ocr.swift (same request settings, same orientation retry, same downscale threshold).
enum OnDeviceReceiptOCR {
    private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "lens")
    /// local-ocr.ts:54 — images over 1 MB are downscaled to 1400 px first.
    private static let downscaleThresholdBytes = 1024 * 1024
    private static let downscaleMaxPixels = 1400
    /// ocr.swift:43 — fewer lines than this and the other orientations are tried.
    private static let minimumLines = 5

    /// Recognised text lines; empty when the image can't be read (the parser then reports it as unreadable,
    /// exactly like the server's `status: 'failed'` path).
    static func recognizeLines(in data: Data) async -> [String] {
        await Task.detached(priority: .userInitiated) { recognizeSync(data) }.value
    }

    private static func recognizeSync(_ data: Data) -> [String] {
        guard let image = loadImage(data) else {
            logger.error("Lens OCR could not decode the image")
            return []
        }
        var best = recognize(image, orientation: .up)
        if best.count < minimumLines {
            for orientation in [CGImagePropertyOrientation.right, .down, .left] {
                let candidate = recognize(image, orientation: orientation)
                if candidate.count > best.count { best = candidate }
            }
        }
        return best
    }

    /// Decodes with the EXIF orientation applied, downscaling large files.
    private static func loadImage(_ data: Data) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        let width = properties?[kCGImagePropertyPixelWidth] as? Int ?? 0
        let height = properties?[kCGImagePropertyPixelHeight] as? Int ?? 0
        let longest = max(width, height)
        guard longest > 0 else { return CGImageSourceCreateImageAtIndex(source, 0, nil) }
        let maxPixels = data.count > downscaleThresholdBytes ? min(longest, downscaleMaxPixels) : longest
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }

    private static func recognize(_ image: CGImage, orientation: CGImagePropertyOrientation) -> [String] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.automaticallyDetectsLanguage = true
        let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
        do {
            try handler.perform([request])
        } catch {
            logger.error("Lens OCR failed: \(error.localizedDescription, privacy: .public)")
            return []
        }
        return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    }
}
