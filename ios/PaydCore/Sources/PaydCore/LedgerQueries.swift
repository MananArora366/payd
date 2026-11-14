import Foundation

// Port of the derived values in web/src/lib/store/PaydContext.tsx (getGroupBalances,
// getGroupSimplifiedDebts, getGroupMembers, owed-to-me / I-owe totals).

public struct OwedSummary: Sendable, Equatable {
    public let owedToMeMinor: Int
    public let iOweMinor: Int
}

public enum LedgerQueries {
    public static func user(_ id: String, in state: LedgerState) -> User? {
        state.users.first { $0.id == id }
    }

    public static func category(_ id: String?, in state: LedgerState) -> Category? {
        guard let id else { return nil }
        return state.categories.first { $0.id == id }
    }

    public static func groupMembers(_ groupId: String, in state: LedgerState) -> [User] {
        let ids = Set(state.groupMembers.filter { $0.groupId == groupId }.map(\.userId))
        return state.users.filter { ids.contains($0.id) }
    }

    /// Groups the given user belongs to.
    public static func groups(for userId: String, in state: LedgerState) -> [Group] {
        let ids = Set(state.groupMembers.filter { $0.userId == userId }.map(\.groupId))
        return state.groups.filter { ids.contains($0.id) }
    }

    public static func groupBalances(_ groupId: String, in state: LedgerState) -> [String: Int] {
        let txns = state.transactions.filter { $0.groupId == groupId }
        let txnIds = Set(txns.map(\.id))
        return Balances.net(
            transactions: txns,
            splits: state.splits.filter { txnIds.contains($0.transactionId) },
            settlements: state.settlements.filter { $0.groupId == groupId },
            seeding: state.groupMembers.filter { $0.groupId == groupId }.map(\.userId)
        )
    }

    public static func simplifiedDebts(_ groupId: String, in state: LedgerState) -> [SimplifiedDebt] {
        DebtSimplifier.simplify(groupBalances(groupId, in: state))
    }

    public static func owedSummary(for userId: String, in state: LedgerState) -> OwedSummary {
        let debts = Balances.bilateral(transactions: state.transactions, splits: state.splits, settlements: state.settlements)
        let owedToMe = debts.filter { $0.key != userId }.compactMap { $0.value[userId] }.reduce(0, +)
        let iOwe = debts[userId]?.values.reduce(0, +) ?? 0
        return OwedSummary(owedToMeMinor: owedToMe, iOweMinor: iOwe)
    }

    public static func personalSpend(for userId: String, in state: LedgerState) -> PersonalSpend {
        Balances.personalSpend(userId: userId, transactions: state.transactions, splits: state.splits)
    }

    /// Active (non-deleted) transactions involving the user, newest first.
    public static func activity(for userId: String, in state: LedgerState) -> [Transaction] {
        let involved = Set(state.splits.filter { $0.userId == userId }.map(\.transactionId))
        return state.transactions
            .filter { !$0.isDeleted && ($0.payerId == userId || involved.contains($0.id)) }
            .sorted { $0.occurredAt > $1.occurredAt }
    }

    public static func splits(for transactionId: String, in state: LedgerState) -> [TransactionSplit] {
        state.splits.filter { $0.transactionId == transactionId }
    }
}
