import Foundation

// Port of web/src/lib/ledger/balances.ts.
// Invariant 4: repayments are settlements, never expenses; a settlement cannot exceed the debt unless
// it is an explicit overpayment. Invariant 5: balances are derived; soft-deleted rows are ignored.

/// `PERSONAL_DEBT_BUCKET`: grouped-debts key for activity with no group.
public let personalDebtBucket = "__personal__"

public struct PersonalSpend: Sendable, Equatable {
    public let totalSpentMinor: Int
    public let totalIncomeMinor: Int
    public var netSavingsMinor: Int { totalIncomeMinor - totalSpentMinor }

    public init(totalSpentMinor: Int, totalIncomeMinor: Int) {
        self.totalSpentMinor = totalSpentMinor
        self.totalIncomeMinor = totalIncomeMinor
    }
}

/// What flows between two users inside one group (`groupId` nil = no group).
public struct PairDebtComponent: Sendable, Hashable {
    public let groupId: String?
    public let fromUserId: String
    public let toUserId: String
    public let amountMinor: Int

    public init(groupId: String?, fromUserId: String, toUserId: String, amountMinor: Int) {
        self.groupId = groupId
        self.fromUserId = fromUserId
        self.toUserId = toUserId
        self.amountMinor = amountMinor
    }
}

public struct SettlementValidationInput: Sendable {
    public let senderId: String
    public let recipientId: String
    public let amountMinor: Int
    public let groupId: String?
    public let allowOverpayment: Bool

    public init(senderId: String, recipientId: String, amountMinor: Int, groupId: String? = nil,
                allowOverpayment: Bool = false) {
        self.senderId = senderId
        self.recipientId = recipientId
        self.amountMinor = amountMinor
        self.groupId = groupId
        self.allowOverpayment = allowOverpayment
    }
}

public enum SettlementValidationResult: Sendable, Equatable {
    case ok(debtMinor: Int)
    case failure(reason: String, debtMinor: Int)

    public var isOK: Bool {
        if case .ok = self { return true }
        return false
    }

    public var debtMinor: Int {
        switch self {
        case let .ok(debt), let .failure(_, debt): return debt
        }
    }

    public var reason: String? {
        if case let .failure(reason, _) = self { return reason }
        return nil
    }
}

extension OrderedMap where Key == String, Value == OrderedMap<String, Int> {
    /// `addRaw`: ignores self-debts and zero amounts.
    mutating func addRaw(_ debtor: String, _ creditor: String, _ amount: Int) {
        guard debtor != creditor, amount != 0 else { return }
        var row = self[debtor] ?? OrderedMap<String, Int>()
        row.add(creditor, amount)
        set(debtor, row)
    }
}

public enum Balances {
    /// `validateSettlementAmount`.
    public static func isValidSettlementAmount(_ amountMinor: Int, debtMinor: Int, allowOverpayment: Bool = false) -> Bool {
        if amountMinor <= 0 { return false }
        if allowOverpayment { return true }
        return amountMinor <= debtMinor
    }

    private static func splitsByTransaction(_ splits: [TransactionSplit]) -> [String: [TransactionSplit]] {
        Dictionary(grouping: splits, by: \.transactionId)
    }

    /// `calculateNetBalances`. Positive = owed money (creditor); negative = owes money.
    public static func net(transactions: [Transaction], splits: [TransactionSplit], settlements: [Settlement],
                           seeding userIds: [String]? = nil) -> Shares {
        var balances = Shares()
        let initUser = { (balances: inout Shares, id: String) in
            if balances[id] == nil { balances.set(id, 0) }
        }
        for id in userIds ?? [] { initUser(&balances, id) }
        let byTxn = splitsByTransaction(splits)

        for txn in transactions where !txn.isDeleted {
            let sign: Int
            switch txn.type {
            case .expense, .adjustment: sign = 1
            case .refund: sign = -1
            case .income, .transfer: continue
            }
            initUser(&balances, txn.payerId)
            balances.add(txn.payerId, sign * txn.amountMinor)
            for split in byTxn[txn.id] ?? [] {
                initUser(&balances, split.userId)
                balances.add(split.userId, -sign * split.shareMinor)
            }
        }
        for settlement in settlements where settlement.status == .settled {
            initUser(&balances, settlement.senderId)
            initUser(&balances, settlement.recipientId)
            balances.add(settlement.senderId, settlement.amountMinor)
            balances.add(settlement.recipientId, -settlement.amountMinor)
        }
        return balances
    }

