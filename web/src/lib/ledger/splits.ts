// Invariant 3: Payer & Allocation Invariants
// The sum of all split shares must exactly equal the total expense amount.
// Remainders (e.g., 100 split 3 ways = 34, 33, 33) are distributed deterministically:
// equal splits give them to the first participants sorted by stable user ID; percentage and
// share splits use largest-remainder allocation (ties broken by ascending user ID).
// All totals and returned shares are non-negative safe integers (minor units).

export class LedgerInvariantError extends Error {
  constructor(message: string) {
    super(`Ledger Invariant Violation: ${message}`);
    this.name = 'LedgerInvariantError';
  }
}

function assertValidTotal(totalMinor: number): void {
  if (typeof totalMinor !== 'number' || !Number.isSafeInteger(totalMinor)) {
    throw new LedgerInvariantError(`Total amount must be a whole number of minor units (got ${totalMinor})`);
  }
  if (totalMinor < 0) {
    throw new LedgerInvariantError('Total amount cannot be negative');
  }
}

function sumOf(result: Record<string, number>): number {
  return Object.values(result).reduce((acc, val) => acc + val, 0);
}

/** Fixed-point scale used to turn fractional weights (33.33%, 1.5 shares) into exact integers. */
const WEIGHT_SCALE = 1_000_000;

function toScaledWeight(value: number, label: string): bigint {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new LedgerInvariantError(`${label} must be a finite number (got ${value})`);
  }
  if (value < 0) {
    throw new LedgerInvariantError(`${label} cannot be negative`);
  }
  return BigInt(Math.round(value * WEIGHT_SCALE));
}

/**
 * Largest-remainder (Hamilton) allocation using exact integer (BigInt) arithmetic.
 * Each user first gets floor(total * w / W). The leftover minor units (always fewer than the
 * number of users with a non-zero remainder) go one each to the largest remainders; ties are
 * broken by ascending user ID. A user with weight 0 always receives exactly 0.
 */
function allocateLargestRemainder(
  totalMinor: number,
  sortedIds: string[],
  weights: Map<string, bigint>
): Record<string, number> {
  const W = sortedIds.reduce((acc, id) => acc + (weights.get(id) as bigint), BigInt(0));
  if (W <= BigInt(0)) {
    throw new LedgerInvariantError('Total weight cannot be zero');
  }
  const total = BigInt(totalMinor);
  const result: Record<string, number> = {};
  const remainders: { id: string; rem: bigint; order: number }[] = [];
  let allocated = BigInt(0);
  sortedIds.forEach((id, order) => {
    const product = total * (weights.get(id) as bigint);
    const base = product / W;
    result[id] = Number(base);
    allocated += base;
    remainders.push({ id, rem: product % W, order });
  });

  let leftover = Number(total - allocated);
  remainders.sort((a, b) => (a.rem === b.rem ? a.order - b.order : a.rem > b.rem ? -1 : 1));
  for (let i = 0; leftover > 0 && i < remainders.length; i++) {
    if (remainders[i].rem === BigInt(0)) break;
    result[remainders[i].id] += 1;
    leftover--;
  }

  const finalSum = sumOf(result);
  if (finalSum !== totalMinor) {
    throw new LedgerInvariantError(`Weighted split failed invariant: ${finalSum} !== ${totalMinor}`);
  }
  return result;
}

/**
 * Splits total minor units equally among given userIds.
 * Remainder is distributed deterministically by stable user ID order (ascending string sort).
 */
export function splitEqual(totalMinor: number, userIds: string[]): Record<string, number> {
  if (!userIds || userIds.length === 0) {
    throw new LedgerInvariantError('Cannot split with zero participants');
  }
  assertValidTotal(totalMinor);

  // Stable sort by user ID to guarantee determinism
  const sortedIds = [...new Set(userIds)].sort();
  const count = sortedIds.length;

  const baseShare = Math.floor(totalMinor / count);
  let remainder = totalMinor % count;

  const result: Record<string, number> = {};
  for (const id of sortedIds) {
    result[id] = baseShare + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder--;
    }
  }

  // Verification invariant check
  const sum = Object.values(result).reduce((acc, val) => acc + val, 0);
  if (sum !== totalMinor) {
    throw new LedgerInvariantError(`Split sum (${sum}) does not match totalMinor (${totalMinor})`);
  }

  return result;
}

