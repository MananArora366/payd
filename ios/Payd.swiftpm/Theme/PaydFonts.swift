import CoreText
import OSLog
import SwiftUI
import UIKit

/// The web app's typefaces (web/src/app/globals.css), bundled from web/public/fonts:
/// PT Sans for body text (`.font-body`), DM Sans 600 for headings (`.font-heading`, not uppercased)
/// and Zen Dots for the wordmark (`.font-logo`).
enum PaydFonts {
    static let body = "PT Sans"
    static let heading = "DM Sans"
    static let logo = "Zen Dots"

    /// `.font-heading` letter-spacing: −0.01em.
    static let headingTrackingEm: CGFloat = -0.01
    /// `.font-logo` letter-spacing: 0.5px.
    static let logoTracking: CGFloat = 0.5

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
        // UIKit-drawn navigation titles use PT Sans Bold too
        if let title = UIFont(name: "PTSans-Bold", size: 17) {
            UINavigationBar.appearance().titleTextAttributes = [.font: title]
        }
    }

    /// The Dynamic Type style a fixed web size scales with.
    static func textStyle(for size: CGFloat) -> Font.TextStyle {
        switch size {
        case ..<11.5: .caption2
        case ..<13: .caption
        case ..<15: .footnote
        case ..<16.5: .callout
        case ..<19: .body
        case ..<21: .title3
        case ..<25: .title2
        case ..<31: .title
        default: .largeTitle
        }
    }
}

extension Font {
    /// PT Sans (`.font-body`). Only Regular 400 and Bold 700 exist, so web 500 is Regular and 600/700 Bold.
    static func payd(size: CGFloat, bold: Bool = false, italic: Bool = false) -> Font {
        let name = switch (bold, italic) {
        case (false, false): "PTSans-Regular"
        case (true, false): "PTSans-Bold"
        case (false, true): "PTSans-Italic"
        case (true, true): "PTSans-BoldItalic"
        }
        return .custom(name, size: size, relativeTo: PaydFonts.textStyle(for: size))
    }

    /// DM Sans weight 600 (`.font-heading`). Apply `.paydHeadingTracking(size:)` for the −0.01em spacing.
    static func paydHeading(size: CGFloat) -> Font {
        .custom(PaydFonts.heading, size: size, relativeTo: PaydFonts.textStyle(for: size)).weight(.semibold)
    }

    /// Zen Dots wordmark (`.font-logo`); pair with `.tracking(PaydFonts.logoTracking)`.
    static func paydLogo(size: CGFloat) -> Font {
        .custom(PaydFonts.logo, size: size, relativeTo: PaydFonts.textStyle(for: size))
    }
}

extension View {
    /// `.font-heading` at `size` including its −0.01em letter-spacing.
    func paydHeadingFont(size: CGFloat) -> some View {
        font(.paydHeading(size: size)).tracking(PaydFonts.headingTrackingEm * size)
    }
}
