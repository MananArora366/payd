import { describe, it, expect } from 'vitest';
import { computeSplits, friendlyError, parseAmountInput, pruneClaims, itemsSubtotalMinor, type FormItem } from './addExpenseLogic';

const item = (name: string, amountStr: string, assignedUserIds: string[] = []): FormItem => ({
  id: name,
  name,
  amountStr,
  assignedUserIds,
});

const base = {
  type: 'expense' as const,
  payerId: 'a',
  exactAmounts: {},
  items: [] as FormItem[],
};

describe('parseAmountInput', () => {
  it('accepts plain and grouped amounts', () => {
    expect(parseAmountInput('42.5')).toEqual({ ok: true, value: 4250 });
    expect(parseAmountInput('1,250.50')).toEqual({ ok: true, value: 125050 });
    expect(parseAmountInput('.5')).toEqual({ ok: true, value: 50 });
    expect(parseAmountInput(' 10 ')).toEqual({ ok: true, value: 1000 });
  });

  it.each(['', '0', '0.00', '1e3', '1.2.3', '-5', 'abc', '12,34', '1.234', '.', '1e21'])('rejects %j', (s) => {
    const r = parseAmountInput(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toMatch(/invariant|minor units/i);
  });

  it('rejects absurdly large amounts', () => {
    expect(parseAmountInput('99999999999999').ok).toBe(false);
  });
});

describe('computeSplits', () => {
  it('splits equally to the fils', () => {
    const r = computeSplits({ ...base, totalMinor: 1000, splitMethod: 'equal', participantIds: ['a', 'b', 'c'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.splits.reduce((s, x) => s + x.share_minor, 0)).toBe(1000);
  });

  it('blocks splits where someone would owe 0 (0.01 between 3)', () => {
    const r = computeSplits({ ...base, totalMinor: 1, splitMethod: 'equal', participantIds: ['a', 'b', 'c'] });
    expect(r.ok).toBe(false);
  });

  it('gives a friendly message when exact amounts do not add up', () => {
    const r = computeSplits({
      ...base,
      totalMinor: 1000,
      splitMethod: 'exact',
      participantIds: ['a', 'b'],
      exactAmounts: { a: '4', b: '5' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/short by/);
      expect(r.error).not.toMatch(/minor units|invariant/i);
    }
  });

  it('itemized: total above the item subtotal is shared proportionally', () => {
    const r = computeSplits({
      ...base,
      totalMinor: 3750, // items 30.00 + 7.50 fees
      splitMethod: 'itemized',
      participantIds: ['a', 'b'],
      items: [item('Burger', '20', ['a']), item('Fries', '10', ['b'])],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const by = Object.fromEntries(r.splits.map((s) => [s.user_id, s.share_minor]));
      expect(by).toEqual({ a: 2500, b: 1250 });
    }
  });

  it('itemized: ignores claims by non-participants instead of losing money', () => {
    const r = computeSplits({
      ...base,
      totalMinor: 3000,
      splitMethod: 'itemized',
      participantIds: ['a', 'b'],
      items: [item('Burger', '20', ['a', 'zed']), item('Fries', '10')],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const by = Object.fromEntries(r.splits.map((s) => [s.user_id, s.share_minor]));
      expect(by).toEqual({ a: 2500, b: 500 });
      expect(by.zed).toBeUndefined();
    }
  });

  it('itemized: blocks when a participant claimed nothing', () => {
    const r = computeSplits({
      ...base,
      totalMinor: 2000,
      splitMethod: 'itemized',
      participantIds: ['a', 'b'],
      items: [item('Burger', '20', ['a'])],
      nameOf: (id) => id.toUpperCase(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^B would owe nothing/);
  });

  it('income goes entirely to the payer', () => {
    const r = computeSplits({ ...base, type: 'income', totalMinor: 500, splitMethod: 'equal', participantIds: ['a', 'b'] });
    expect(r).toEqual({ ok: true, splits: [{ user_id: 'a', share_minor: 500 }] });
  });
});

describe('pruneClaims', () => {
  it('drops removed users and reports items left without a claimant', () => {
    const items = [item('Burger', '20', ['a', 'b']), item('Shake', '5', ['b']), item('Fries', '10')];
    const { items: next, orphaned } = pruneClaims(items, ['a']);
    expect(next.map((i) => i.assignedUserIds)).toEqual([['a'], [], []]);
    expect(orphaned).toEqual(['Shake']);
    expect(next[2]).toBe(items[2]);
  });
});

describe('helpers', () => {
  it('sums item subtotal ignoring invalid prices', () => {
    expect(itemsSubtotalMinor([item('x', '1.50'), item('y', 'abc'), item('z', '')])).toBe(150);
  });
  it('hides ledger jargon', () => {
    expect(friendlyError(new Error('Ledger Invariant Violation: Split sum 3 does not match'))).not.toMatch(/invariant/i);
  });
});
