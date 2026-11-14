import { simplifyDebts } from './simplification';

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

/** debtorId -> (creditorId -> amountMinor). Every amount is > 0. */
export type PairwiseDebtMap = Map<string, Map<string, number>>;

/** Map key used by calculateGroupedBilateralDebts for activity that has no group. */
export const PERSONAL_DEBT_BUCKET = '__personal__';

function addRaw(raw: PairwiseDebtMap, debtor: string, creditor: string, amount: number) {
  if (debtor === creditor || amount === 0) return;
  if (!raw.has(debtor)) raw.set(debtor, new Map());
  const m = raw.get(debtor)!;
  m.set(creditor, (m.get(creditor) || 0) + amount);
}

/**
 * Nets a raw (possibly two-directional, possibly negative) pair map so that each
 * pair has at most one direction with a positive amount.
 */
function netPairs(raw: PairwiseDebtMap): PairwiseDebtMap {
  const out: PairwiseDebtMap = new Map();
  const seen = new Set<string>();
  for (const [a, m] of raw) {
    for (const b of m.keys()) {
      const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const net = (raw.get(a)?.get(b) || 0) - (raw.get(b)?.get(a) || 0);
      if (net > 0) addRaw(out, a, b, net);
      else if (net < 0) addRaw(out, b, a, -net);
    }
  }
  return out;
}

/**
 * Direct pairwise ledger: every split creates a debt from the participant to the
 * payer, refunds reverse it, settlements pay it down. Overpayments carry over as a
 * debt in the opposite direction, and opposite debts net out.
 */
function directPairwiseDebts(
  transactions: TransactionRecord[],
  splits: SplitRecord[],
  settlements: SettlementRecord[]
): PairwiseDebtMap {
  const raw: PairwiseDebtMap = new Map();
  const splitsByTxn: Record<string, SplitRecord[]> = {};
  for (const s of splits) {
    (splitsByTxn[s.transaction_id] ||= []).push(s);
  }
  for (const txn of transactions) {
    if (txn.deleted_at) continue;
    const isDebit = txn.type === 'expense' || txn.type === 'adjustment';
    const isRefund = txn.type === 'refund';
    if (!isDebit && !isRefund) continue;
    for (const sp of splitsByTxn[txn.id] || []) {
      if (sp.user_id === txn.payer_id) continue;
      if (isDebit) addRaw(raw, sp.user_id, txn.payer_id, sp.share_minor);
      else addRaw(raw, txn.payer_id, sp.user_id, sp.share_minor);
    }
  }
  for (const s of settlements) {
    if (s.status !== 'settled') continue;
    // Paying someone is the same as them now owing you that amount back.
    addRaw(raw, s.recipient_id, s.sender_id, s.amount_minor);
  }
  return netPairs(raw);
}

/**
 * Pairwise debts for one group: derived from the group's netted balances
 * (calculateNetBalances) and turned into transfers with simplifyDebts, i.e. exactly
 * the "who pays whom" list the Groups tab shows. Falls back to the direct pairwise
 * ledger if the group's balances don't sum to zero (corrupt data).
 */
function groupPairwiseDebts(
  transactions: TransactionRecord[],
  splits: SplitRecord[],
  settlements: SettlementRecord[]
): PairwiseDebtMap {
  const balances = calculateNetBalances(transactions, splits, settlements);
  try {
    const out: PairwiseDebtMap = new Map();
    for (const d of simplifyDebts(balances)) addRaw(out, d.fromUserId, d.toUserId, d.amountMinor);
    return out;
  } catch {
    return directPairwiseDebts(transactions, splits, settlements);
  }
}

/**
 * Pairwise debts per group. Key = group id, or PERSONAL_DEBT_BUCKET for activity
 * with no group. Group buckets use the group's simplified (netted) balances; the
 * personal bucket uses the direct pairwise ledger (no simplification across
 * unrelated people).
 */
