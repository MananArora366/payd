import { describe, it, expect } from 'vitest';
import {
  splitEqual,
  splitExact,
  splitPercentage,
  splitShares,
  splitUnequal,
  LedgerInvariantError,
} from '../splits';

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const allNonNegInts = (o: Record<string, number>) =>
  Object.values(o).every((v) => Number.isSafeInteger(v) && v >= 0);

function randomTotal(rnd: () => number): number {
  const r = rnd();
  if (r < 0.3) return Math.floor(rnd() * 1000);
  if (r < 0.6) return Math.floor(rnd() * 10_000_000);
  return Math.floor(rnd() * 1e10); // up to AED 100,000,000
}

function randomIds(rnd: () => number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `u${Math.floor(rnd() * 1000)}_${i}`);
}

describe('splitEqual', () => {
  it('gives remainder fils to the first IDs in ascending string order', () => {
    // 10003 / 4 = 2500 r3 -> the three smallest IDs get +1.
    const r = splitEqual(10003, ['d', 'b', 'a', 'c']);
    expect(r).toEqual({ a: 2501, b: 2501, c: 2501, d: 2500 });
    // String sort, not numeric: 'u10' < 'u2'.
    expect(splitEqual(101, ['u2', 'u10'])).toEqual({ u10: 51, u2: 50 });
  });

  it('dedupes participants', () => {
    expect(splitEqual(100, ['a', 'a', 'b'])).toEqual({ a: 50, b: 50 });
  });

  it('rejects empty, negative and non-integer totals', () => {
    expect(() => splitEqual(100, [])).toThrow(LedgerInvariantError);
    expect(() => splitEqual(-1, ['a'])).toThrow(LedgerInvariantError);
    expect(() => splitEqual(10.5, ['a', 'b'])).toThrow(LedgerInvariantError);
    expect(() => splitEqual(NaN, ['a'])).toThrow(LedgerInvariantError);
  });

  it('property: sums exactly, spread <= 1 (20k cases)', () => {
    const rnd = makeRng(1);
    for (let i = 0; i < 20000; i++) {
      const total = randomTotal(rnd);
      const ids = randomIds(rnd, 1 + Math.floor(rnd() * 12));
      const r = splitEqual(total, ids);
      expect(sum(r)).toBe(total);
      expect(allNonNegInts(r)).toBe(true);
      const v = Object.values(r);
      expect(Math.max(...v) - Math.min(...v)).toBeLessThanOrEqual(1);
    }
  });
});

describe('splitExact / splitUnequal', () => {
  it('accepts exact integer allocations', () => {
    expect(splitExact(10000, { a: 6000, b: 4000 })).toEqual({ a: 6000, b: 4000 });
    expect(splitUnequal(5000, { a: 3000, b: 2000 })).toEqual({ a: 3000, b: 2000 });
    expect(splitExact(0, { a: 0 })).toEqual({ a: 0 });
  });

  it('rejects wrong sums, fractions, negatives and non-finite values', () => {
    expect(() => splitExact(10000, { a: 6000, b: 3999 })).toThrow(LedgerInvariantError);
    expect(() => splitExact(100, { a: 49.5, b: 50.5 })).toThrow(LedgerInvariantError);
    expect(() => splitExact(100, { a: 49.6, b: 50.4 })).toThrow(LedgerInvariantError);
    expect(() => splitExact(100, { a: 150, b: -50 })).toThrow(LedgerInvariantError);
    expect(() => splitExact(100, { a: NaN, b: 100 })).toThrow(LedgerInvariantError);
    expect(() => splitExact(100, { a: Infinity })).toThrow(LedgerInvariantError);
    expect(() => splitExact(100.5, { a: 100.5 })).toThrow(LedgerInvariantError);
    expect(() => splitExact(-100, { a: -100 })).toThrow(LedgerInvariantError);
  });

  it('returns a copy, not the input object', () => {
    const input = { a: 1, b: 2 };
    const out = splitExact(3, input);
    expect(out).not.toBe(input);
    expect(out).toEqual(input);
  });
});

