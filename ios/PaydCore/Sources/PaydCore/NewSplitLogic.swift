import Foundation

// Port of web/src/components/modals/newSplitLogic.ts and the `formatRemaining` helper in NewSplitModal.tsx.
// Validates a "New split" draft and builds the input for `LedgerActions.addTransaction`. Percentages and
// share counts are fixed-point integers scaled by `Splits.weightScale`, so no Double enters a split.

/// `NewSplitDraft`. `values` holds the raw per-person text: an amount for `.exact`, a percent for
/// `.percentage`, a share count for `.shares`; ignored for `.equal`.
public struct NewSplitDraft: Sendable, Hashable {
    public let title: String
    /// Raw user text like "120.50".
    public let amountInput: String
    public let payerId: String
    public let groupId: String?
    /// People sharing the cost (may include the payer).
    public let participantIds: [String]
    public let method: SplitMethod
    public let values: [String: String]
    public let notes: String?
    public let categoryId: String?

    public init(title: String, amountInput: String, payerId: String, groupId: String? = nil,
                participantIds: [String], method: SplitMethod = .equal, values: [String: String] = [:],
                notes: String? = nil, categoryId: String? = nil) {
        self.title = title
        self.amountInput = amountInput
        self.payerId = payerId
        self.groupId = groupId
        self.participantIds = participantIds
        self.method = method
        self.values = values
        self.notes = notes
        self.categoryId = categoryId
    }
}

/// `remainingForMethod` result: fils left for `.exact`, percent left (scaled by 1e6) for `.percentage`.
public enum Remaining: Sendable, Equatable {
    case amount(minor: Int)
    case percent(scaled: Int)
}

public enum NewSplitLogic {
    /// `MAX_WEIGHT_DECIMALS`.
    static let maxWeightDecimals = 6

    private static let numberPattern = JSRegex("^(?:\\d+(?:\\.\\d*)?|\\.\\d+)$")
    private static let onlyYourself = "Add at least one other person. A split with only yourself isn't a split."
    private static let inexact = "We couldn't split this amount exactly. Please check the numbers."

    private static func format(_ minor: Int) -> String { Currency.format(minor, currency: Currency.ledgerCode) }

    private static func uniqueParticipants(_ draft: NewSplitDraft) -> [String] {
        draft.participantIds.filter { !$0.isEmpty }.uniqued()
    }

    /// `parseWeight`: strict non-negative decimal → scaled weight, with the web's messages.
    private static func parseWeight(_ raw: String?, label: String) -> Result<Int, ParseError> {
        let s = (raw ?? "").jsTrimmed
        if s.isEmpty { return .failure(ParseError("Enter \(label), or remove them from the split.")) }
        if !numberPattern.test(s) { return .failure(ParseError("\"\(s)\" isn't a valid number for \(label).")) }
        let parts = s.split(separator: ".", omittingEmptySubsequences: false)
        if parts.count > 1 && parts[1].count > maxWeightDecimals {
            return .failure(ParseError("Use at most \(maxWeightDecimals) decimal places for \(label)."))
        }
        guard let scaled = Splits.parseScaledWeight(s) else {
            return .failure(ParseError("\"\(s)\" isn't a valid number for \(label)."))
        }
        return .success(scaled)
    }

    /// `lenientNumber` in the scaled domain: invalid or empty counts as 0; extra decimals round half-up.
    private static func lenientScaled(_ raw: String?) -> Int {
        let s = (raw ?? "").jsTrimmed
        guard numberPattern.test(s) else { return 0 }
        let parts = s.split(separator: ".", omittingEmptySubsequences: false)
        let fraction = parts.count > 1 ? String(parts[1]) : ""
        guard fraction.count > maxWeightDecimals else { return Splits.parseScaledWeight(s) ?? 0 }
        let kept = String(parts[0]) + "." + String(fraction.prefix(maxWeightDecimals))
        let roundUp = Array(fraction)[maxWeightDecimals] >= "5"
        return (Splits.parseScaledWeight(kept) ?? 0) + (roundUp ? 1 : 0)
    }

