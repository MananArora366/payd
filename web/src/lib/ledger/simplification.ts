// Min-Cash-Flow Greedy Bipartition Debt Simplification
// Minimizes the number of transactions needed to settle all debts in a group.

export interface SimplifiedDebt {
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
}

/**
 * Simplifies net balances into the minimal number of direct settlements.
 * Guaranteed to terminate and preserve zero-sum invariant.
 */
export function simplifyDebts(netBalances: Record<string, number>): SimplifiedDebt[] {
  // Separate into debtors (< 0) and creditors (> 0)
  const debtors: { userId: string; amount: number }[] = [];
  const creditors: { userId: string; amount: number }[] = [];

  for (const [userId, balance] of Object.entries(netBalances)) {
    if (balance < 0) {
      debtors.push({ userId, amount: -balance });
    } else if (balance > 0) {
      creditors.push({ userId, amount: balance });
    }
  }

  const results: SimplifiedDebt[] = [];

  while (debtors.length > 0 && creditors.length > 0) {
    // Sort descending by amount to settle largest debts first
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const maxDebtor = debtors[0];
    const maxCreditor = creditors[0];

    const settleAmount = Math.min(maxDebtor.amount, maxCreditor.amount);

    if (settleAmount > 0) {
      results.push({
        fromUserId: maxDebtor.userId,
        toUserId: maxCreditor.userId,
        amountMinor: settleAmount,
      });
    }

    maxDebtor.amount -= settleAmount;
    maxCreditor.amount -= settleAmount;

    if (maxDebtor.amount === 0) {
      debtors.shift();
    }
    if (maxCreditor.amount === 0) {
      creditors.shift();
    }
  }

  return results;
}
