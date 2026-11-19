import Foundation
import PaydCore
import UIKit

/// Clipboard and WhatsApp sharing (web `navigator.clipboard.writeText` / `https://wa.me/?text=`).
enum ShareActions {
    @MainActor static func copy(_ text: String) {
        UIPasteboard.general.string = text
    }

    static func whatsAppURL(text: String) -> URL? {
        URL(string: "https://wa.me/?text=\(encodeURIComponent(text))")
    }
}
