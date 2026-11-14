/**
 * Pure helpers for AddExpenseModal (amount parsing, split calculation, claim pruning).
 * Kept framework-free so they can be unit tested. All money is integer fils (AED minor units).
 */
import { parseMajorToMinor, splitEqual, splitExact, formatMinorUnits } from '@/lib/ledger';
import { calculateItemizedShares } from '@/lib/ai/receipt-scan';

export const LEDGER_CURRENCY = 'AED';

/** Largest amount accepted from a form field: AED 1,000,000,000 (well inside safe-integer fils). */
const MAX_MINOR = 1_000_000_000 * 100;

export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

/** Plain digits ("1250", "1250.5", ".5") or comma-grouped thousands ("1,250.50"). */
const AMOUNT_RE = /^(?:\d+|\d{1,3}(?:,\d{3})+)?(?:\.\d*)?$/;

/**
 * Strictly parses a user-typed AED amount into fils. Rejects exponent notation, multiple dots,
 * signs, letters, more than 2 decimals, zero and absurdly large values with a friendly message.
 */
export function parseAmountInput(input: string, label = 'amount'): ParseResult {
  const s = (input ?? '').trim();
  if (!s) return { ok: false, error: `Please enter an ${label}.` };
  if (!AMOUNT_RE.test(s) || !/\d/.test(s)) {
    return { ok: false, error: `"${s}" isn't a valid ${label}. Use numbers like 42.50.` };
  }
  const frac = s.split('.')[1] ?? '';
  if (frac.length > 2) {
    return { ok: false, error: `Use at most 2 decimal places for the ${label} (fils).` };
  }
  const value = parseMajorToMinor(s.replace(/,/g, ''), LEDGER_CURRENCY);
  if (!Number.isSafeInteger(value) || value > MAX_MINOR) {
    return { ok: false, error: `That ${label} is too large.` };
  }
  if (value <= 0) return { ok: false, error: `Please enter an ${label} greater than 0.` };
  return { ok: true, value };
}

/** Lenient parse for live previews: invalid or empty input counts as 0. */
export function previewMinor(input: string): number {
  const r = parseAmountInput(input);
  return r.ok ? r.value : 0;
}

/** Maps internal ledger errors to plain language. */
export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (/zero participants|without participants/i.test(msg)) return 'Pick at least one person to split with.';
  if (/negative/i.test(msg)) return 'Amounts cannot be negative.';
  if (/Exact split allocations sum/i.test(msg)) return "The per-person amounts don't add up to the total.";
  if (/invariant|minor units/i.test(msg)) return "We couldn't split this amount. Please check the numbers and try again.";
  return msg || 'Failed to save transaction.';
}

export interface FormItem {
  id: string;
  name: string;
  amountStr: string;
  /** Empty = shared by every participant. */
  assignedUserIds: string[];
}

export function itemsSubtotalMinor(items: FormItem[]): number {
  return items.reduce((acc, item) => acc + previewMinor(item.amountStr), 0);
}

/**
 * Removes claims by users who are no longer participants. Returns the names of items that were
 * claimed only by removed users (they now fall back to being shared by everyone).
 */
export function pruneClaims(items: FormItem[], participantIds: string[]): { items: FormItem[]; orphaned: string[] } {
  const keep = new Set(participantIds);
  const orphaned: string[] = [];
  const next = items.map((item) => {
    if (item.assignedUserIds.every((u) => keep.has(u))) return item;
    const assignedUserIds = item.assignedUserIds.filter((u) => keep.has(u));
    if (assignedUserIds.length === 0) orphaned.push(item.name || 'Item');
    return { ...item, assignedUserIds };
  });
  return { items: next, orphaned };
}

export interface SplitInput {
  type: 'expense' | 'income';
  totalMinor: number;
  payerId: string;
  splitMethod: 'equal' | 'exact' | 'itemized';
  participantIds: string[];
  exactAmounts: Record<string, string>;
  items: FormItem[];
  /** Used to name people in error messages. */
  nameOf?: (userId: string) => string;
}

export type SplitResult =
  | { ok: true; splits: { user_id: string; share_minor: number }[] }
  | { ok: false; error: string };

/** Computes the splits to save, validating every share is positive and the total is exact. */
export function computeSplits(input: SplitInput): SplitResult {
  const { type, totalMinor, payerId, splitMethod, exactAmounts, items } = input;
  const nameOf = input.nameOf ?? ((id: string) => id);
  const participantIds = [...new Set(input.participantIds)];
  try {
    if (totalMinor <= 0) return { ok: false, error: 'Please enter an amount greater than 0.' };
    if (type === 'income') return { ok: true, splits: [{ user_id: payerId, share_minor: totalMinor }] };
    if (participantIds.length === 0) return { ok: false, error: 'Pick at least one person to split with.' };

    let shares: Record<string, number>;
    if (splitMethod === 'equal') {
      if (totalMinor < participantIds.length) {
        return {
          ok: false,
          error: `${formatMinorUnits(totalMinor, LEDGER_CURRENCY)} is too small to split between ${participantIds.length} people. Someone would owe nothing.`,
        };
      }
      shares = splitEqual(totalMinor, participantIds);
    } else if (splitMethod === 'exact') {
      const alloc: Record<string, number> = {};
      for (const uid of participantIds) {
        const raw = (exactAmounts[uid] ?? '').trim();
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
          error: `Per-person amounts add up to ${formatMinorUnits(sum, LEDGER_CURRENCY)}, but the total is ${formatMinorUnits(totalMinor, LEDGER_CURRENCY)} (${diff > 0 ? 'short by' : 'over by'} ${formatMinorUnits(Math.abs(diff), LEDGER_CURRENCY)}).`,
        };
      }
      shares = splitExact(totalMinor, alloc);
    } else {
      const parsedItems: number[] = [];
      for (const item of items) {
        const raw = item.amountStr.trim();
        if (!raw) {
          parsedItems.push(0);
          continue;
        }
        const r = parseAmountInput(raw, `price for "${item.name || 'item'}"`);
        if (!r.ok) return { ok: false, error: r.error };
        parsedItems.push(r.value);
      }
      const keep = new Set(participantIds);
      const lineItems = items.map((item, idx) => ({ name: item.name || 'Item', quantity: 1, price_minor: parsedItems[idx] }));
      const assignments: Record<number, string[]> = {};
      items.forEach((item, idx) => {
        const claimed = item.assignedUserIds.filter((u) => keep.has(u));
        assignments[idx] = claimed.length > 0 ? claimed : participantIds;
      });
      shares = calculateItemizedShares(totalMinor, lineItems, assignments, participantIds);
    }

    const zero = participantIds.filter((uid) => !shares[uid] || shares[uid] <= 0);
    if (zero.length > 0) {
      return {
        ok: false,
        error: `${zero.map(nameOf).join(', ')} would owe nothing with this split. Remove them from the split or adjust the amounts.`,
      };
    }
    const splits = participantIds.map((uid) => ({ user_id: uid, share_minor: shares[uid] }));
    const sum = splits.reduce((a, s) => a + s.share_minor, 0);
    if (sum !== totalMinor) return { ok: false, error: "We couldn't split this amount exactly. Please check the numbers." };
    return { ok: true, splits };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}