export function calculateGroupedBilateralDebts(
  transactions: TransactionRecord[],
  splits: SplitRecord[],
  settlements: SettlementRecord[]
): Map<string, PairwiseDebtMap> {
  const bucketOf = (gid?: string | null) => gid || PERSONAL_DEBT_BUCKET;
  const txnsBy = new Map<string, TransactionRecord[]>();
  const txnBucket = new Map<string, string>();
  for (const t of transactions) {
    const b = bucketOf(t.group_id);
    txnBucket.set(t.id, b);
    if (!txnsBy.has(b)) txnsBy.set(b, []);
    txnsBy.get(b)!.push(t);
  }
  const splitsBy = new Map<string, SplitRecord[]>();
  for (const s of splits) {
    const b = txnBucket.get(s.transaction_id);
    if (!b) continue;
    if (!splitsBy.has(b)) splitsBy.set(b, []);
    splitsBy.get(b)!.push(s);
  }
  const settlementsBy = new Map<string, SettlementRecord[]>();
  for (const s of settlements) {
    const b = bucketOf(s.group_id);
    if (!settlementsBy.has(b)) settlementsBy.set(b, []);
    settlementsBy.get(b)!.push(s);
  }

  const buckets = new Set<string>([...txnsBy.keys(), ...settlementsBy.keys()]);
  const out = new Map<string, PairwiseDebtMap>();
  for (const b of buckets) {
    const t = txnsBy.get(b) || [];
    const sp = splitsBy.get(b) || [];
    const st = settlementsBy.get(b) || [];
    const debts = b === PERSONAL_DEBT_BUCKET ? directPairwiseDebts(t, sp, st) : groupPairwiseDebts(t, sp, st);
    if (debts.size > 0) out.set(b, debts);
  }
  return out;
}

/**
 * Bilateral debts between pairs of users, across all groups.
 * Returns: Map from debtorId -> Map of creditorId -> amountMinor (always > 0).
 *
 * Semantics (one balance model):
 * - Per group, debts come from the group's netted balances (the same numbers the
 *   Groups tab shows, simplified into transfers). Overpayments carry over.
 * - Activity with no group is netted pairwise.
 * - Debts in opposite directions between the same two people (e.g. across groups)
 *   net out.
 * - For every user, sum(owed to them) - sum(they owe) === calculateNetBalances()[user].
 */
export function calculateBilateralDebts(
  transactions: TransactionRecord[],
  splits: SplitRecord[],
  settlements: SettlementRecord[]
): Map<string, Map<string, number>> {
  const raw: PairwiseDebtMap = new Map();
  for (const debts of calculateGroupedBilateralDebts(transactions, splits, settlements).values()) {
    for (const [debtor, m] of debts) {
      for (const [creditor, amt] of m) addRaw(raw, debtor, creditor, amt);
    }
  }
  return netPairs(raw);
}

/**
 * Real numbers for the "Smart settle-up" stat.
 * before: transfers needed if everyone repaid each person they owe directly,
 *         group by group (no simplification, no cross-group netting).
 * after:  transfers in the unified model (calculateBilateralDebts).
 */
export function summarizeDebtSimplification(
  transactions: TransactionRecord[],
  splits: SplitRecord[],
  settlements: SettlementRecord[]
): { beforeTransfers: number; afterTransfers: number } {
  const groupOf = (gid?: string | null) => gid || PERSONAL_DEBT_BUCKET;
  const txnGroup = new Map(transactions.map((t) => [t.id, groupOf(t.group_id)]));
  const buckets = new Set<string>([...txnGroup.values(), ...settlements.map((s) => groupOf(s.group_id))]);
  let before = 0;
  for (const b of buckets) {
    const t = transactions.filter((x) => groupOf(x.group_id) === b);
    const sp = splits.filter((x) => txnGroup.get(x.transaction_id) === b);
    const st = settlements.filter((x) => groupOf(x.group_id) === b);
    for (const m of directPairwiseDebts(t, sp, st).values()) before += m.size;
  }
  let after = 0;
  for (const m of calculateBilateralDebts(transactions, splits, settlements).values()) after += m.size;
  return { beforeTransfers: before, afterTransfers: after };
}