    /// `computeShares`: shares only for people who owe something (zero-weight people are dropped).
    private static func computeShares(_ totalMinor: Int, participantIds: [String], draft: NewSplitDraft,
                                      nameOf: (String) -> String) -> Result<Shares, ParseError> {
        if participantIds.isEmpty { return .failure(ParseError("Pick at least one person to split with.")) }
        var owing = participantIds
        let shares: Shares
        do {
            switch draft.method {
            case .equal:
                if totalMinor < participantIds.count {
                    return .failure(ParseError(
                        "\(format(totalMinor)) is too small to split between \(participantIds.count) people. Someone would owe nothing."))
                }
                shares = try Splits.equal(totalMinor, among: participantIds)
            case .exact:
                var allocations = Shares()
                for uid in participantIds {
                    let raw = (draft.values[uid] ?? "").jsTrimmed
                    if raw.isEmpty {
                        return .failure(ParseError("Enter an amount for \(nameOf(uid)), or remove them from the split."))
                    }
                    switch AddExpenseLogic.parseAmountInput(raw, label: "amount for \(nameOf(uid))") {
                    case let .failure(error): return .failure(error)
                    case let .success(value): allocations.set(uid, value)
                    }
                }
                let sum = allocations.total
                if sum != totalMinor {
                    let diff = totalMinor - sum
                    return .failure(ParseError(
                        "Per-person amounts add up to \(format(sum)), but the total is \(format(totalMinor)) (\(diff > 0 ? "short by" : "over by") \(format(abs(diff))))."))
                }
                shares = try Splits.exact(totalMinor, allocations: allocations)
            case .percentage, .shares:
                let isPercent = draft.method == .percentage
                var weights: [String: Int] = [:]
                for uid in participantIds {
                    let label = isPercent ? "a percentage for \(nameOf(uid))" : "shares for \(nameOf(uid))"
                    switch parseWeight(draft.values[uid], label: label) {
                    case let .failure(error): return .failure(error)
                    case let .success(value): weights[uid] = value
                    }
                }
                owing = participantIds.filter { (weights[$0] ?? 0) > 0 }
                if isPercent {
                    let scaled = participantIds.reduce(0) { $0 + (weights[$1] ?? 0) }
                    if abs(scaled - 100 * Splits.weightScale) > Splits.percentageSumToleranceScaled {
                        let shown = PaydMath.jsNumberString(Decimal(scaled) / Decimal(Splits.weightScale))
                        return .failure(ParseError("Percentages add up to \(shown)%, but they need to add up to 100%."))
                    }
                }
                if owing.isEmpty {
                    return .failure(ParseError(isPercent
                        ? "Give at least one person a percentage above 0."
                        : "Give at least one person more than 0 shares."))
                }
                let nonZero = Shares(owing.map { ($0, weights[$0] ?? 0) })
                shares = isPercent
                    ? try Splits.percentage(totalMinor, scaledPercentages: nonZero)
                    : try Splits.shares(totalMinor, scaledWeights: nonZero)
            }
        } catch {
            return .failure(ParseError(AddExpenseLogic.friendlyError(error.message)))
        }

        let zero = owing.filter { (shares[$0] ?? 0) <= 0 }
        if !zero.isEmpty {
            return .failure(ParseError(
                "\(zero.map(nameOf).joined(separator: ", ")) would owe nothing with this split. Remove them from the split or adjust the amounts."))
        }
        let result = Shares(owing.map { ($0, shares[$0] ?? 0) })
        if result.total != totalMinor { return .failure(ParseError(inexact)) }
        return .success(result)
    }

