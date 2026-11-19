import Foundation

// JavaScript semantics the web code relies on: stable sorts, first-occurrence dedupe,
// UTF-16 string ordering, `trim()`, `encodeURIComponent` and JS-flavoured regexes.

extension Sequence {
    /// Stable sort regardless of stdlib behaviour (ties keep their original order),
    /// like `Array.prototype.sort`. Port `(a, b) => x` as `stableSorted { cmp($0, $1) < 0 }`.
    public func stableSorted(by areInIncreasingOrder: (Element, Element) -> Bool) -> [Element] {
        enumerated()
            .sorted { lhs, rhs in
                if areInIncreasingOrder(lhs.element, rhs.element) { return true }
                if areInIncreasingOrder(rhs.element, lhs.element) { return false }
                return lhs.offset < rhs.offset
            }
            .map(\.element)
    }
}

extension Sequence where Element: Hashable {
    /// `[...new Set(items)]`: removes duplicates, keeping first-occurrence order.
    public func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}

/// JS string comparison (`a < b`, default `sort()`): UTF-16 code unit order.
func jsLess(_ lhs: String, _ rhs: String) -> Bool {
    lhs.utf16.lexicographicallyPrecedes(rhs.utf16)
}

/// Characters JS `String.prototype.trim` and `\s` treat as white space.
let jsWhitespace: Set<Character> = [
    "\u{0009}", "\u{000A}", "\u{000B}", "\u{000C}", "\u{000D}", "\u{0020}", "\u{00A0}", "\u{1680}",
    "\u{2000}", "\u{2001}", "\u{2002}", "\u{2003}", "\u{2004}", "\u{2005}", "\u{2006}", "\u{2007}",
    "\u{2008}", "\u{2009}", "\u{200A}", "\u{2028}", "\u{2029}", "\u{202F}", "\u{205F}", "\u{3000}",
    "\u{FEFF}", "\r\n",
]

extension String {
    /// `s.trim()`.
    var jsTrimmed: String { jsTrimmedStart.jsTrimmedEnd }

    /// `s.trimStart()`.
    var jsTrimmedStart: String { String(drop(while: { jsWhitespace.contains($0) })) }

    /// `s.trimEnd()`.
    var jsTrimmedEnd: String {
        var end = endIndex
        while end > startIndex {
            let previous = index(before: end)
            guard jsWhitespace.contains(self[previous]) else { break }
            end = previous
        }
        return String(self[startIndex..<end])
    }

    /// JS `s.length` (UTF-16 code units).
    var jsLength: Int { utf16.count }

    /// `s.slice(0, n)` measured in UTF-16 code units, never splitting a character.
    func jsPrefix(_ count: Int) -> String {
        guard count > 0 else { return "" }
        var result = ""
        var used = 0
        for character in self {
            let width = character.utf16.count
            guard used + width <= count else { break }
            result.append(character)
            used += width
        }
        return result
    }

    /// `name.split(' ')` (single-space separator, empty pieces kept).
    var jsSpaceSplit: [String] {
        split(separator: " ", omittingEmptySubsequences: false).map(String.init)
    }

    /// `s.charAt(0).toUpperCase() + s.slice(1)`.
    var jsCapitalizedFirst: String {
        guard let first else { return self }
        return first.uppercased() + dropFirst()
    }

    /// Non-empty string or nil (JS `value || null`).
    var nonEmpty: String? { isEmpty ? nil : self }
}

extension Optional where Wrapped == String {
    /// `value || null` for optional strings.
    var nonEmpty: String? { self?.nonEmpty }
}

/// `encodeURIComponent`: leaves `A-Z a-z 0-9 - _ . ! ~ * ' ( )` and percent-encodes every other
/// UTF-8 byte with uppercase hex.
public func encodeURIComponent(_ text: String) -> String {
    let unreserved = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()".utf8)
    var output = ""
    for byte in text.utf8 {
        if unreserved.contains(byte) {
            output.append(Character(UnicodeScalar(byte)))
        } else {
            output += String(format: "%%%02X", byte)
        }
    }
    return output
}

/// `decodeURIComponent`, returning nil where JS would throw (malformed escape or bad UTF-8).
func decodeURIComponent(_ text: String) -> String? {
    text.removingPercentEncoding
}

// MARK: - JS-flavoured regular expressions

/// A regex match: `groups[0]` is the whole match, `nil` for groups that did not take part.
struct JSMatch {
    let groups: [String?]
    /// UTF-16 range of the whole match.
    let range: NSRange

    subscript(index: Int) -> String? { index < groups.count ? groups[index] : nil }
}

/// NSRegularExpression with JavaScript (non-unicode-mode) semantics for the constructs the
/// web regexes use: `\d \w \s \b` are ASCII/JS sets, `$` is end-of-input, `.` excludes only
/// JS line terminators. Patterns are copied verbatim from the web files.
struct JSRegex: @unchecked Sendable {
    private let regex: NSRegularExpression?

