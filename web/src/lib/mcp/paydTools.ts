import { randomInt } from 'crypto';
import {
  calculateNetBalances,
  calculateBilateralDebts,
  simplifyDebts,
  splitEqual,
  formatMinorUnits,
  LedgerInvariantError,
} from '@/lib/ledger';
import {
  INITIAL_USERS,
  INITIAL_GROUPS,
  INITIAL_GROUP_MEMBERS,
  INITIAL_TRANSACTIONS,
  INITIAL_SPLITS,
  INITIAL_SETTLEMENTS,
  INITIAL_RECURRING_BILLS,
} from '@/lib/store/initialData';
import type { Group, User } from '@/types/database';

export interface McpToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Payd MCP tools.
 *
 * These run on the server against the Payd demo seed ledger (initialData).
 * The real ledger lives in each user's browser (localStorage), which this
 * server cannot read or write. Read tools therefore report on the seed data,
 * and "write" tools return a draft the user confirms in the Payd app. They
 * never claim to have recorded anything.
 */

/** The demo account the seed ledger belongs to. */
const CURRENT_USER = INITIAL_USERS[0];
const LEDGER_SCOPE_NOTE =
  'Computed from the Payd demo seed ledger. Entries made in the Payd app are stored in that browser and are not visible to this server.';
/** Largest single amount accepted (AED 1,000,000,000) so fils stay far inside safe-integer range. */
const MAX_AMOUNT_AED = 1_000_000_000;

export function jsonResult(data: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/** Uniform tool error: isError plus a JSON body `{ success: false, error }`. */
export function toolError(message: string, extra: Record<string, unknown> = {}): McpToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ success: false, error: message, ...extra }, null, 2) }],
  };
}

/**
 * Converts an AED amount to integer fils. Returns an error message for
 * non-positive, non-finite, over-precise or oversized amounts.
 */
export function aedToFils(amountAed: unknown, field = 'amount_aed'): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof amountAed !== 'number' || !Number.isFinite(amountAed)) {
    return { ok: false, error: `${field} must be a number` };
  }
  if (amountAed <= 0) return { ok: false, error: `${field} must be greater than 0` };
  if (amountAed > MAX_AMOUNT_AED) return { ok: false, error: `${field} is too large` };
  const fils = Math.round(amountAed * 100);
  if (Math.abs(amountAed * 100 - fils) > 1e-6) {
    return { ok: false, error: `${field} can have at most 2 decimal places` };
  }
  if (!Number.isSafeInteger(fils) || fils <= 0) return { ok: false, error: `${field} must be at least 0.01` };
  return { ok: true, value: fils };
}

// ─── Lookup helpers (exact matching only) ─────────────────────────────────

export function findGroup(ref: string): Group | undefined {
  const needle = ref.trim().toLowerCase();
  return INITIAL_GROUPS.find((g) => g.id === ref.trim() || g.name.toLowerCase() === needle);
}

function groupNotFound(ref: string): McpToolResult {
  return toolError(`Unknown group "${ref}"`, { availableGroups: INITIAL_GROUPS.map((g) => g.name) });
}

function groupMembers(groupId: string): User[] {
  const ids = new Set(INITIAL_GROUP_MEMBERS.filter((m) => m.group_id === groupId).map((m) => m.user_id));
  return INITIAL_USERS.filter((u) => ids.has(u.id));
}

/**
 * Resolves a person by case-insensitive full name or first name, within
 * `pool`. Returns an error message for unknown or ambiguous names.
 */
export function resolveUser(name: string, pool: User[] = INITIAL_USERS): { ok: true; user: User } | { ok: false; error: string } {
  const needle = name.trim().toLowerCase();
  if (!needle) return { ok: false, error: 'Names must not be empty' };
  if (['me', 'i', 'myself', 'you'].includes(needle) && pool.some((u) => u.id === CURRENT_USER.id)) {
    return { ok: true, user: CURRENT_USER };
  }
  const full = pool.filter((u) => u.name.toLowerCase() === needle);
  if (full.length === 1) return { ok: true, user: full[0] };
  const first = pool.filter((u) => u.name.split(/\s+/)[0].toLowerCase() === needle);
  if (first.length === 1) return { ok: true, user: first[0] };
  if (first.length > 1) {
    return { ok: false, error: `"${name}" matches more than one person (${first.map((u) => u.name).join(', ')}); use the full name` };
  }
  return { ok: false, error: `Unknown person "${name}". Known: ${pool.map((u) => u.name).join(', ')}` };
}

