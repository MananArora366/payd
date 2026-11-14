import Foundation

// Port of the derived values in web/src/lib/store/PaydContext.tsx:577-777.

public struct UserReimbursementVelocity: Sendable, Hashable {
    public enum Tier: String, Sendable { case speedy, average, lagging, unknown }

    public let userId: String
    public let name: String
    public let avatarUrl: String?
    /// Average repayment lag in days; nil when there is no history.
    public let avgLagDays: Double?
    /// "3.5 days" or "n/a".
    public let avgLagLabel: String
    public let totalSettlementsCount: Int
    public let tier: Tier
    public let currentOwedMinor: Int
}

public struct CashFlowExposureMetrics: Sendable, Hashable {
    public let totalFrontedMinor: Int
    public let totalRecoveredMinor: Int
    public let outstandingExposureMinor: Int
    public let personalConsumptionMinor: Int
    public let topLaggingUser: UserReimbursementVelocity?
}

/// Everything PaydContext memoises, computed once per state change.
public struct LedgerSnapshot: Sendable {
    public let currentUser: User
    public let netBalances: Shares
    public let userNetBalance: Int
    public let groupedBilateralDebts: OrderedMap<String, PairwiseDebtMap>
    public let bilateralDebts: PairwiseDebtMap
    public let userOwedToMe: Int
    public let userIOwe: Int
    public let userSpending: PersonalSpend
    public let visibleGroups: [Group]
    public let reimbursementVelocities: [UserReimbursementVelocity]
    public let cashFlowExposure: CashFlowExposureMetrics
    public let simplification: (beforeTransfers: Int, afterTransfers: Int)
}

public enum LedgerQueries {
    private static let dayMillis = 86_400_000.0

    public static func snapshot(of state: LedgerState, now: Date) -> LedgerSnapshot {
        let current = currentUser(in: state)
        let net = Balances.net(transactions: state.transactions, splits: state.splits, settlements: state.settlements)
        let grouped = Balances.groupedBilateral(transactions: state.transactions, splits: state.splits,
                                                settlements: state.settlements)
        let bilateral = Balances.bilateral(fromGrouped: grouped)
        var owedToMe = 0
        var iOwe = 0
        for (debtor, row) in bilateral {
            if debtor == current.id { iOwe += row.total } else { owedToMe += row[current.id] ?? 0 }
        }
        let velocities = reimbursementVelocities(state, current: current, bilateral: bilateral, now: now)
        return LedgerSnapshot(
            currentUser: current,
            netBalances: net,
            userNetBalance: net[current.id] ?? 0,
            groupedBilateralDebts: grouped,
            bilateralDebts: bilateral,
            userOwedToMe: owedToMe,
            userIOwe: iOwe,
            userSpending: Balances.personalSpend(userId: current.id, transactions: state.transactions, splits: state.splits),
            visibleGroups: GroupLogic.filterGroupsForUser(state.groups, members: state.groupMembers, userId: current.id),
            reimbursementVelocities: velocities,
            cashFlowExposure: cashFlowExposure(state, current: current, velocities: velocities),
            simplification: Balances.summarizeSimplification(transactions: state.transactions, splits: state.splits,
                                                             settlements: state.settlements)
        )
    }

    /// The web's `currentUser`: the stored user with `currentUserId`, else the seed user (Manan),
    /// which is what PaydContext keeps when the saved id is unknown.
    public static func currentUser(in state: LedgerState) -> User {
        state.users.first { $0.id == state.currentUserId }
            ?? SeedData.users(now: PaydJSON.epoch)[0]
    }

    public static func user(_ id: String, in state: LedgerState) -> User? {
        state.users.first { $0.id == id }
    }

    public static func category(_ id: String?, in state: LedgerState) -> Category? {
        guard let id = id.nonEmpty else { return nil }
        return state.categories.first { $0.id == id }
    }

    public static func group(_ id: String?, in state: LedgerState) -> Group? {
        guard let id = id.nonEmpty else { return nil }
        return state.groups.first { $0.id == id }
    }

    /// `getGroupMembers` (users order).
    public static func groupMembers(_ groupId: String, in state: LedgerState) -> [User] {
        let ids = Set(state.groupMembers.filter { $0.groupId == groupId }.map(\.userId))
        return state.users.filter { ids.contains($0.id) }
    }

