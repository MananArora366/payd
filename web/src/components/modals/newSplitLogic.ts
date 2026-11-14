/**
 * Pure helpers for NewSplitModal: validates a split draft and builds the input for
 * PaydContext.addTransaction. Framework-free so it can be unit tested.
 * All money is integer fils (AED minor units).
 */
import {
  splitEqual,
  splitExact,
  splitPercentage,
  splitShares,
  formatMinorUnits,
  PERCENTAGE_SUM_TOLERANCE,
} from '@/lib/ledger';
import { parseAmountInput, friendlyError, LEDGER_CURRENCY } from './addExpenseLogic';

export type NewSplitMethod = 'equal' | 'exact' | 'percentage' | 'shares';

export interface NewSplitDraft {
  title: string;
  amountInput: string; // raw user text like "120.50"
  payerId: string;
  groupId: string | null;
  participantIds: string[]; // people sharing the cost (may include payer)
  method: NewSplitMethod;
  /** Per-person raw input: amount for 'exact', percent for 'percentage', share count for 'shares'. Ignored for 'equal'. */
  values: Record<string, string>;
  notes?: string;
  categoryId?: string | null;
}

export interface NewSplitTransactionInput {
  type: 'expense';
  title: string;
  amount_minor: number;
  currency: string; // LEDGER_CURRENCY
  payer_id: string;
  group_id: string | null;
  category_id?: string | null;
  notes?: string | null;
  payment_method?: string;
  splits: { user_id: string; share_minor: number }[];
}

export type NewSplitResult = { ok: true; input: NewSplitTransactionInput } | { ok: false; error: string };

type SharesResult = { ok: true; shares: Record<string, number> } | { ok: false; error: string };

/** Plain non-negative decimal: "50", "33.33", ".5", "2." (no signs, exponents or commas). */
const NUMBER_RE = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/** Max decimals accepted for percentages / share counts (splits.ts uses a 1e6 fixed-point scale). */
const MAX_WEIGHT_DECIMALS = 6;

const fmt = (minor: number) => formatMinorUnits(minor, LEDGER_CURRENCY);

function uniqueParticipants(draft: NewSplitDraft): string[] {
  return [...new Set((draft.participantIds ?? []).filter((id) => typeof id === 'string' && id !== ''))];
}

function parseWeight(raw: string | undefined, label: string): { ok: true; value: number } | { ok: false; error: string } {
  const s = (raw ?? '').trim();
  if (!s) return { ok: false, error: `Enter ${label}, or remove them from the split.` };
  if (!NUMBER_RE.test(s)) return { ok: false, error: `"${s}" isn't a valid number for ${label}.` };
  const frac = s.split('.')[1] ?? '';
  if (frac.length > MAX_WEIGHT_DECIMALS) {
    return { ok: false, error: `Use at most ${MAX_WEIGHT_DECIMALS} decimal places for ${label}.` };
  }
  const value = Number(s);
  if (!Number.isFinite(value) || value < 0) return { ok: false, error: `"${s}" isn't a valid number for ${label}.` };
  return { ok: true, value };
}