function userName(id: string): string {
  return INITIAL_USERS.find((u) => u.id === id)?.name || id;
}

function scopedLedger(groupId?: string) {
  let txns = INITIAL_TRANSACTIONS.filter((t) => !t.deleted_at);
  let splits = INITIAL_SPLITS;
  let settlements = INITIAL_SETTLEMENTS;
  if (groupId) {
    txns = txns.filter((t) => t.group_id === groupId);
    const txnIds = new Set(txns.map((t) => t.id));
    splits = splits.filter((s) => txnIds.has(s.transaction_id));
    settlements = settlements.filter((s) => s.group_id === groupId);
  }
  return { txns, splits, settlements };
}

function debtEdges(bilateral: Map<string, Map<string, number>>) {
  const edges: { fromUserId: string; toUserId: string; amountMinor: number }[] = [];
  for (const [debtorId, credMap] of bilateral.entries()) {
    for (const [creditorId, amount] of credMap.entries()) {
      if (amount > 0) edges.push({ fromUserId: debtorId, toUserId: creditorId, amountMinor: amount });
    }
  }
  return edges;
}

/**
 * Debt simplification throws LedgerInvariantError if balances don't sum to zero.
 * Turn that into a tool error instead of a JSON-RPC internal error.
 */
function withLedgerGuard(fn: () => McpToolResult): McpToolResult {
  try {
    return fn();
  } catch (err) {
    if (err instanceof LedgerInvariantError) {
      return toolError('The ledger balances are inconsistent, so debts could not be computed.', {
        code: 'ledger_invariant',
      });
    }
    throw err;
  }
}

// 1. Get Balances
export function handleGetBalances(groupId?: string): McpToolResult {
  return withLedgerGuard(() => handleGetBalancesUnsafe(groupId));
}

function handleGetBalancesUnsafe(groupId?: string): McpToolResult {
  let grp: Group | undefined;
  if (groupId !== undefined && groupId.trim() !== '') {
    grp = findGroup(groupId);
    if (!grp) return groupNotFound(groupId);
  }

  const { txns, splits, settlements } = scopedLedger(grp?.id);
  const netBalances = calculateNetBalances(txns, splits, settlements);
  const bilateral = calculateBilateralDebts(txns, splits, settlements);

  const formattedBalances = Object.entries(netBalances).map(([userId, minor]) => ({
    userId,
    name: userName(userId),
    balanceMinor: minor,
    balanceFormatted: formatMinorUnits(minor, 'AED'),
    status: minor > 0 ? 'Gets back' : minor < 0 ? 'Owes' : 'Settled',
  }));

  const debtsList = debtEdges(bilateral).map((e) => ({
    from: userName(e.fromUserId),
    to: userName(e.toUserId),
    amountMinor: e.amountMinor,
    amountFormatted: formatMinorUnits(e.amountMinor, 'AED'),
  }));

  return jsonResult({
    scope: grp?.name || 'All Ledgers (Global)',
    currency: 'AED',
    netBalances: formattedBalances,
    bilateralDebts: debtsList,
    totalOutstandingMinor: debtsList.reduce((s, d) => s + d.amountMinor, 0),
    dataSource: LEDGER_SCOPE_NOTE,
    timestamp: new Date().toISOString(),
  });
}

// 2. Simplify Debts
export function handleSimplifyDebts(groupId: string): McpToolResult {
  return withLedgerGuard(() => handleSimplifyDebtsUnsafe(groupId));
}

