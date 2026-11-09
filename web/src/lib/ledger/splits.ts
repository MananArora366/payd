// Invariant 3: Payer & Allocation Invariants
// The sum of all split shares must exactly equal the total expense amount.
// Remainders (e.g., 100 split 3 ways = 34, 33, 33) are distributed deterministically
// to the first participants sorted by stable user ID.

export class LedgerInvariantError extends Error {
  constructor(message: string) {
    super(`Ledger Invariant Violation: ${message}`);
    this.name = 'LedgerInvariantError';
  }
}

/**
 * Splits total minor units equally among given userIds.
 * Remainder is distributed deterministically by stable user ID order (ascending string sort).
 */
export function splitEqual(totalMinor: number, userIds: string[]): Record<string, number> {
  if (!userIds || userIds.length === 0) {
    throw new LedgerInvariantError('Cannot split with zero participants');
  }
  if (totalMinor < 0) {
    throw new LedgerInvariantError('Total amount cannot be negative');
  }

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
 */
export function splitExact(totalMinor: number, allocations: Record<string, number>): Record<string, number> {
  const sum = Object.values(allocations).reduce((acc, val) => {
    if (val < 0) throw new LedgerInvariantError('Individual split amount cannot be negative');
    return acc + Math.round(val);
  }, 0);

  if (sum !== totalMinor) {
    throw new LedgerInvariantError(
      `Exact split allocations sum to ${sum} minor units, but total is ${totalMinor} minor units (difference: ${totalMinor - sum})`
    );
  }

  return { ...allocations };
}

/**
 * Splits by percentages (e.g., 50, 25, 25 or 33.33, 33.33, 33.34).
 * Validates percentage sum equals 100 (allowing 99.9-100.1 due to 2-decimal rounding).
 * Distributes rounding minor unit differences deterministically by stable user ID.
 */
export function splitPercentage(totalMinor: number, percentages: Record<string, number>): Record<string, number> {
  const userIds = Object.keys(percentages).sort();
  if (userIds.length === 0) {
    throw new LedgerInvariantError('Cannot split with zero participants');
  }

  const percentSum = userIds.reduce((acc, id) => acc + percentages[id], 0);
  // Allow slight tolerance in input percentage floats (e.g. 33.33 * 3 = 99.99)
  if (Math.abs(percentSum - 100) > 0.15) {
    throw new LedgerInvariantError(`Percentages sum to ${percentSum}%, but must sum to 100%`);
  }

  const result: Record<string, number> = {};
  let allocatedSum = 0;

  for (const id of userIds) {
    const rawShare = Math.round((totalMinor * percentages[id]) / 100);
    result[id] = rawShare;
    allocatedSum += rawShare;
  }

  // Distribute any discrepancy due to rounding deterministically
  let diff = totalMinor - allocatedSum;
  let idx = 0;
  while (diff !== 0 && idx < userIds.length * 2) {
    const id = userIds[idx % userIds.length];
    if (diff > 0) {
      result[id] += 1;
      diff -= 1;
    } else {
      if (result[id] > 0) {
        result[id] -= 1;
        diff += 1;
      }
    }
    idx++;
  }

  // Invariant assertion
  const finalSum = Object.values(result).reduce((a, b) => a + b, 0);
  if (finalSum !== totalMinor) {
    throw new LedgerInvariantError(`Percentage split failed invariant: ${finalSum} !== ${totalMinor}`);
  }

  return result;
}

/**
 * Splits by weighted shares (e.g. 2 shares, 1 share, 1 share).
 */
export function splitShares(totalMinor: number, shares: Record<string, number>): Record<string, number> {
  const userIds = Object.keys(shares).sort();
  if (userIds.length === 0) {
    throw new LedgerInvariantError('Cannot split with zero participants');
  }

  const totalShares = userIds.reduce((acc, id) => {
    if (shares[id] < 0) throw new LedgerInvariantError('Shares cannot be negative');
    return acc + shares[id];
  }, 0);

  if (totalShares === 0) {
    throw new LedgerInvariantError('Total shares cannot be zero');
  }

  const result: Record<string, number> = {};
  let allocated = 0;

  for (const id of userIds) {
    const share = Math.floor((totalMinor * shares[id]) / totalShares);
    result[id] = share;
    allocated += share;
  }

  let remainder = totalMinor - allocated;
  let idx = 0;
  while (remainder > 0) {
    const id = userIds[idx % userIds.length];
    result[id] += 1;
    remainder--;
    idx++;
  }

  return result;
}

/**
 * Splits unequally with validation that sum matches totalMinor.
 */
export function splitUnequal(totalMinor: number, allocations: Record<string, number>): Record<string, number> {
  return splitExact(totalMinor, allocations);
}
