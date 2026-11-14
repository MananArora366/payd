import Foundation

// Port of web/src/lib/ledger/balances.ts.
// Invariant 4: repayments are settlements, never expenses.
// Invariant 5: balances are always derived; soft-deleted transactions are excluded.

public struct PersonalSpend: Sendable, Equatable {
    public let totalSpentMinor: Int
    public let totalIncomeMinor: Int
    public var netSavingsMinor: Int { totalIncomeMinor - totalSpentMinor }
}

public enum Balances {
    /// A settlement must be positive and, unless overpayment is allowed, no larger than the debt.
    public static func isValidSettlement(_ amountMinor: Int, outstandingDebt: Int, allowOverpayment: Bool = false) -> Bool {
        guard amountMinor > 0 else { return false }
        return allowOverpayment || amountMinor <= outstandingDebt
    }

    /// Net balance per user. Positive = owed money (creditor); negative = owes money (debtor).
    public static func net(transactions: [Transaction], splits: [TransactionSplit], settlements: [Settlement],
                           seeding userIds: [String] = []) -> [String: Int] {
        var balances = Dictionary(uniqueKeysWithValues: Set(userIds).map { ($0, 0) })
        let splitsByTxn = Dictionary(grouping: splits, by: \.transactionId)

        for txn in transactions where !txn.isDeleted {
            let sign: Int
            switch txn.type {
            case .expense, .adjustment: sign = 1
            case .refund: sign = -1
            case .income, .transfer: continue
            }
            balances[txn.payerId, default: 0] += sign * txn.amountMinor
            for split in splitsByTxn[txn.id] ?? [] {
                balances[split.userId, default: 0] -= sign * split.shareMinor
            }
        }

        for settlement in settlements where settlement.status == .settled {
            balances[settlement.senderId, default: 0] += settlement.amountMinor
            balances[settlement.recipientId, default: 0] -= settlement.amountMinor
        }
        return balances
    }

    /// Pairwise debts: `result[debtor][creditor] = amount`, after deducting settled repayments.
    public static func bilateral(transactions: [Transaction], splits: [TransactionSplit],
                                 settlements: [Settlement]) -> [String: [String: Int]] {
        var debts: [String: [String: Int]] = [:]
        let splitsByTxn = Dictionary(grouping: splits, by: \.transactionId)

        for txn in transactions where !txn.isDeleted && txn.type == .expense {
            for split in splitsByTxn[txn.id] ?? [] where split.userId != txn.payerId && split.shareMinor != 0 {
                debts[split.userId, default: [:]][txn.payerId, default: 0] += split.shareMinor
            }
        }

        for settlement in settlements where settlement.status == .settled {
            guard let current = debts[settlement.senderId]?[settlement.recipientId] else { continue }
            let remaining = current - settlement.amountMinor
            debts[settlement.senderId]?[settlement.recipientId] = remaining > 0 ? remaining : nil
            if debts[settlement.senderId]?.isEmpty == true { debts[settlement.senderId] = nil }
        }
        return debts
    }

    /// A user's own consumption (their split shares, plus personal expenses they paid) and income.
    public static func personalSpend(userId: String, transactions: [Transaction], splits: [TransactionSplit]) -> PersonalSpend {
        let splitsByTxn = Dictionary(grouping: splits, by: \.transactionId)
        var spent = 0
        var income = 0

        for txn in transactions where !txn.isDeleted {
            if txn.type == .income && txn.payerId == userId {
                income += txn.amountMinor
            } else if txn.type == .expense {
                if let share = splitsByTxn[txn.id]?.first(where: { $0.userId == userId }) {
                    spent += share.shareMinor
                } else if txn.groupId == nil && txn.payerId == userId {
                    spent += txn.amountMinor
                }
            }
        }
        return PersonalSpend(totalSpentMinor: spent, totalIncomeMinor: income)
    }
}
