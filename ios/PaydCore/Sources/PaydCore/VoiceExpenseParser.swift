import Foundation

/// A best-effort expense pulled from a spoken sentence, for the user to confirm.
public struct VoiceExpenseDraft: Sendable, Equatable {
    public let title: String
    /// nil when no usable amount was spoken.
    public let amountMinor: Int?
}

/// Offline parser for dictated expenses such as "coffee 22 dirhams" or "spent 45.50 on lunch".
/// The first number is the amount; currency words are dropped and filler words are trimmed
/// from the start and end of what remains, which becomes the title.
public enum VoiceExpenseParser {
    static let currencyWords: Set<String> = ["aed", "dirham", "dirhams", "dhs", "dh"]
    static let leadingFillers: Set<String> = ["i", "spent", "paid", "pay", "for", "on", "a", "an"]
    static let trailingFillers: Set<String> = ["for", "on"]

    public static func parse(_ text: String, currency: String = Currency.defaultCode) -> VoiceExpenseDraft {
        let tokens = text.split(whereSeparator: \.isWhitespace)
            .map { String($0).trimmingCharacters(in: CharacterSet(charactersIn: ".,!?;:")) }
            .filter { !$0.isEmpty }

        let amountIndex = tokens.firstIndex(where: isNumber)
        let amountMinor = amountIndex.flatMap { index -> Int? in
            let minor = Currency.parseMajorToMinor(normalizedNumber(tokens[index]), currency: currency)
            return minor > 0 ? minor : nil
        }

        var words = tokens.enumerated()
            .filter { $0.offset != amountIndex && !currencyWords.contains($0.element.lowercased()) }
            .map(\.element)
        while let first = words.first, leadingFillers.contains(first.lowercased()) { words.removeFirst() }
        while let last = words.last, trailingFillers.contains(last.lowercased()) { words.removeLast() }

        let title = words.joined(separator: " ")
        return VoiceExpenseDraft(title: title.prefix(1).uppercased() + title.dropFirst(), amountMinor: amountMinor)
    }

    private static func isNumber(_ token: String) -> Bool {
        token.first?.isASCII == true && token.first?.isNumber == true
            && token.allSatisfy { ($0.isASCII && $0.isNumber) || $0 == "." || $0 == "," }
    }

    /// "1,250" → "1250" (comma + 3 digits is grouping); "18,75" → "18.75" (decimal comma).
    private static func normalizedNumber(_ token: String) -> String {
        guard token.contains(",") else { return token }
        let groups = token.split(separator: ",", omittingEmptySubsequences: false)
        let isGrouping = groups.dropFirst().allSatisfy { $0.prefix(while: \.isNumber).count == 3 }
        return isGrouping ? token.replacingOccurrences(of: ",", with: "")
            : token.replacingOccurrences(of: ",", with: ".")
    }
}
