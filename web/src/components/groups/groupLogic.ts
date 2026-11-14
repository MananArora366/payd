/**
 * Pure helpers for the Groups tab, invite flow and Fair Payer Roulette.
 * Kept free of React so they can be unit tested.
 */
import { Group, GroupMember } from '@/types/database';
import { tryParseMajorToMinor } from '@/lib/ledger/currency';

/** Hard-coded demo invite tokens, mirrored from PaydContext.joinGroupByToken. */
export const DEMO_INVITE_TOKENS: Record<string, (g: Group) => boolean> = {
  'dubai-marina-2026': (g) => g.name.includes('Flatmates'),
  'hatta-camp-2026': (g) => g.name.includes('Hatta'),
};

/**
 * Extracts an invite token from whatever the user pasted: a bare token,
 * a full invite URL (https://host/join/<token>?x=y#z), or a path (/join/<token>).
 */
export function extractInviteToken(input: string): string {
  let raw = (input || '').trim();
  if (!raw) return '';
  const joinIdx = raw.search(/\/join\//i);
  if (joinIdx >= 0) {
    raw = raw.slice(joinIdx + '/join/'.length);
  }
  raw = raw.split(/[?#]/)[0].replace(/\/+$/, '');
  // If there were further path segments, the token is the first one after /join/
  if (joinIdx >= 0) raw = raw.split('/')[0];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // keep raw on malformed escapes
  }
  return raw.trim();
}

/**
 * Resolves the group an invite token refers to, using the same rules as
 * joinGroupByToken: exact group id, or one of the demo tokens. Returns null otherwise.
 */
export function resolveInviteGroup(token: string, groups: Group[]): Group | null {
  const t = extractInviteToken(token);
  if (!t) return null;
  const byId = groups.find((g) => g.id === t);
  if (byId) return byId;
  const matcher = DEMO_INVITE_TOKENS[t];
  if (matcher) return groups.find(matcher) || null;
  return null;
}

/** Groups the given user is a member of, preserving order. */
export function filterGroupsForUser(groups: Group[], groupMembers: GroupMember[], userId: string): Group[] {
  const mine = new Set(groupMembers.filter((m) => m.user_id === userId).map((m) => m.group_id));
  return groups.filter((g) => mine.has(g.id));
}

/** Re-exported so existing imports keep working; the rule lives in @/lib/icons. */
export { getGroupEmoji } from '@/lib/icons';

/** Sum of a balance map in minor units. A healthy group ledger sums to 0. */
export function sumBalances(balances: Record<string, number>): number {
  return Object.values(balances).reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
}

export type AmountResult = { ok: true; value: number } | { ok: false; error: string };

/**
 * Parses a user-entered AED amount into fils. Never throws.
 * Uses tryParseMajorToMinor so malformed input ("1e3", "1.2.3") gets a clear message.
 */
export function parseAmountInput(input: string): AmountResult {
  const trimmed = (input || '').trim();
  if (!trimmed) return { ok: false, error: 'Please enter an amount.' };
  let parsed: ReturnType<typeof tryParseMajorToMinor>;
  try {
    parsed = tryParseMajorToMinor(trimmed, 'AED');
  } catch {
    return { ok: false, error: 'Please enter a valid amount.' };
  }
  if (!parsed.ok) return { ok: false, error: parsed.error || 'Please enter a valid amount.' };
  const value = parsed.value;
  if (!Number.isSafeInteger(value)) return { ok: false, error: 'Please enter a valid amount.' };
  if (value < 0) return { ok: false, error: 'Amount cannot be negative.' };
  if (value === 0) return { ok: false, error: 'Please enter an amount greater than AED 0.' };
  return { ok: true, value };
}

/** Fils of debt that earn one extra slice on the roulette wheel (AED 25). */
export const ROULETTE_FILS_PER_EXTRA_SLICE = 2500;
export const ROULETTE_MAX_EXTRA_SLICES = 10;

/**
 * Wheel weights. Everyone gets 1. In debt-weighted mode a member who owes the
 * group (negative group balance) gets +1 per AED 25 owed, capped at +10.
 */
export function computeRouletteWeights(
  userIds: string[],
  groupBalances: Record<string, number>,
  mode: 'debt_weighted' | 'equal'
): { userId: string; weight: number }[] {
  return userIds.map((userId) => {
    if (mode === 'equal') return { userId, weight: 1 };
    const net = groupBalances[userId] ?? 0;
    const extra =
      net < 0
        ? Math.min(ROULETTE_MAX_EXTRA_SLICES, Math.ceil(Math.abs(net) / ROULETTE_FILS_PER_EXTRA_SLICE))
        : 0;
    return { userId, weight: 1 + extra };
  });
}

/** Picks a weighted index given a random number in [0, 1). */
export function pickWeightedIndex(weights: number[], rand01: number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0 || total <= 0) return -1;
  const target = rand01 * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (target < acc) return i;
  }
  return weights.length - 1;
}