describe('splitPercentage', () => {
  it('handles round percentages exactly', () => {
    expect(splitPercentage(10000, { u1: 50, u2: 25, u3: 25 })).toEqual({ u1: 5000, u2: 2500, u3: 2500 });
    expect(splitPercentage(10000, { u1: 50, u2: 30, u3: 20 })).toEqual({ u1: 5000, u2: 3000, u3: 2000 });
  });

  it('33.33 x 3 does not throw at any size (QA regression) and splits evenly', () => {
    for (const aed of [10, 50, 100, 300, 1000, 5000, 1_000_000, 100_000_000]) {
      const total = aed * 100;
      const r = splitPercentage(total, { a: 33.33, b: 33.33, c: 33.33 });
      expect(sum(r)).toBe(total);
      expect(Math.max(...Object.values(r)) - Math.min(...Object.values(r))).toBeLessThanOrEqual(1);
    }
    // 100 fils: 33.33... each, remainder 1 goes to the first ID on ties.
    expect(splitPercentage(100, { c: 33.33, a: 33.33, b: 33.34 })).toEqual({ a: 33, b: 34, c: 33 });
  });

  it('gives leftover fils to the largest remainders, ties by ascending ID', () => {
    // 1000 fils at 12.5/12.5/75 -> 125, 125, 750 exactly.
    expect(splitPercentage(1000, { x: 12.5, y: 12.5, z: 75 })).toEqual({ x: 125, y: 125, z: 750 });
    // 10 fils at 15/15/70 -> exact 1.5/1.5/7: one leftover fil, tie between a and b -> a.
    expect(splitPercentage(10, { b: 15, a: 15, c: 70 })).toEqual({ a: 2, b: 1, c: 7 });
    // 7 fils at 10/20/70 -> exact 0.7/1.4/4.9: floors 0/1/4, leftovers to c (0.9) then a (0.7).
    expect(splitPercentage(7, { a: 10, b: 20, c: 70 })).toEqual({ a: 1, b: 1, c: 5 });
  });

  it('a 0% participant gets nothing', () => {
    const r = splitPercentage(101, { a: 0, b: 50, c: 50 });
    expect(r.a).toBe(0);
    expect(sum(r)).toBe(101);
  });

  it('validates input', () => {
    expect(() => splitPercentage(10000, { u1: 50, u2: 40 })).toThrow(LedgerInvariantError);
    expect(() => splitPercentage(10000, { u1: 120, u2: -20 })).toThrow(/negative/);
    expect(() => splitPercentage(10000, { u1: NaN, u2: 100 })).toThrow(LedgerInvariantError);
    expect(() => splitPercentage(10000, { u1: Infinity })).toThrow(LedgerInvariantError);
    expect(() => splitPercentage(10000, {})).toThrow(LedgerInvariantError);
    expect(() => splitPercentage(100.5, { a: 100 })).toThrow(LedgerInvariantError);
    expect(() => splitPercentage(-100, { a: 100 })).toThrow(LedgerInvariantError);
    // Tolerance: 99.85..100.15 accepted.
    expect(() => splitPercentage(10000, { a: 50, b: 49.85 })).not.toThrow();
    expect(() => splitPercentage(10000, { a: 50, b: 50.15 })).not.toThrow();
    expect(() => splitPercentage(10000, { a: 50, b: 50.2 })).toThrow(LedgerInvariantError);
  });

  it('property: 20k random 2dp percentages, totals up to 1e10 fils', () => {
    const rnd = makeRng(2024);
    for (let i = 0; i < 20000; i++) {
      const total = randomTotal(rnd);
      const ids = randomIds(rnd, 1 + Math.floor(rnd() * 12));
      const raw = ids.map(() => (rnd() < 0.1 ? 0 : rnd() + 0.01));
      const s = raw.reduce((a, b) => a + b, 0) || 1;
      const pct: Record<string, number> = {};
      ids.forEach((id, k) => (pct[id] = Math.round((raw[k] / s) * 10000) / 100));
      if (raw.every((x) => x === 0)) pct[ids[0]] = 100;
      const pctSum = Object.values(pct).reduce((a, b) => a + b, 0);
      if (Math.abs(pctSum - 100) > 0.15) continue; // generator outside tolerance; skip

      const r = splitPercentage(total, pct);
      expect(sum(r)).toBe(total);
      expect(allNonNegInts(r)).toBe(true);
      for (const id of ids) {
        const ideal = (total * pct[id]) / pctSum;
        // Largest remainder: within 1 fil of the ideal (+ float slack on huge totals).
        expect(Math.abs(r[id] - ideal)).toBeLessThan(1 + 1e-4);
        if (pct[id] === 0) expect(r[id]).toBe(0);
      }
    }
  });
});

