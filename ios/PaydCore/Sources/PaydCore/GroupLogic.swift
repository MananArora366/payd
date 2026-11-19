import Foundation

// Port of web/src/components/groups/groupLogic.ts plus `extractJoinToken` (PaydContext.tsx:80-91).

public enum GroupLogic {
    private static let joinSearch = JSRegex("\\/join\\/", "i")
    private static let joinCapture = JSRegex("\\/join\\/([^/?#\\s]+)", "i")
    private static let queryOrHash = JSRegex("[?#]")
    private static let trailingSlashes = JSRegex("\\/+$")

    private static func stripQueryAndSlashes(_ raw: String) -> String {
        let cut = queryOrHash.search(raw)
        let head = cut >= 0 ? (raw as NSString).substring(to: cut) : raw
        return trailingSlashes.replacing(in: head, global: false, with: "")
    }

    /// `extractInviteToken` (groupLogic.ts:18-34).
    public static func extractInviteToken(_ input: String) -> String {
        var raw = input.jsTrimmed
        if raw.isEmpty { return "" }
        let joinIndex = joinSearch.search(raw)
        if joinIndex >= 0 { raw = (raw as NSString).substring(from: joinIndex + "/join/".count) }
        raw = stripQueryAndSlashes(raw)
        if joinIndex >= 0 { raw = raw.jsSpaceSplitOn("/") }
        return (decodeURIComponent(raw) ?? raw).jsTrimmed
    }

    /// `extractJoinToken` (PaydContext.tsx:81-91), used by `joinGroupByToken`.
    public static func extractJoinToken(_ input: String) -> String {
        var raw = input.jsTrimmed
        if raw.isEmpty { return "" }
        if let token = joinCapture.firstMatch(raw)?[1] { raw = token }
        raw = stripQueryAndSlashes(raw)
        return (decodeURIComponent(raw) ?? raw).jsTrimmed
    }

    /// Exact group id, or a demo token (same rules as joinGroupByToken); nil otherwise.
    public static func resolveInviteGroup(_ token: String, groups: [Group]) -> Group? {
        let t = extractInviteToken(token)
        if t.isEmpty { return nil }
        if let byId = groups.first(where: { $0.id == t }) { return byId }
        switch t {
        case "dubai-marina-2026": return groups.first { $0.name.contains("Flatmates") }
        case "hatta-camp-2026": return groups.first { $0.name.contains("Hatta") }
        default: return nil
        }
    }

    /// Groups the user belongs to, preserving order.
    public static func filterGroupsForUser(_ groups: [Group], members: [GroupMember], userId: String) -> [Group] {
        let mine = Set(members.filter { $0.userId == userId }.map(\.groupId))
        return groups.filter { mine.contains($0.id) }
    }

    /// A healthy group ledger sums to 0.
    public static func sumBalances(_ balances: Shares) -> Int { balances.total }

    /// `parseAmountInput` (groupLogic variant). Never throws.
    public static func parseAmountInput(_ input: String) -> Result<Int, ParseError> {
        let trimmed = input.jsTrimmed
        if trimmed.isEmpty { return .failure(ParseError("Please enter an amount.")) }
        switch Currency.tryParseMajorToMinor(trimmed, currency: "AED") {
        case let .failure(error):
            return .failure(ParseError(error.message.isEmpty ? "Please enter a valid amount." : error.message))
        case let .success(value):
            if value < 0 { return .failure(ParseError("Amount cannot be negative.")) }
            if value == 0 { return .failure(ParseError("Please enter an amount greater than AED 0.")) }
            return .success(value)
        }
    }

    /// Fils of debt that earn one extra roulette slice (AED 25).
    public static let rouletteFilsPerExtraSlice = 2500
    public static let rouletteMaxExtraSlices = 10

    public enum RouletteMode: String, Sendable { case debtWeighted = "debt_weighted", equal }

    /// Everyone gets 1; debt-weighted adds +1 per AED 25 owed to the group, capped at +10.
    public static func rouletteWeights(userIds: [String], groupBalances: Shares,
                                       mode: RouletteMode) -> [(userId: String, weight: Int)] {
        userIds.map { userId in
            if mode == .equal { return (userId, 1) }
            let net = groupBalances[userId] ?? 0
            let extra = net < 0
                ? min(rouletteMaxExtraSlices, (abs(net) + rouletteFilsPerExtraSlice - 1) / rouletteFilsPerExtraSlice)
                : 0
            return (userId, 1 + extra)
        }
    }

    /// Weighted index for a random number in [0, 1); -1 for no weights.
    public static func pickWeightedIndex(_ weights: [Int], rand01: Double) -> Int {
        let total = weights.reduce(0, +)
        if weights.isEmpty || total <= 0 { return -1 }
        let target = rand01 * Double(total)
        var accumulated = 0
        for (index, weight) in weights.enumerated() {
            accumulated += weight
            if target < Double(accumulated) { return index }
        }
        return weights.count - 1
    }
}

private extension String {
    /// `s.split(sep)[0]`.
    func jsSpaceSplitOn(_ separator: Character) -> String {
        split(separator: separator, omittingEmptySubsequences: false).first.map(String.init) ?? ""
    }
}
