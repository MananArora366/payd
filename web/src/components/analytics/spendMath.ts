// Pure helpers shared by the Home, Activity and analytics cards.
// Money stays in integer fils throughout.

export interface SpendTxn {
  id: string;
  type: string;
  title: string;
  amount_minor: number;
  category_id?: string | null;
  payer_id: string;
  group_id?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  occurred_at: string;
  created_at?: string;
  deleted_at?: string | null;
}

export interface SpendSplit {
  transaction_id: string;
  user_id: string;
  share_minor: number;
}

/**
 * The current user's own share of an expense, using the same rule as
 * calculatePersonalSpend: their split row if any, otherwise the full amount for a
 * personal (no group) expense they paid, otherwise 0 (not their spend).
 */
export function getMyExpenseShareMinor(txn: SpendTxn, userId: string, splits: SpendSplit[]): number {
  if (txn.type !== 'expense') return 0;
  const mine = splits.find((s) => s.transaction_id === txn.id && s.user_id === userId);
  if (mine) return mine.share_minor;
  if (!txn.group_id && txn.payer_id === userId) return txn.amount_minor;
  return 0;
}

/** True when the user has a split row on the transaction. */
export function isParticipant(txn: SpendTxn, userId: string, splits: SpendSplit[]): boolean {
  return splits.some((s) => s.transaction_id === txn.id && s.user_id === userId);
}

/** Newest first by occurred_at, then created_at, without mutating the input. */
export function sortByDateDesc<T extends { occurred_at: string; created_at?: string }>(items: T[]): T[] {
  const ts = (v?: string) => {
    const n = v ? Date.parse(v) : NaN;
    return Number.isFinite(n) ? n : 0;
  };
  return [...items].sort(
    (a, b) => ts(b.occurred_at) - ts(a.occurred_at) || ts(b.created_at) - ts(a.created_at)
  );
}

/** Total spend of a group: non-deleted expenses only (income, refunds etc. excluded). */
export function groupSpendMinor(groupId: string, transactions: SpendTxn[]): number {
  return transactions
    .filter((t) => t.group_id === groupId && !t.deleted_at && t.type === 'expense')
    .reduce((sum, t) => sum + t.amount_minor, 0);
}

/** Careem-sourced expense: paid with Careem Pay, saved from a Careem event, or titled "Careem ...". */
export function isCareemExpense(txn: SpendTxn): boolean {
  if (txn.type !== 'expense' || txn.deleted_at) return false;
  if ((txn.payment_method || '').toLowerCase().includes('careem')) return true;
  if (/^careem\b/i.test((txn.notes || '').trim())) return true;
  return /\bcareem\b/i.test(txn.title);
}

export function isSameMonth(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export interface CategoryTotal {
  id: string;
  totalMinor: number;
}

/**
 * Category totals of the user's own share for expenses in the given month.
 * Returns totals sorted descending and the grand total.
 */
export function monthlyCategoryShares(
  userId: string,
  transactions: SpendTxn[],
  splits: SpendSplit[],
  now: Date
): { totals: CategoryTotal[]; totalMinor: number } {
  const map: Record<string, number> = {};
  let totalMinor = 0;
  for (const t of transactions) {
    if (t.deleted_at || t.type !== 'expense' || !isSameMonth(t.occurred_at, now)) continue;
    const share = getMyExpenseShareMinor(t, userId, splits);
    if (share <= 0) continue;
    const key = t.category_id || 'other';
    map[key] = (map[key] || 0) + share;
    totalMinor += share;
  }
  const totals = Object.entries(map)
    .map(([id, total]) => ({ id, totalMinor: total }))
    .sort((a, b) => b.totalMinor - a.totalMinor);
  return { totals, totalMinor };
}

/** Sums of expense and income amounts (non-deleted) in a list. */
export function volumeByType(transactions: SpendTxn[]): { expenseMinor: number; incomeMinor: number } {
  let expenseMinor = 0;
  let incomeMinor = 0;
  for (const t of transactions) {
    if (t.deleted_at) continue;
    if (t.type === 'expense') expenseMinor += t.amount_minor;
    else if (t.type === 'income') incomeMinor += t.amount_minor;
  }
  return { expenseMinor, incomeMinor };
}