describe('splitShares', () => {
  it('splits by weight', () => {
    expect(splitShares(10000, { rahul: 2, sarah: 1, prakarsh: 1 })).toEqual({ rahul: 5000, sarah: 2500, prakarsh: 2500 });
    expect(splitShares(10000, { u1: 3, u2: 1 })).toEqual({ u1: 7500, u2: 2500 });
  });

  it('zero-share users get nothing, even when there is a remainder (QA regression)', () => {
    const r = splitShares(100, { a: 0, b: 1, c: 1, d: 1 });
    expect(r).toEqual({ a: 0, b: 34, c: 33, d: 33 });
    expect(splitShares(5, { a: 0, z: 1 })).toEqual({ a: 0, z: 5 });
  });

  it('gives leftovers to the largest remainders, ties by ascending ID', () => {
    // 10 fils, shares 1/1/3 -> exact 2/2/6.
    expect(splitShares(10, { a: 1, b: 1, c: 3 })).toEqual({ a: 2, b: 2, c: 6 });
    // 11 fils, shares 1/1/3 -> exact 2.2/2.2/6.6: floors 2/2/6, leftover to c.
    expect(splitShares(11, { a: 1, b: 1, c: 3 })).toEqual({ a: 2, b: 2, c: 7 });
    // Fractional shares.
    expect(splitShares(100, { a: 1.5, b: 0.5 })).toEqual({ a: 75, b: 25 });
  });

  it('validates input', () => {
    expect(() => splitShares(100, {})).toThrow(LedgerInvariantError);
    expect(() => splitShares(100, { a: 0, b: 0 })).toThrow(/zero/);
    expect(() => splitShares(100, { a: -1, b: 2 })).toThrow(/negative/);
    expect(() => splitShares(100, { a: NaN, b: 1 })).toThrow(LedgerInvariantError);
    expect(() => splitShares(100, { a: Infinity, b: 1 })).toThrow(LedgerInvariantError);
    expect(() => splitShares(100.5, { a: 1 })).toThrow(LedgerInvariantError);
    expect(() => splitShares(-100, { a: 1 })).toThrow(LedgerInvariantError);
    expect(() => splitShares(NaN, { a: 1 })).toThrow(LedgerInvariantError);
  });

  it('property: 20k random weights incl. zeros, totals up to 1e10 fils', () => {
    const rnd = makeRng(77);
    for (let i = 0; i < 20000; i++) {
      const total = randomTotal(rnd);
      const ids = randomIds(rnd, 1 + Math.floor(rnd() * 12));
      const sh: Record<string, number> = {};
      ids.forEach((id) => (sh[id] = Math.floor(rnd() * 6)));
      if (sum(sh) === 0) sh[ids[0]] = 1;
      const totalShares = sum(sh);

      const r = splitShares(total, sh);
      expect(sum(r)).toBe(total);
      expect(allNonNegInts(r)).toBe(true);
      for (const id of ids) {
        if (sh[id] === 0) expect(r[id]).toBe(0);
        expect(Math.abs(r[id] - (total * sh[id]) / totalShares)).toBeLessThan(1 + 1e-6);
      }
    }
  });
});