    /// `netPairs`: at most one positive direction per pair, first-seen order.
    private static func netPairs(_ raw: PairwiseDebtMap) -> PairwiseDebtMap {
        var out = PairwiseDebtMap()
        var seen = Set<String>()
        for (a, row) in raw {
            for b in row.keys {
                let key = jsLess(a, b) ? "\(a)\u{0}\(b)" : "\(b)\u{0}\(a)"
                guard seen.insert(key).inserted else { continue }
                let net = (raw[a]?[b] ?? 0) - (raw[b]?[a] ?? 0)
                if net > 0 { out.addRaw(a, b, net) } else if net < 0 { out.addRaw(b, a, -net) }
            }
        }
        return out
    }

    /// `directPairwiseDebts`.
    private static func directPairwiseDebts(_ transactions: [Transaction], _ splits: [TransactionSplit],
                                            _ settlements: [Settlement]) -> PairwiseDebtMap {
        var raw = PairwiseDebtMap()
        let byTxn = splitsByTransaction(splits)
        for txn in transactions where !txn.isDeleted {
            let isDebit = txn.type == .expense || txn.type == .adjustment
            let isRefund = txn.type == .refund
            guard isDebit || isRefund else { continue }
            for split in byTxn[txn.id] ?? [] where split.userId != txn.payerId {
                if isDebit { raw.addRaw(split.userId, txn.payerId, split.shareMinor) }
                else { raw.addRaw(txn.payerId, split.userId, split.shareMinor) }
            }
        }
        for settlement in settlements where settlement.status == .settled {
            raw.addRaw(settlement.recipientId, settlement.senderId, settlement.amountMinor)
        }
        return netPairs(raw)
    }

    /// `groupPairwiseDebts`: the group's simplified transfers; direct ledger if balances are corrupt.
    private static func groupPairwiseDebts(_ transactions: [Transaction], _ splits: [TransactionSplit],
                                           _ settlements: [Settlement]) -> PairwiseDebtMap {
        let balances = net(transactions: transactions, splits: splits, settlements: settlements)
        do {
            var out = PairwiseDebtMap()
            for debt in try DebtSimplifier.simplify(balances) { out.addRaw(debt.fromUserId, debt.toUserId, debt.amountMinor) }
            return out
        } catch {
            return directPairwiseDebts(transactions, splits, settlements)
        }
    }

    private static func bucket(_ groupId: String?) -> String { groupId.nonEmpty ?? personalDebtBucket }

    /// `calculateGroupedBilateralDebts`: group id (or `personalDebtBucket`) → pair debts.
    public static func groupedBilateral(transactions: [Transaction], splits: [TransactionSplit],
                                        settlements: [Settlement]) -> OrderedMap<String, PairwiseDebtMap> {
        var txnsBy = OrderedMap<String, [Transaction]>()
        var txnBucket: [String: String] = [:]
        for txn in transactions {
            let key = bucket(txn.groupId)
            txnBucket[txn.id] = key
            txnsBy.set(key, (txnsBy[key] ?? []) + [txn])
        }
        var splitsBy: [String: [TransactionSplit]] = [:]
        for split in splits {
            guard let key = txnBucket[split.transactionId] else { continue }
            splitsBy[key, default: []].append(split)
        }
        var settlementsBy = OrderedMap<String, [Settlement]>()
        for settlement in settlements {
            let key = bucket(settlement.groupId)
            settlementsBy.set(key, (settlementsBy[key] ?? []) + [settlement])
        }
        var out = OrderedMap<String, PairwiseDebtMap>()
        for key in (txnsBy.keys + settlementsBy.keys).uniqued() {
            let t = txnsBy[key] ?? [], sp = splitsBy[key] ?? [], st = settlementsBy[key] ?? []
            let debts = key == personalDebtBucket ? directPairwiseDebts(t, sp, st) : groupPairwiseDebts(t, sp, st)
            if !debts.isEmpty { out.set(key, debts) }
        }
        return out
    }

    /// `calculateBilateralDebts`: per-group debts aggregated and netted across groups.
    public static func bilateral(transactions: [Transaction], splits: [TransactionSplit],
                                 settlements: [Settlement]) -> PairwiseDebtMap {
        bilateral(fromGrouped: groupedBilateral(transactions: transactions, splits: splits, settlements: settlements))
    }

    static func bilateral(fromGrouped grouped: OrderedMap<String, PairwiseDebtMap>) -> PairwiseDebtMap {
        var raw = PairwiseDebtMap()
        for debts in grouped.values {
            for (debtor, row) in debts {
                for (creditor, amount) in row { raw.addRaw(debtor, creditor, amount) }
            }
        }
        return netPairs(raw)
    }

