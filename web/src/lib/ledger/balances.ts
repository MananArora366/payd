// Invariant 4: Repayments Are Settlements
// Repayments are recorded as settlements, never as expenses.
// A settlement cannot exceed the outstanding liability unless flagged as an explicit overpayment.

// Invariant 5: Audited & Derived Balances
// Balances are dynamically derived from active transactions, splits, and settlements.
// Soft-deleted transactions are excluded from calculations.

export interface TransactionRecord {
  id: string;
  type: 'expense' | 'income' | 'refund' | 'transfer' | 'adjustment';
  amount_minor: number;
  currency: string;
  payer_id: string;
  group_id?: string | null;
  deleted_at?: string | null;
}

export interface SplitRecord {
  transaction_id: string;
  user_id: string;
  share_minor: number;
}

export interface SettlementRecord {
  id: string;
  group_id?: string | null;
  sender_id: string;
  recipient_id: string;
  amount_minor: number;
  currency: string;
  status: 'outstanding' | 'partially_settled' | 'settled' | 'disputed';
  settled_at: string;
}

/**
 * Validates whether a settlement amount is allowed against an outstanding debt.
 */
export function validateSettlementAmount(
  amountMinor: number,
  currentDebtMinor: number,
  allowOverpayment: boolean = false
): boolean {
  if (amountMinor <= 0) return false;
  if (allowOverpayment) return true;
  return amountMinor <= currentDebtMinor;
}

/**
 * Derives net balances for all participants across transactions and settlements.
 * Positive (+) balance = user is owed money (creditor).
 * Negative (-) balance = user owes money (debtor).
 */
export function calculateNetBalances(
  transactions: TransactionRecord[],
  splits: SplitRecord[],
  settlements: SettlementRecord[],
  userFilter?: string[]
): Record<string, number> {
  const balances: Record<string, number> = {};

  const initUser = (uid: string) => {
    if (balances[uid] === undefined) {
      balances[uid] = 0;
    }
  };

  if (userFilter) {
    for (const uid of userFilter) initUser(uid);
  }

  // Map active splits by transaction_id
  const splitsByTxn: Record<string, SplitRecord[]> = {};
  for (const s of splits) {
    if (!splitsByTxn[s.transaction_id]) {
      splitsByTxn[s.transaction_id] = [];
    }
    splitsByTxn[s.transaction_id].push(s);
  }

  // 1. Process active (non-deleted) transactions
  for (const txn of transactions) {
    if (txn.deleted_at) continue; // Soft-deleted items are ignored

    if (txn.type === 'expense' || txn.type === 'adjustment') {
      initUser(txn.payer_id);
      // Payer paid the total amount
      balances[txn.payer_id] += txn.amount_minor;

      const txnSplits = splitsByTxn[txn.id] || [];
      for (const sp of txnSplits) {
        initUser(sp.user_id);
        // Each participant is debited their share
        balances[sp.user_id] -= sp.share_minor;
      }
    } else if (txn.type === 'refund') {
      // Refund reverses the effect: payer received money back
      initUser(txn.payer_id);
      balances[txn.payer_id] -= txn.amount_minor;

      const txnSplits = splitsByTxn[txn.id] || [];
      for (const sp of txnSplits) {
        initUser(sp.user_id);
        balances[sp.user_id] += sp.share_minor;
      }
    }
  }

  // 2. Process settlements (status === 'settled')
  for (const s of settlements) {
    if (s.status !== 'settled') continue;

    initUser(s.sender_id);
    initUser(s.recipient_id);

    // Sender paid money to recipient:
    // Sender gets a credit of +amount_minor towards their balance (clearing their debt)
    // Recipient balance decreases by -amount_minor (their credit was satisfied)
    balances[s.sender_id] += s.amount_minor;
    balances[s.recipient_id] -= s.amount_minor;
  }

  return balances;
}

/**
 * Calculates bilateral debts between specific pairs of users.
 * Returns: Map from debtorId -> Map of creditorId -> amountMinor.
 */
export function calculateBilateralDebts(
  transactions: TransactionRecord[],
  splits: SplitRecord[],
  settlements: SettlementRecord[]
): Map<string, Map<string, number>> {
  // bilateral[debtor][creditor] = amountMinor
  const debts = new Map<string, Map<string, number>>();

  const addDebt = (debtor: string, creditor: string, amount: number) => {
    if (debtor === creditor || amount === 0) return;
    if (!debts.has(debtor)) debts.set(debtor, new Map());
    const debtorMap = debts.get(debtor)!;
    debtorMap.set(creditor, (debtorMap.get(creditor) || 0) + amount);
  };

  // Group active splits by transaction
  const splitsByTxn: Record<string, SplitRecord[]> = {};
  for (const s of splits) {
    if (!splitsByTxn[s.transaction_id]) splitsByTxn[s.transaction_id] = [];
    splitsByTxn[s.transaction_id].push(s);
  }

  for (const txn of transactions) {
    if (txn.deleted_at) continue;
    if (txn.type !== 'expense') continue;

    const txnSplits = splitsByTxn[txn.id] || [];
    for (const split of txnSplits) {
      if (split.user_id !== txn.payer_id) {
        // Split participant owes payer
        addDebt(split.user_id, txn.payer_id, split.share_minor);
      }
    }
  }

  // Deduct settled repayments
  for (const s of settlements) {
    if (s.status !== 'settled') continue;
    // sender repaid recipient
    const debtorMap = debts.get(s.sender_id);
    if (debtorMap && debtorMap.has(s.recipient_id)) {
      const cur = debtorMap.get(s.recipient_id)!;
      const rem = cur - s.amount_minor;
      if (rem > 0) {
        debtorMap.set(s.recipient_id, rem);
      } else {
        debtorMap.delete(s.recipient_id);
      }
    }
  }

  return debts;
}

/**
 * Calculates personal spending, personal income, and net savings for a specific user.
 */
export function calculatePersonalSpend(
  userId: string,
  transactions: TransactionRecord[],
  splits: SplitRecord[]
): {
  totalSpentMinor: number;
  totalIncomeMinor: number;
  netSavingsMinor: number;
} {
  let totalSpentMinor = 0;
  let totalIncomeMinor = 0;

  const splitsByTxn: Record<string, SplitRecord[]> = {};
  for (const s of splits) {
    if (!splitsByTxn[s.transaction_id]) splitsByTxn[s.transaction_id] = [];
    splitsByTxn[s.transaction_id].push(s);
  }

  for (const txn of transactions) {
    if (txn.deleted_at) continue;

    if (txn.type === 'income' && txn.payer_id === userId) {
      totalIncomeMinor += txn.amount_minor;
    } else if (txn.type === 'expense') {
      const txnSplits = splitsByTxn[txn.id] || [];
      const userSplit = txnSplits.find((sp) => sp.user_id === userId);

      if (userSplit) {
        // User's actual liability for this expense
        totalSpentMinor += userSplit.share_minor;
      } else if (!txn.group_id && txn.payer_id === userId) {
        // Personal non-group expense where user paid all
        totalSpentMinor += txn.amount_minor;
      }
    }
  }

  return {
    totalSpentMinor,
    totalIncomeMinor,
    netSavingsMinor: totalIncomeMinor - totalSpentMinor,
  };
}