    init(_ pattern: String, _ flags: String = "") {
        var options: NSRegularExpression.Options = []
        if flags.contains("i") { options.insert(.caseInsensitive) }
        regex = try? NSRegularExpression(pattern: JSRegex.translate(pattern), options: options)
    }

    /// True when the pattern compiled (checked by tests for every pattern in PaydCore).
    var isValid: Bool { regex != nil }

    func test(_ text: String) -> Bool { firstMatch(text) != nil }

    func firstMatch(_ text: String) -> JSMatch? {
        guard let regex else { return nil }
        let ns = text as NSString
        return regex.firstMatch(in: text, range: NSRange(location: 0, length: ns.length))
            .map { JSRegex.wrap($0, in: ns) }
    }

    func matches(_ text: String) -> [JSMatch] {
        guard let regex else { return [] }
        let ns = text as NSString
        return regex.matches(in: text, range: NSRange(location: 0, length: ns.length))
            .map { JSRegex.wrap($0, in: ns) }
    }

    /// `text.replace(re, fn)`; `global` = the `g` flag (otherwise only the first match).
    func replacing(in text: String, global: Bool = true, with transform: (JSMatch) -> String) -> String {
        let found = global ? matches(text) : firstMatch(text).map { [$0] } ?? []
        guard !found.isEmpty else { return text }
        let ns = text as NSString
        var output = ""
        var cursor = 0
        for match in found {
            output += ns.substring(with: NSRange(location: cursor, length: match.range.location - cursor))
            output += transform(match)
            cursor = match.range.location + match.range.length
        }
        output += ns.substring(from: cursor)
        return output
    }

    /// `text.replace(re, 'literal')`.
    func replacing(in text: String, global: Bool = true, with literal: String) -> String {
        replacing(in: text, global: global) { _ in literal }
    }

    /// Index (UTF-16) of the first match, like `String.prototype.search`; -1 when none.
    func search(_ text: String) -> Int { firstMatch(text)?.range.location ?? -1 }

    private static func wrap(_ result: NSTextCheckingResult, in text: NSString) -> JSMatch {
        let groups = (0..<result.numberOfRanges).map { index -> String? in
            let range = result.range(at: index)
            return range.location == NSNotFound ? nil : text.substring(with: range)
        }
        return JSMatch(groups: groups, range: result.range)
    }

    private static let wordClass = "A-Za-z0-9_"
    private static let spaceClass =
        "\\t\\n\\x{0B}\\f\\r \\x{A0}\\x{1680}\\x{2000}-\\x{200A}\\x{2028}\\x{2029}\\x{202F}\\x{205F}\\x{3000}\\x{FEFF}"

    /// Rewrites JS escapes whose ICU meaning differs.
    static func translate(_ pattern: String) -> String {
        var output = ""
        var inClass = false
        var characters = Array(pattern)[...]
        while let character = characters.popFirst() {
            if character == "\\", let next = characters.popFirst() {
                output += translateEscape(next, inClass: inClass)
                continue
            }
            switch character {
            case "[" where !inClass:
                inClass = true
                output.append(character)
                if characters.first == "^" { output.append(characters.removeFirst()) }
                if characters.first == "]" { output += "\\]"; characters.removeFirst() }
            case "]" where inClass:
                inClass = false
                output.append(character)
            case "$" where !inClass:
                output += "\\z"
            case "." where !inClass:
                output += "[^\\n\\r\\x{2028}\\x{2029}]"
            default:
                output.append(character)
            }
        }
        return output
    }

    private static func translateEscape(_ escaped: Character, inClass: Bool) -> String {
        switch (escaped, inClass) {
        case ("d", true): return "0-9"
        case ("d", false): return "[0-9]"
        case ("D", false): return "[^0-9]"
        case ("w", true): return wordClass
        case ("w", false): return "[\(wordClass)]"
        case ("W", false): return "[^\(wordClass)]"
        case ("s", true): return spaceClass
        case ("s", false): return "[\(spaceClass)]"
        case ("S", false): return "[^\(spaceClass)]"
        case ("b", false):
            return "(?:(?<=[\(wordClass)])(?![\(wordClass)])|(?<![\(wordClass)])(?=[\(wordClass)]))"
        case ("B", false):
            return "(?:(?<=[\(wordClass)])(?=[\(wordClass)])|(?<![\(wordClass)])(?![\(wordClass)]))"
        default: return "\\\(escaped)"
        }
    }

    /// `s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`.
    static func escape(_ text: String) -> String {
        let special: Set<Character> = [".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"]
        return text.map { special.contains($0) ? "\\\($0)" : String($0) }.joined()
    }
}
