// Debt simplification (min cash flow).
// For small groups (<= EXACT_LIMIT people with a non-zero balance) this finds the
// minimum number of transfers exactly: it partitions the balances into the largest
// possible number of zero-sum subsets (bitmask DP), then settles each subset with
// the greedy largest-debtor/largest-creditor pass (k people -> at most k-1 transfers).
// Larger groups fall back to the plain greedy pass, which is fast and always
// conserves balances but can occasionally use more transfers than the minimum.

import { LedgerInvariantError } from './splits';

export interface SimplifiedDebt {
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
}

/** Above this many non-zero balances we skip the exact search (2^n states). */
const EXACT_LIMIT = 12;

interface Entry {
  userId: string;
  balance: number;
}

/** Greedy largest-debtor pays largest-creditor pass. Assumes the entries sum to zero. */
function greedySettle(entries: Entry[]): SimplifiedDebt[] {
  const debtors = entries.filter((e) => e.balance < 0).map((e) => ({ userId: e.userId, amount: -e.balance }));
  const creditors = entries.filter((e) => e.balance > 0).map((e) => ({ userId: e.userId, amount: e.balance }));
  const results: SimplifiedDebt[] = [];

  while (debtors.length > 0 && creditors.length > 0) {
    // Stable sort: ties keep their original (insertion) order, so output is deterministic.
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const d = debtors[0];
    const c = creditors[0];
    const amount = Math.min(d.amount, c.amount);
    if (amount > 0) {
      results.push({ fromUserId: d.userId, toUserId: c.userId, amountMinor: amount });
    }
    d.amount -= amount;
    c.amount -= amount;
    if (d.amount === 0) debtors.shift();
    if (c.amount === 0) creditors.shift();
  }
  return results;
}

/**
 * Splits entries into the maximum number of zero-sum subsets.
 * Minimum transfers = n - (number of zero-sum subsets), so maximising the subset
 * count minimises the transfers.
 */
function partitionZeroSum(entries: Entry[]): Entry[][] {
  const n = entries.length;
  const size = 1 << n;
  const sum = new Array<number>(size).fill(0);
  for (let mask = 1; mask < size; mask++) {
    const low = mask & -mask;
    const i = 31 - Math.clz32(low);
    sum[mask] = sum[mask ^ low] + entries[i].balance;
  }
  const dp = new Array<number>(size).fill(0);
  for (let mask = 1; mask < size; mask++) {
    let best = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        const v = dp[mask ^ (1 << i)];
        if (v > best) best = v;
      }
    }
    dp[mask] = best + (sum[mask] === 0 ? 1 : 0);
  }

  // Walk from the full mask, always removing an element that keeps dp maximal.
  // Elements removed between two consecutive zero-sum masks form one zero-sum group.
  const groups: Entry[][] = [];
  let current: Entry[] = [];
  let mask = size - 1;
  while (mask) {
    let pick = -1;
    let pickVal = -1;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        const v = dp[mask ^ (1 << i)];
        if (v > pickVal) {
          pickVal = v;
          pick = i;
        }
      }
    }
    current.push(entries[pick]);
    mask ^= 1 << pick;
    if (sum[mask] === 0) {
      groups.push(current);
      current = [];
    }
  }
  return groups;
}

/**
 * Turns net balances (positive = owed money, negative = owes money) into a short list
 * of direct transfers. Exact minimum transfer count for up to 12 non-zero balances,
 * greedy (near-minimal) above that.
 *
 * Throws LedgerInvariantError if the balances do not sum to zero, because no set of
 * transfers can settle an unbalanced ledger.
 */
export function simplifyDebts(netBalances: Record<string, number>): SimplifiedDebt[] {
  const entries: Entry[] = [];
  let total = 0;
  for (const [userId, balance] of Object.entries(netBalances)) {
    if (!Number.isFinite(balance)) {
      throw new LedgerInvariantError(`Balance for ${userId} is not a finite number`);
    }
    total += balance;
    if (balance !== 0) entries.push({ userId, balance });
  }
  if (total !== 0) {
    throw new LedgerInvariantError(`Balances do not sum to zero (off by ${total})`);
  }
  if (entries.length === 0) return [];

  if (entries.length > EXACT_LIMIT) return greedySettle(entries);

  const results: SimplifiedDebt[] = [];
  for (const group of partitionZeroSum(entries)) {
    // Keep the caller's ordering inside each group for deterministic output.
    group.sort((a, b) => entries.indexOf(a) - entries.indexOf(b));
    results.push(...greedySettle(group));
  }
  return results;
}