/**
 * Validates and records exact split allocations where each user pays an exact minor unit amount.
 * Every amount must be a non-negative whole number of minor units and they must sum to totalMinor.
 */
export function splitExact(totalMinor: number, allocations: Record<string, number>): Record<string, number> {
  assertValidTotal(totalMinor);
  const result: Record<string, number> = {};
  for (const [id, val] of Object.entries(allocations)) {
    if (typeof val !== 'number' || !Number.isSafeInteger(val)) {
      throw new LedgerInvariantError(`Individual split amount must be a whole number of minor units (got ${val})`);
    }
    if (val < 0) throw new LedgerInvariantError('Individual split amount cannot be negative');
    result[id] = val;
  }
  const sum = sumOf(result);

  if (sum !== totalMinor) {
    throw new LedgerInvariantError(
      `Exact split allocations sum to ${sum} minor units, but total is ${totalMinor} minor units (difference: ${totalMinor - sum})`
    );
  }

  return result;
}

/** Allowed deviation of the percentage sum from 100 (covers 2-decimal inputs like 33.33 x 3 = 99.99). */
export const PERCENTAGE_SUM_TOLERANCE = 0.15;

/**
 * Splits by percentages (e.g., 50, 25, 25 or 33.33, 33.33, 33.33).
 * - Percentages must be finite and non-negative, and sum to 100 within PERCENTAGE_SUM_TOLERANCE.
 * - Percentages are treated as relative weights (normalised by their actual sum), so
 *   33.33/33.33/33.33 is an exact three-way split rather than 99.99% of the total.
 * - Allocation is largest-remainder in exact integer arithmetic: floors first, then leftover
 *   minor units go to the largest fractional remainders, ties broken by ascending user ID.
 *   A 0% participant always gets 0. The result always sums exactly to totalMinor.
 */
export function splitPercentage(totalMinor: number, percentages: Record<string, number>): Record<string, number> {
  assertValidTotal(totalMinor);
  const userIds = Object.keys(percentages).sort();
  if (userIds.length === 0) {
    throw new LedgerInvariantError('Cannot split with zero participants');
  }

  const weights = new Map<string, bigint>();
  let scaledSum = BigInt(0);
  for (const id of userIds) {
    const w = toScaledWeight(percentages[id], 'Percentage');
    weights.set(id, w);
    scaledSum += w;
  }

  const target = BigInt(100 * WEIGHT_SCALE);
  const tolerance = BigInt(Math.round(PERCENTAGE_SUM_TOLERANCE * WEIGHT_SCALE));
  const deviation = scaledSum > target ? scaledSum - target : target - scaledSum;
  if (deviation > tolerance) {
    const percentSum = Number(scaledSum) / WEIGHT_SCALE;
    throw new LedgerInvariantError(`Percentages sum to ${percentSum}%, but must sum to 100%`);
  }

  return allocateLargestRemainder(totalMinor, userIds, weights);
}

/**
 * Splits by weighted shares (e.g. 2 shares, 1 share, 1 share). Shares must be finite and
 * non-negative with a positive total; fractional shares (1.5) are supported to 6 decimals.
 * Users with 0 shares get 0. Largest-remainder allocation, ties by ascending user ID;
 * the result always sums exactly to totalMinor.
 */
export function splitShares(totalMinor: number, shares: Record<string, number>): Record<string, number> {
  assertValidTotal(totalMinor);
  const userIds = Object.keys(shares).sort();
  if (userIds.length === 0) {
    throw new LedgerInvariantError('Cannot split with zero participants');
  }

  const weights = new Map<string, bigint>();
  let totalShares = BigInt(0);
  for (const id of userIds) {
    const w = toScaledWeight(shares[id], 'Shares');
    weights.set(id, w);
    totalShares += w;
  }

  if (totalShares === BigInt(0)) {
    throw new LedgerInvariantError('Total shares cannot be zero');
  }

  return allocateLargestRemainder(totalMinor, userIds, weights);
}

/**
 * Splits unequally with validation that sum matches totalMinor.
 */
export function splitUnequal(totalMinor: number, allocations: Record<string, number>): Record<string, number> {
  return splitExact(totalMinor, allocations);
}