    /// `getGroupBalances`: net balances of the group's activity, seeded with every member.
    public static func groupBalances(_ groupId: String, in state: LedgerState) -> Shares {
        let txns = state.transactions.filter { $0.groupId == groupId }
        let txnIds = Set(txns.map(\.id))
        return Balances.net(transactions: txns, splits: state.splits.filter { txnIds.contains($0.transactionId) },
                            settlements: state.settlements.filter { $0.groupId == groupId },
                            seeding: state.groupMembers.filter { $0.groupId == groupId }.map(\.userId))
    }

    /// `getGroupSimplifiedDebts`: the group's pair debts, largest first (stable).
    public static func groupSimplifiedDebts(_ groupId: String, snapshot: LedgerSnapshot) -> [SimplifiedDebt] {
        guard let debts = snapshot.groupedBilateralDebts[groupId] else { return [] }
        let out = debts.flatMap { from, row in
            row.map { SimplifiedDebt(fromUserId: from, toUserId: $0.key, amountMinor: $0.value) }
        }
        return out.stableSorted { $0.amountMinor > $1.amountMinor }
    }

    /// `getPairwiseDebt`: what `from` owes `to` (>= 0), in a group or overall.
    public static func pairwiseDebt(from: String, to: String, groupId: String?, snapshot: LedgerSnapshot) -> Int {
        pairwiseDebt(from: from, to: to, groupId: groupId, grouped: snapshot.groupedBilateralDebts,
                     bilateral: snapshot.bilateralDebts)
    }

    static func pairwiseDebt(from: String, to: String, groupId: String?,
                             grouped: OrderedMap<String, PairwiseDebtMap>, bilateral: PairwiseDebtMap) -> Int {
        if from == to { return 0 }
        let debts: PairwiseDebtMap?
        if let groupId = groupId.nonEmpty { debts = grouped[groupId] } else { debts = bilateral }
        return max(0, Balances.signedPairDebt(debts, from: from, to: to))
    }

    public static func pairDebtBreakdown(_ a: String, _ b: String, snapshot: LedgerSnapshot) -> [PairDebtComponent] {
        Balances.pairDebtBreakdown(snapshot.groupedBilateralDebts, userA: a, userB: b)
    }

    /// `validateSettlement` (PaydContext.tsx:617-641).
    public static func validateSettlement(_ input: SettlementValidationInput, in state: LedgerState,
                                          snapshot: LedgerSnapshot) -> SettlementValidationResult {
        validateSettlement(input, in: state, grouped: snapshot.groupedBilateralDebts, bilateral: snapshot.bilateralDebts)
    }

    static func validateSettlement(_ input: SettlementValidationInput, in state: LedgerState,
                                   grouped: OrderedMap<String, PairwiseDebtMap>,
                                   bilateral: PairwiseDebtMap) -> SettlementValidationResult {
        let current = currentUser(in: state)
        let debt = pairwiseDebt(from: input.senderId, to: input.recipientId, groupId: input.groupId,
                                grouped: grouped, bilateral: bilateral)
        let nameOf = { (id: String) in id == current.id ? "You" : (user(id, in: state)?.name.nonEmpty ?? "Someone") }
        let senderName = nameOf(input.senderId)
        let recipientName = input.recipientId == current.id ? "you" : nameOf(input.recipientId)
        if let groupId = input.groupId.nonEmpty {
            guard let group = state.groups.first(where: { $0.id == groupId }) else {
                return .failure(reason: "That group doesn't exist any more.", debtMinor: debt)
            }
            let members = Set(state.groupMembers.filter { $0.groupId == groupId }.map(\.userId))
            if !input.senderId.isEmpty && !input.recipientId.isEmpty
                && (!members.contains(input.senderId) || !members.contains(input.recipientId)) {
                return .failure(reason: "Both people need to be members of \(group.name) to settle in it.", debtMinor: debt)
            }
        }
        if !input.senderId.isEmpty && user(input.senderId, in: state) == nil {
            return .failure(reason: "Choose who is paying.", debtMinor: debt)
        }
        if !input.recipientId.isEmpty && user(input.recipientId, in: state) == nil {
            return .failure(reason: "Choose who is being paid.", debtMinor: debt)
        }
        return Balances.checkSettlement(input, debtMinor: debt, senderName: senderName, recipientName: recipientName,
                                        format: { Currency.format($0, currency: "AED") })
    }