    /// `summarizeDebtSimplification`: transfers before (direct, per group) and after (unified model).
    public static func summarizeSimplification(transactions: [Transaction], splits: [TransactionSplit],
                                               settlements: [Settlement]) -> (beforeTransfers: Int, afterTransfers: Int) {
        var txnGroup: [String: String] = [:]
        var txnGroupOrder: [String] = []
        for txn in transactions {
            if txnGroup[txn.id] == nil { txnGroupOrder.append(txn.id) }
            txnGroup[txn.id] = bucket(txn.groupId)
        }
        let buckets = (txnGroupOrder.compactMap { txnGroup[$0] } + settlements.map { bucket($0.groupId) }).uniqued()
        var before = 0
        for key in buckets {
            let t = transactions.filter { bucket($0.groupId) == key }
            let sp = splits.filter { txnGroup[$0.transactionId] == key }
            let st = settlements.filter { bucket($0.groupId) == key }
            before += directPairwiseDebts(t, sp, st).values.reduce(0) { $0 + $1.count }
        }
        let after = bilateral(transactions: transactions, splits: splits, settlements: settlements)
            .values.reduce(0) { $0 + $1.count }
        return (before, after)
    }

    /// `getSignedPairDebt`: > 0 means `from` owes `to`, < 0 the reverse.
    public static func signedPairDebt(_ debts: PairwiseDebtMap?, from: String, to: String) -> Int {
        guard let debts else { return 0 }
        return (debts[from]?[to] ?? 0) - (debts[to]?[from] ?? 0)
    }

    /// `getPairDebtBreakdown`.
    public static func pairDebtBreakdown(_ grouped: OrderedMap<String, PairwiseDebtMap>, userA: String,
                                         userB: String) -> [PairDebtComponent] {
        grouped.compactMap { key, debts in
            let signed = signedPairDebt(debts, from: userA, to: userB)
            guard signed != 0 else { return nil }
            return PairDebtComponent(groupId: key == personalDebtBucket ? nil : key,
                                     fromUserId: signed > 0 ? userA : userB, toUserId: signed > 0 ? userB : userA,
                                     amountMinor: abs(signed))
        }
    }

    /// `checkSettlement`: pure validator with the web's plain-language messages.
    public static func checkSettlement(_ input: SettlementValidationInput, debtMinor: Int,
                                       senderName: String? = nil, recipientName: String? = nil,
                                       format: (Int) -> String = { Currency.format($0) }) -> SettlementValidationResult {
        let sender = senderName.nonEmpty ?? "The payer"
        let recipient = recipientName.nonEmpty ?? "the recipient"
        let isYou = sender == "You"
        let debt = max(0, debtMinor)
        if input.senderId.isEmpty || input.recipientId.isEmpty {
            return .failure(reason: "Choose who is paying and who is being paid.", debtMinor: debt)
        }
        if input.senderId == input.recipientId {
            return .failure(reason: "The payer and the recipient can't be the same person.", debtMinor: debt)
        }
        if input.amountMinor <= 0 {
            return .failure(reason: "Enter an amount greater than zero.", debtMinor: debt)
        }
        if !isValidSettlementAmount(input.amountMinor, debtMinor: debt, allowOverpayment: input.allowOverpayment) {
            let reason = debt == 0
                ? "\(sender) \(isYou ? "don't" : "doesn't") currently owe \(recipient) anything here. Record it as an advance payment if you still want to log it."
                : "That's more than the \(format(debt)) \(sender) \(isYou ? "owe" : "owes") \(recipient). Lower the amount or record the extra as an advance payment."
            return .failure(reason: reason, debtMinor: debt)
        }
        return .ok(debtMinor: debt)
    }

    /// `calculatePersonalSpend`.
    public static func personalSpend(userId: String, transactions: [Transaction], splits: [TransactionSplit]) -> PersonalSpend {
        let byTxn = splitsByTransaction(splits)
        var spent = 0
        var income = 0
        for txn in transactions where !txn.isDeleted {
            if txn.type == .income && txn.payerId == userId {
                income += txn.amountMinor
            } else if txn.type == .expense {
                if let share = byTxn[txn.id]?.first(where: { $0.userId == userId }) {
                    spent += share.shareMinor
                } else if txn.groupId.nonEmpty == nil && txn.payerId == userId {
                    spent += txn.amountMinor
                }
            }
        }
        return PersonalSpend(totalSpentMinor: spent, totalIncomeMinor: income)
    }
}