/**
 * Signed debt from `fromUserId` to `toUserId` in a pair map: positive means
 * `from` owes `to`, negative means `to` owes `from`.
 */
export function getSignedPairDebt(debts: PairwiseDebtMap | undefined, fromUserId: string, toUserId: string): number {
  if (!debts) return 0;
  return (debts.get(fromUserId)?.get(toUserId) || 0) - (debts.get(toUserId)?.get(fromUserId) || 0);
}

export interface PairDebtComponent {
  /** Group id, or null for activity outside any group. */
  groupId: string | null;
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
}

/**
 * Per-group breakdown of what flows between two users. Each component is in its
 * own direction; together they net to calculateBilateralDebts for that pair.
 */
export function getPairDebtBreakdown(
  grouped: Map<string, PairwiseDebtMap>,
  userA: string,
  userB: string
): PairDebtComponent[] {
  const out: PairDebtComponent[] = [];
  for (const [bucket, debts] of grouped) {
    const signed = getSignedPairDebt(debts, userA, userB);
    if (signed === 0) continue;
    out.push({
      groupId: bucket === PERSONAL_DEBT_BUCKET ? null : bucket,
      fromUserId: signed > 0 ? userA : userB,
      toUserId: signed > 0 ? userB : userA,
      amountMinor: Math.abs(signed),
    });
  }
  return out;
}

export interface SettlementValidationInput {
  sender_id: string;
  recipient_id: string;
  amount_minor: number;
  /** Group the payment belongs to. Omit/null to validate against the overall debt. */
  group_id?: string | null;
  /** Explicitly allow paying more than the debt (recorded as an advance). */
  allowOverpayment?: boolean;
}

export type SettlementValidationResult =
  | { ok: true; debtMinor: number }
  | { ok: false; reason: string; debtMinor: number };

/**
 * Pure settlement check against the unified debt model.
 * `debtMinor` is what sender currently owes recipient (0 if nothing / reversed).
 * Messages are user-facing and plain-language.
 */
export function checkSettlement(
  input: SettlementValidationInput,
  debtMinor: number,
  names?: { sender?: string; recipient?: string; format?: (minor: number) => string }
): SettlementValidationResult {
  const sender = names?.sender || 'The payer';
  const recipient = names?.recipient || 'the recipient';
  const fmt = names?.format || ((m: number) => `AED ${(m / 100).toFixed(2)}`);
  const isYou = sender === 'You';
  const debt = Math.max(0, debtMinor);
  if (!input.sender_id || !input.recipient_id) {
    return { ok: false, reason: 'Choose who is paying and who is being paid.', debtMinor: debt };
  }
  if (input.sender_id === input.recipient_id) {
    return { ok: false, reason: "The payer and the recipient can't be the same person.", debtMinor: debt };
  }
  const amt = input.amount_minor;
  if (!Number.isSafeInteger(amt) || amt <= 0) {
    return { ok: false, reason: 'Enter an amount greater than zero.', debtMinor: debt };
  }
  if (!validateSettlementAmount(amt, debt, input.allowOverpayment ?? false)) {
    const reason =
      debt === 0
        ? `${sender} ${isYou ? "don't" : "doesn't"} currently owe ${recipient} anything here. Record it as an advance payment if you still want to log it.`
        : `That's more than the ${fmt(debt)} ${sender} ${isYou ? 'owe' : 'owes'} ${recipient}. Lower the amount or record the extra as an advance payment.`;
    return { ok: false, reason, debtMinor: debt };
  }
  return { ok: true, debtMinor: debt };
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