    public static func splits(for transactionId: String, in state: LedgerState) -> [TransactionSplit] {
        state.splits.filter { $0.transactionId == transactionId }
    }

    /// The user's overall monthly budget: `budgets.find(b => b.user_id === id && !b.category_id)`.
    public static func monthlyBudget(for userId: String, in state: LedgerState) -> Budget? {
        state.budgets.first { $0.userId == userId && $0.categoryId.nonEmpty == nil }
    }

    // MARK: - Analytics

    /// PaydContext.tsx:655-712. Only real history counts: expenses the current user fronted that the
    /// other person shared, and that person's repayments.
    static func reimbursementVelocities(_ state: LedgerState, current: User, bilateral: PairwiseDebtMap,
                                        now: Date) -> [UserReimbursementVelocity] {
        state.users.filter { $0.id != current.id }.map { other in
            let currentOwed = bilateral[other.id]?[current.id] ?? 0
            let shared = Set(state.splits.filter { $0.userId == other.id && $0.shareMinor > 0 }.map(\.transactionId))
            let fronted = state.transactions
                .filter { !$0.isDeleted && $0.type == .expense && $0.payerId == current.id && shared.contains($0.id) }
                .map { PaydJSON.epochMillis($0.occurredAt) }
                .stableSorted { $0 < $1 }
            let repayments = state.settlements.filter {
                $0.senderId == other.id && $0.recipientId == current.id && $0.status == .settled
            }
            var lags: [Double] = []
            for settlement in repayments {
                let settledMs = PaydJSON.epochMillis(settlement.settledAt)
                if let previous = fronted.last(where: { $0 <= settledMs }) {
                    lags.append(max(0, Double(settledMs - previous) / dayMillis))
                }
            }
            var avgLagDays: Double?
            if !lags.isEmpty {
                avgLagDays = PaydMath.jsRound(lags.reduce(0, +) / Double(lags.count) * 10) / 10
            } else if currentOwed > 0, let oldest = fronted.first {
                avgLagDays = PaydMath.jsRound(Double(PaydJSON.epochMillis(now) - oldest) / dayMillis * 10) / 10
            }
            let tier: UserReimbursementVelocity.Tier = avgLagDays.map { $0 <= 2.5 ? .speedy : $0 <= 7.0 ? .average : .lagging }
                ?? .unknown
            return UserReimbursementVelocity(
                userId: other.id, name: other.name, avatarUrl: other.avatarUrl, avgLagDays: avgLagDays,
                avgLagLabel: avgLagDays.map { "\(PaydMath.jsNumberString($0)) days" } ?? "n/a",
                totalSettlementsCount: repayments.count, tier: tier, currentOwedMinor: currentOwed)
        }
    }

    /// PaydContext.tsx:715-750.
    static func cashFlowExposure(_ state: LedgerState, current: User,
                                 velocities: [UserReimbursementVelocity]) -> CashFlowExposureMetrics {
        var fronted = 0
        var consumption = 0
        for txn in state.transactions where !txn.isDeleted && txn.type == .expense && txn.payerId == current.id {
            fronted += txn.amountMinor
            consumption += state.splits.first { $0.transactionId == txn.id && $0.userId == current.id }?.shareMinor ?? 0
        }
        let recovered = state.settlements
            .filter { $0.recipientId == current.id && $0.status == .settled }
            .reduce(0) { $0 + $1.amountMinor }
        let lagging = velocities.filter { $0.currentOwedMinor > 0 }
            .stableSorted { ($0.avgLagDays ?? -1) > ($1.avgLagDays ?? -1) }
        return CashFlowExposureMetrics(
            totalFrontedMinor: fronted, totalRecoveredMinor: recovered,
            outstandingExposureMinor: max(0, fronted - consumption - recovered),
            personalConsumptionMinor: consumption, topLaggingUser: lagging.first)
    }
}