/** Lenient number parse used by previews/hints: invalid or empty counts as 0. */
function lenientNumber(raw: string | undefined): number {
  const s = (raw ?? '').trim();
  if (!NUMBER_RE.test(s)) return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Core share computation. Returns shares only for people who owe something (zero-weight
 * participants in percentage/shares mode are dropped). Never throws.
 */
function computeShares(
  totalMinor: number,
  participantIds: string[],
  draft: NewSplitDraft,
  nameOf: (userId: string) => string
): SharesResult {
  try {
    if (participantIds.length === 0) return { ok: false, error: 'Pick at least one person to split with.' };
    const values = draft.values ?? {};
    let shares: Record<string, number>;
    let owing: string[] = participantIds;

    if (draft.method === 'equal') {
      if (totalMinor < participantIds.length) {
        return {
          ok: false,
          error: `${fmt(totalMinor)} is too small to split between ${participantIds.length} people. Someone would owe nothing.`,
        };
      }
      shares = splitEqual(totalMinor, participantIds);
    } else if (draft.method === 'exact') {
      const alloc: Record<string, number> = {};
      for (const uid of participantIds) {
        const raw = (values[uid] ?? '').trim();
        if (!raw) return { ok: false, error: `Enter an amount for ${nameOf(uid)}, or remove them from the split.` };
        const r = parseAmountInput(raw, `amount for ${nameOf(uid)}`);
        if (!r.ok) return { ok: false, error: r.error };
        alloc[uid] = r.value;
      }
      const sum = Object.values(alloc).reduce((a, b) => a + b, 0);
      if (sum !== totalMinor) {
        const diff = totalMinor - sum;
        return {
          ok: false,
          error: `Per-person amounts add up to ${fmt(sum)}, but the total is ${fmt(totalMinor)} (${diff > 0 ? 'short by' : 'over by'} ${fmt(Math.abs(diff))}).`,
        };
      }
      shares = splitExact(totalMinor, alloc);
    } else if (draft.method === 'percentage' || draft.method === 'shares') {
      const isPct = draft.method === 'percentage';
      const weights: Record<string, number> = {};
      for (const uid of participantIds) {
        const label = isPct ? `a percentage for ${nameOf(uid)}` : `shares for ${nameOf(uid)}`;
        const r = parseWeight(values[uid], label);
        if (!r.ok) return { ok: false, error: r.error };
        weights[uid] = r.value;
      }
      owing = participantIds.filter((uid) => weights[uid] > 0);
      if (isPct) {
        // Compare in the same 1e6 fixed-point scale splits.ts uses, so boundaries match exactly.
        const scaled = participantIds.reduce((a, uid) => a + Math.round(weights[uid] * 1e6), 0);
        if (Math.abs(scaled - 100 * 1e6) > Math.round(PERCENTAGE_SUM_TOLERANCE * 1e6)) {
          const shown = scaled / 1e6;
          return { ok: false, error: `Percentages add up to ${shown}%, but they need to add up to 100%.` };
        }
      }
      if (owing.length === 0) {
        return {
          ok: false,
          error: isPct ? 'Give at least one person a percentage above 0.' : 'Give at least one person more than 0 shares.',
        };
      }
      const nonZero: Record<string, number> = {};
      for (const uid of owing) nonZero[uid] = weights[uid];
      shares = isPct ? splitPercentage(totalMinor, nonZero) : splitShares(totalMinor, nonZero);
    } else {
      return { ok: false, error: 'Pick how to split this expense.' };
    }

    const zero = owing.filter((uid) => !shares[uid] || shares[uid] <= 0);
    if (zero.length > 0) {
      return {
        ok: false,
        error: `${zero.map(nameOf).join(', ')} would owe nothing with this split. Remove them from the split or adjust the amounts.`,
      };
    }
    const result: Record<string, number> = {};
    for (const uid of owing) result[uid] = shares[uid];
    const sum = Object.values(result).reduce((a, b) => a + b, 0);
    if (sum !== totalMinor) return { ok: false, error: "We couldn't split this amount exactly. Please check the numbers." };
    return { ok: true, shares: result };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

/** Validates the draft and builds the input for PaydContext.addTransaction. Never throws. */
export function buildNewSplit(draft: NewSplitDraft, nameOf?: (userId: string) => string): NewSplitResult {
  const name = nameOf ?? ((id: string) => id);
  try {
    const title = (draft.title ?? '').trim();
    if (!title) return { ok: false, error: 'Give this split a name, like "Dinner" or "Groceries".' };

    const amount = parseAmountInput(draft.amountInput ?? '');
    if (!amount.ok) return { ok: false, error: amount.error };
    const totalMinor = amount.value;

    if (!draft.payerId) return { ok: false, error: 'Choose who paid.' };

    const participantIds = uniqueParticipants(draft);
    if (participantIds.length === 0) return { ok: false, error: 'Pick at least one person to split with.' };
    if (new Set([...participantIds, draft.payerId]).size < 2) {
      return { ok: false, error: 'Add at least one other person. A split with only yourself isn\'t a split.' };
    }

    const computed = computeShares(totalMinor, participantIds, draft, name);
    if (!computed.ok) return computed;

    const splits = participantIds
      .filter((uid) => computed.shares[uid] !== undefined)
      .map((uid) => ({ user_id: uid, share_minor: computed.shares[uid] }));

    if (new Set([...splits.map((s) => s.user_id), draft.payerId]).size < 2) {
      return { ok: false, error: 'Add at least one other person. A split with only yourself isn\'t a split.' };
    }
    if (splits.reduce((a, s) => a + s.share_minor, 0) !== totalMinor) {
      return { ok: false, error: "We couldn't split this amount exactly. Please check the numbers." };
    }

    const notes = (draft.notes ?? '').trim();
    const input: NewSplitTransactionInput = {
      type: 'expense',
      title,
      amount_minor: totalMinor,
      currency: LEDGER_CURRENCY,
      payer_id: draft.payerId,
      group_id: draft.groupId ?? null,
      category_id: draft.categoryId ?? null,
      notes: notes ? notes : null,
      splits,
    };
    return { ok: true, input };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

/** Best-effort live preview of each participant's share in minor units. Returns {} when the draft can't be computed yet. Never throws. */
export function previewNewSplit(draft: NewSplitDraft): Record<string, number> {
  try {
    const amount = parseAmountInput(draft.amountInput ?? '');
    if (!amount.ok) return {};
    const computed = computeShares(amount.value, uniqueParticipants(draft), draft, (id) => id);
    return computed.ok ? computed.shares : {};
  } catch {
    return {};
  }
}

/** For the UI's "remaining" hint: exact = total minus sum entered (minor units); percentage = 100 minus sum of percents; shares/equal = null. */
export function remainingForMethod(draft: NewSplitDraft): { kind: 'amount' | 'percent'; value: number } | null {
  try {
    const participantIds = uniqueParticipants(draft);
    const values = draft.values ?? {};
    if (draft.method === 'exact') {
      const total = parseAmountInput(draft.amountInput ?? '');
      const totalMinor = total.ok ? total.value : 0;
      const entered = participantIds.reduce((acc, uid) => {
        const r = parseAmountInput(values[uid] ?? '');
        return acc + (r.ok ? r.value : 0);
      }, 0);
      return { kind: 'amount', value: totalMinor - entered };
    }
    if (draft.method === 'percentage') {
      const sum = participantIds.reduce((acc, uid) => acc + lenientNumber(values[uid]), 0);
      // Round away floating-point noise (e.g. 100 - 33.33 * 3).
      return { kind: 'percent', value: Math.round((100 - sum) * 1e6) / 1e6 };
    }
    return null;
  } catch {
    return null;
  }
}