function handleSimplifyDebtsUnsafe(groupId: string): McpToolResult {
  if (typeof groupId !== 'string' || !groupId.trim()) return toolError('groupId is required');
  const grp = findGroup(groupId);
  if (!grp) return groupNotFound(groupId);

  const { txns, splits, settlements } = scopedLedger(grp.id);
  const netBalances = calculateNetBalances(txns, splits, settlements);
  const originalDebts = debtEdges(calculateBilateralDebts(txns, splits, settlements));
  const simplified = simplifyDebts(netBalances);

  const results = simplified.map((s) => ({
    from: userName(s.fromUserId),
    to: userName(s.toUserId),
    amountMinor: s.amountMinor,
    amountFormatted: formatMinorUnits(s.amountMinor, 'AED'),
  }));

  return jsonResult({
    group: grp.name,
    currency: 'AED',
    originalDebtsCount: originalDebts.length,
    simplifiedSettlementsCount: results.length,
    transactions: results,
    algorithm: 'Minimum-transfer debt simplification (exact for up to 12 balances)',
    dataSource: LEDGER_SCOPE_NOTE,
  });
}

// 3. Add Expense (draft only: the server cannot write the browser ledger)
export function handleAddExpense(params: {
  title: string;
  amount_aed: number;
  payer_name?: string;
  group_name?: string;
  participant_names?: string[];
}): McpToolResult {
  const title = typeof params.title === 'string' ? params.title.trim() : '';
  if (!title) return toolError('title is required');

  const amount = aedToFils(params.amount_aed);
  if (!amount.ok) return toolError(amount.error);
  const amountMinor = amount.value;

  let grp: Group | undefined;
  if (params.group_name !== undefined && params.group_name.trim() !== '') {
    grp = findGroup(params.group_name);
    if (!grp) return groupNotFound(params.group_name);
  }
  const pool = grp ? groupMembers(grp.id) : INITIAL_USERS;

  let payer: User = CURRENT_USER;
  if (params.payer_name !== undefined) {
    const r = resolveUser(params.payer_name, pool);
    if (!r.ok) return toolError(grp ? `Payer: ${r.error} (group ${grp.name})` : `Payer: ${r.error}`);
    payer = r.user;
  } else if (grp && !pool.some((u) => u.id === payer.id)) {
    return toolError(`payer_name is required: ${CURRENT_USER.name} is not a member of ${grp.name}`);
  }

  let participants: User[];
  if (params.participant_names && params.participant_names.length > 0) {
    participants = [];
    for (const name of params.participant_names) {
      const r = resolveUser(name, pool);
      if (!r.ok) return toolError(grp ? `Participant: ${r.error} (group ${grp.name})` : `Participant: ${r.error}`);
      if (!participants.some((p) => p.id === r.user.id)) participants.push(r.user);
    }
  } else {
    // Group expense: everyone in the group. Personal expense: just the payer.
    participants = grp ? pool : [payer];
  }

  const splitMap = splitEqual(amountMinor, participants.map((p) => p.id));
  const splitsSummary = Object.entries(splitMap).map(([uid, share]) => ({
    user: userName(uid),
    shareMinor: share,
    shareFormatted: formatMinorUnits(share, 'AED'),
  }));

  return jsonResult({
    success: true,
    status: 'draft_created',
    recorded: false,
    draftId: `draft-mcp-${Date.now().toString(36)}`,
    title,
    amountMinor,
    amountFormatted: formatMinorUnits(amountMinor, 'AED'),
    payer: payer.name,
    group: grp?.name || 'Personal',
    splits: splitsSummary,
    currency: 'AED',
    invariantChecked: 'Sum of splits == Total amount exactly (Zero-Loss)',
    nextStep:
      'Not saved yet. Payd stores the ledger in the user\'s browser, which this server cannot write. Ask the user to open Payd, tap Add Expense and enter these details (or use the voice assistant) to record it.',
    timestamp: new Date().toISOString(),
  });
}

// 4. Check Reimbursement Lag (derived from the seed ledger)
function tierFor(avgLagDays: number | null): { tier: string; badge: string } {
  if (avgLagDays === null) return { tier: 'unknown', badge: 'No repayments yet' };
  if (avgLagDays <= 2) return { tier: 'speedy', badge: 'Speedy' };
  if (avgLagDays <= 5) return { tier: 'average', badge: 'Average' };
  return { tier: 'lagging', badge: 'Lagging' };
}

export function handleCheckReimbursementLag(): McpToolResult {
  return withLedgerGuard(() => handleCheckReimbursementLagUnsafe());
}

