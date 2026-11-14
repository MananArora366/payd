import ImageIO
import UIKit
import UniformTypeIdentifiers

/// Photo encoding for Payd Lens (web canvas `toDataURL('image/jpeg', 0.92)` in ReceiptScannerModal.tsx:177-204 and
/// LensCameraViewer.tsx:143-158).
enum ReceiptImageCoder {
    static let jpegQuality: CGFloat = 0.92

    /// Upright JPEG 0.92 of `image` (EXIF orientation baked into the pixels, never mirrored).
    static func jpeg(_ image: UIImage) -> LensImage? {
        let upright = render(size: image.size) { _ in image.draw(in: CGRect(origin: .zero, size: image.size)) }
        guard let data = upright.jpegData(compressionQuality: jpegQuality),
              let preview = UIImage(data: data) else { return nil }
        return LensImage(data: data, mimeType: "image/jpeg", preview: preview)
    }

    /// Rotates by ±90° and re-encodes as JPEG 0.92 (handleRotateImage).
    static func rotated(_ image: LensImage, degrees: Int) -> LensImage? {
        let source = image.preview
        let quarterTurn = abs(degrees) % 180 == 90
        let size = quarterTurn ? CGSize(width: source.size.height, height: source.size.width) : source.size
        let turned = render(size: size) { context in
            let cg = context.cgContext
            cg.translateBy(x: size.width / 2, y: size.height / 2)
            cg.rotate(by: CGFloat(degrees) * .pi / 180)
            source.draw(in: CGRect(x: -source.size.width / 2, y: -source.size.height / 2,
                                   width: source.size.width, height: source.size.height))
        }
        guard let data = turned.jpegData(compressionQuality: jpegQuality),
              let preview = UIImage(data: data) else { return nil }
        return LensImage(data: data, mimeType: "image/jpeg", preview: preview)
    }

    /// An uploaded photo keeps its original bytes and type, like the web's FileReader data URL.
    static func uploaded(_ data: Data, contentType: UTType?) -> LensImage? {
        guard let preview = UIImage(data: data) else { return nil }
        let mime = contentType?.preferredMIMEType ?? sniffedMIMEType(data) ?? "image/jpeg"
        return LensImage(data: data, mimeType: mime, preview: preview)
    }

    /// Whether the picked item is an image at all (`file.type.startsWith('image/')`).
    static func isImage(_ contentType: UTType?) -> Bool {
        contentType.map { $0.conforms(to: .image) } ?? true
    }

    private static func sniffedMIMEType(_ data: Data) -> String? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let identifier = CGImageSourceGetType(source) as String? else { return nil }
        return UTType(identifier)?.preferredMIMEType
    }

    private static func render(size: CGSize, _ draw: (UIGraphicsImageRendererContext) -> Void) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image(actions: draw)
    }
}