    /// `buildNewSplit`: validates the draft and builds the `addTransaction` input (type expense,
    /// currency AED, payment method left nil so the action defaults it to "Card"). Never throws.
    public static func build(_ draft: NewSplitDraft, nameOf: ((String) -> String)? = nil) -> Result<NewTransaction, ParseError> {
        let name = nameOf ?? { $0 }
        let title = draft.title.jsTrimmed
        if title.isEmpty { return .failure(ParseError("Give this split a name, like \"Dinner\" or \"Groceries\".")) }

        let totalMinor: Int
        switch AddExpenseLogic.parseAmountInput(draft.amountInput) {
        case let .failure(error): return .failure(error)
        case let .success(value): totalMinor = value
        }
        if draft.payerId.isEmpty { return .failure(ParseError("Choose who paid.")) }

        let participantIds = uniqueParticipants(draft)
        if participantIds.isEmpty { return .failure(ParseError("Pick at least one person to split with.")) }
        if Set(participantIds + [draft.payerId]).count < 2 { return .failure(ParseError(onlyYourself)) }

        let shares: Shares
        switch computeShares(totalMinor, participantIds: participantIds, draft: draft, nameOf: name) {
        case let .failure(error): return .failure(error)
        case let .success(value): shares = value
        }
        let splits = participantIds.compactMap { uid in shares[uid].map { ShareAllocation(userId: uid, shareMinor: $0) } }
        if Set(splits.map(\.userId) + [draft.payerId]).count < 2 { return .failure(ParseError(onlyYourself)) }
        if splits.reduce(0, { $0 + $1.shareMinor }) != totalMinor { return .failure(ParseError(inexact)) }

        let notes = (draft.notes ?? "").jsTrimmed
        return .success(NewTransaction(
            type: .expense, title: title, amountMinor: totalMinor, currency: Currency.ledgerCode,
            categoryId: draft.categoryId, payerId: draft.payerId, groupId: draft.groupId,
            notes: notes.isEmpty ? nil : notes, splits: splits))
    }

    /// `previewNewSplit`: each owing participant's share, or empty when the draft can't be computed yet.
    public static func preview(_ draft: NewSplitDraft) -> Shares {
        guard case let .success(total) = AddExpenseLogic.parseAmountInput(draft.amountInput) else { return Shares() }
        let computed = computeShares(total, participantIds: uniqueParticipants(draft), draft: draft, nameOf: { $0 })
        return (try? computed.get()) ?? Shares()
    }

    /// `remainingForMethod`: exact = total minus entered fils; percentage = 100 % minus the entered
    /// percents (scaled); nil for equal and shares.
    public static func remaining(_ draft: NewSplitDraft) -> Remaining? {
        let participantIds = uniqueParticipants(draft)
        switch draft.method {
        case .exact:
            let total = AddExpenseLogic.previewMinor(draft.amountInput)
            let entered = participantIds.reduce(0) { $0 + AddExpenseLogic.previewMinor(draft.values[$1] ?? "") }
            return .amount(minor: total - entered)
        case .percentage:
            let sum = participantIds.reduce(0) { $0 + lenientScaled(draft.values[$1]) }
            return .percent(scaled: 100 * Splits.weightScale - sum)
        case .equal, .shares:
            return nil
        }
    }

    /// NewSplitModal.tsx `formatRemaining`: "AED 10.00 left to assign", "0.01% over", "Adds up to 100%".
    public static func formatRemaining(_ remaining: Remaining) -> String {
        switch remaining {
        case let .amount(minor):
            if minor == 0 { return "All of the amount is assigned" }
            let shown = format(abs(minor))
            return minor > 0 ? "\(shown) left to assign" : "\(shown) over"
        case let .percent(scaled):
            if scaled == 0 { return "Adds up to 100%" }
            // `Number(abs.toFixed(2))`: round half-up to hundredths, printed like a JS number.
            let hundredths = (abs(scaled) + 5_000) / 10_000
            let shown = "\(PaydMath.jsNumberString(Decimal(hundredths) / 100))%"
            return scaled > 0 ? "\(shown) left to assign" : "\(shown) over"
        }
    }
}