function handleCheckReimbursementLagUnsafe(): McpToolResult {
  const me = CURRENT_USER.id;
  const { txns, splits, settlements } = scopedLedger();
  const expenses = txns.filter((t) => t.type === 'expense');
  const splitsByTxn = new Map<string, typeof splits>();
  for (const s of splits) splitsByTxn.set(s.transaction_id, [...(splitsByTxn.get(s.transaction_id) || []), s]);

  // Money I fronted for others: their shares of expenses I paid.
  let frontedMinor = 0;
  for (const t of expenses) {
    if (t.payer_id !== me) continue;
    for (const s of splitsByTxn.get(t.id) || []) if (s.user_id !== me) frontedMinor += s.share_minor;
  }
  const settled = settlements.filter((s) => s.status === 'settled');
  const recoveredMinor = settled.filter((s) => s.recipient_id === me).reduce((sum, s) => sum + s.amount_minor, 0);

  const bilateral = calculateBilateralDebts(txns, splits, settlements);
  const owedToMe = new Map<string, number>();
  for (const e of debtEdges(bilateral)) if (e.toUserId === me) owedToMe.set(e.fromUserId, e.amountMinor);

  const friends = INITIAL_USERS.filter((u) => u.id !== me);
  const metrics = friends
    .map((f) => {
      // Lag = time from the latest expense I paid that they shared (before the repayment) to the repayment.
      const lags: number[] = [];
      for (const s of settled.filter((x) => x.sender_id === f.id && x.recipient_id === me)) {
        const paidAt = new Date(s.settled_at || s.created_at).getTime();
        const owedSince = expenses
          .filter((t) => t.payer_id === me && (splitsByTxn.get(t.id) || []).some((sp) => sp.user_id === f.id))
          .map((t) => new Date(t.occurred_at || t.created_at).getTime())
          .filter((ts) => ts <= paidAt)
          .sort((a, b) => b - a)[0];
        if (owedSince !== undefined) lags.push((paidAt - owedSince) / 86400000);
      }
      const avg = lags.length ? Math.round((lags.reduce((a, b) => a + b, 0) / lags.length) * 10) / 10 : null;
      const owed = owedToMe.get(f.id) || 0;
      return {
        name: f.name,
        avgLagDays: avg,
        repaymentsMeasured: lags.length,
        ...tierFor(avg),
        currentOwedMinor: owed,
        currentOwedFormatted: formatMinorUnits(owed, 'AED'),
      };
    })
    .filter((m) => m.repaymentsMeasured > 0 || m.currentOwedMinor > 0);

  const outstandingMinor = [...owedToMe.values()].reduce((a, b) => a + b, 0);
  const topDebtor = [...metrics].sort((a, b) => b.currentOwedMinor - a.currentOwedMinor)[0];

  return jsonResult({
    user: CURRENT_USER.name,
    totalFrontedMinor: frontedMinor,
    totalFrontedCapitalFormatted: formatMinorUnits(frontedMinor, 'AED'),
    recoveredMinor,
    recoveredCapitalFormatted: formatMinorUnits(recoveredMinor, 'AED'),
    outstandingExposureMinor: outstandingMinor,
    outstandingExposureFormatted: formatMinorUnits(outstandingMinor, 'AED'),
    reimbursementTurnaround: metrics,
    recommendation:
      topDebtor && topDebtor.currentOwedMinor > 0
        ? `Send a friendly reminder to ${topDebtor.name} to recover ${topDebtor.currentOwedFormatted}.`
        : 'Nobody owes you anything right now.',
    dataSource: LEDGER_SCOPE_NOTE,
  });
}

