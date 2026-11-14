import CoreText
import OSLog
import SwiftUI
import UIKit

/// The web app's typefaces (web/src/app/globals.css), bundled from web/public/fonts:
/// PT Sans for body text (`.font-body`), DM Sans for uppercase headings (`.font-heading`)
/// and Zen Dots for the wordmark (`.font-logo`).
enum PaydFonts {
    static let body = "PT Sans"
    static let heading = "DM Sans"
    static let logo = "Zen Dots"

    private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "fonts")

    /// Registers every bundled TTF for this process. Call once at launch, before any view renders.
    static func register() {
        let urls = Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? []
        if urls.isEmpty { logger.error("No bundled fonts found; falling back to system fonts") }
        for url in urls {
            var error: Unmanaged<CFError>?
            if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) {
                let reason = error?.takeRetainedValue().localizedDescription ?? "unknown error"
                logger.error("Could not register \(url.lastPathComponent, privacy: .public): \(reason, privacy: .public)")
            }
        }
        // UIKit-drawn navigation titles (sheet headers) use PT Sans Bold too
        if let title = UIFont(name: "PTSans-Bold", size: 17) {
            UINavigationBar.appearance().titleTextAttributes = [.font: title]
        }
    }

    /// Point sizes of Apple's default text styles, so custom fonts keep the same scale and Dynamic Type.
    static func size(for style: Font.TextStyle) -> CGFloat {
        switch style {
        case .largeTitle: 34
        case .title: 28
        case .title2: 22
        case .title3: 20
        case .headline, .body: 17
        case .callout: 16
        case .subheadline: 15
        case .footnote: 13
        case .caption: 12
        case .caption2: 11
        @unknown default: 17
        }
    }
}

extension Font {
    /// PT Sans at a system text style's size, scaling with Dynamic Type.
    static func payd(_ style: TextStyle) -> Font {
        .custom(PaydFonts.body, size: PaydFonts.size(for: style), relativeTo: style)
    }

    /// PT Sans at a fixed size (scaled relative to `.body`).
    static func payd(size: CGFloat) -> Font {
        .custom(PaydFonts.body, size: size, relativeTo: .body)
    }

    /// DM Sans Bold for uppercase, tracked headings.
    static func paydHeading(_ style: TextStyle) -> Font {
        .custom(PaydFonts.heading, size: PaydFonts.size(for: style), relativeTo: style).weight(.bold)
    }

    static func paydLogo(size: CGFloat) -> Font {
        .custom(PaydFonts.logo, size: size, relativeTo: .title)
    }
}