// 5. Spin Coffee Roulette (weighted random draw)
export function handleSpinCoffeeRoulette(
  params: { amount_aed?: number; mode?: 'debt_weighted' | 'equal'; group_name?: string; participant_names?: string[] },
  /** Returns an integer in [0, max). Injectable for tests; defaults to crypto.randomInt. */
  rand: (max: number) => number = (max) => randomInt(max)
): McpToolResult {
  const amount = aedToFils(params.amount_aed ?? 45);
  if (!amount.ok) return toolError(amount.error);
  const mode = params.mode ?? 'debt_weighted';
  if (mode !== 'debt_weighted' && mode !== 'equal') return toolError('mode must be one of: debt_weighted, equal');

  const grp = findGroup(params.group_name ?? INITIAL_GROUPS[0].name);
  if (!grp) return groupNotFound(params.group_name!);
  const members = groupMembers(grp.id);

  let participants: User[] = members;
  if (params.participant_names && params.participant_names.length > 0) {
    participants = [];
    for (const name of params.participant_names) {
      const r = resolveUser(name, members);
      if (!r.ok) return toolError(`Participant: ${r.error} (group ${grp.name})`);
      if (!participants.some((p) => p.id === r.user.id)) participants.push(r.user);
    }
  }
  if (participants.length < 2) return toolError('Roulette needs at least 2 participants');

  const { txns, splits, settlements } = scopedLedger(grp.id);
  const net = calculateNetBalances(txns, splits, settlements);
  const debtOf = (id: string) => Math.max(0, -(net[id] || 0));
  const maxDebt = Math.max(0, ...participants.map((p) => debtOf(p.id)));

  // Integer weights: everyone gets 100; in debt_weighted mode the biggest debtor gets up to +200 extra.
  const weights = participants.map((p) => ({
    user: p,
    weight: mode === 'debt_weighted' && maxDebt > 0 ? 100 + Math.round((200 * debtOf(p.id)) / maxDebt) : 100,
  }));
  const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
  let ticket = rand(totalWeight);
  let winner = weights[weights.length - 1];
  for (const w of weights) {
    if (ticket < w.weight) {
      winner = w;
      break;
    }
    ticket -= w.weight;
  }
  const pct = (w: number) => `${((100 * w) / totalWeight).toFixed(1)}%`;

  return jsonResult({
    selectedPayer: winner.user.name,
    reason:
      mode === 'debt_weighted'
        ? `${winner.user.name} was drawn at random with a ${pct(winner.weight)} chance. Odds are weighted by how much each person owes in ${grp.name}.`
        : `${winner.user.name} was drawn at random; everyone had an equal ${pct(winner.weight)} chance.`,
    group: grp.name,
    mode,
    billAmountMinor: amount.value,
    billAmountFormatted: formatMinorUnits(amount.value, 'AED'),
    participantsOdds: weights.map((w) => ({
      name: w.user.name,
      owesMinor: debtOf(w.user.id),
      probability: pct(w.weight),
    })),
    recorded: false,
    nextStep: `Not saved. If ${winner.user.name} pays, record it in Payd as an expense paid by ${winner.user.name}.`,
  });
}

// 6. Trigger Recurring Bill Split (preview only)
export function handleTriggerRecurringSplit(subscriptionName?: string): McpToolResult {
  const available = INITIAL_RECURRING_BILLS.map((b) => b.title);
  if (typeof subscriptionName !== 'string' || !subscriptionName.trim()) {
    return toolError('subscription_name is required', { availableSubscriptions: available });
  }
  const needle = subscriptionName.trim().toLowerCase();
  const exact = INITIAL_RECURRING_BILLS.filter((b) => b.id === subscriptionName.trim() || b.title.toLowerCase() === needle);
  const partial = INITIAL_RECURRING_BILLS.filter((b) => b.title.toLowerCase().includes(needle));
  const matches = exact.length ? exact : partial;
  if (matches.length === 0) {
    return toolError(`No recurring bill matches "${subscriptionName}"`, { availableSubscriptions: available });
  }
  if (matches.length > 1) {
    return toolError(`"${subscriptionName}" matches more than one recurring bill`, {
      matches: matches.map((b) => b.title),
    });
  }
  const bill = matches[0];
  const grp = INITIAL_GROUPS.find((g) => g.id === bill.group_id);

  return jsonResult({
    success: true,
    status: 'split_preview',
    recorded: false,
    subscription: bill.title,
    frequency: bill.frequency,
    amountMinor: bill.amount_minor,
    amountFormatted: formatMinorUnits(bill.amount_minor, 'AED'),
    payer: userName(bill.payer_id),
    group: grp?.name || 'Personal',
    dueDay: bill.due_day,
    lastPostedAt: bill.last_posted_at || null,
    splits: bill.splits.map((s) => ({
      member: userName(s.user_id),
      shareMinor: s.share_minor,
      shareFormatted: formatMinorUnits(s.share_minor, 'AED'),
    })),
    nextStep: 'Not posted. Ask the user to open Payd > Recurring and tap "Post Split Now" on this bill to record it.',
  });
}
