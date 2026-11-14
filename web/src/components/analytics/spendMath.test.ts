import { describe, it, expect } from 'vitest';
import {
  getMyExpenseShareMinor,
  groupSpendMinor,
  isCareemExpense,
  isParticipant,
  monthlyCategoryShares,
  sortByDateDesc,
  volumeByType,
  type SpendTxn,
  type SpendSplit,
} from './spendMath';

const ME = 'me';
const txn = (over: Partial<SpendTxn>): SpendTxn => ({
  id: 't',
  type: 'expense',
  title: 'Thing',
  amount_minor: 10000,
  payer_id: ME,
  occurred_at: '2026-11-10T10:00:00.000Z',
  ...over,
});

describe('spendMath', () => {
  const splits: SpendSplit[] = [
    { transaction_id: 'g1', user_id: ME, share_minor: 3334 },
    { transaction_id: 'g1', user_id: 'b', share_minor: 3333 },
    { transaction_id: 'g1', user_id: 'c', share_minor: 3333 },
    { transaction_id: 'g2', user_id: 'b', share_minor: 5000 },
    { transaction_id: 'g2', user_id: 'c', share_minor: 5000 },
  ];

  it('uses my split share, full amount for personal, 0 when not a participant or income', () => {
    expect(getMyExpenseShareMinor(txn({ id: 'g1', group_id: 'G', payer_id: 'b' }), ME, splits)).toBe(3334);
    expect(getMyExpenseShareMinor(txn({ id: 'p1' }), ME, splits)).toBe(10000);
    expect(getMyExpenseShareMinor(txn({ id: 'g2', group_id: 'G', payer_id: 'b' }), ME, splits)).toBe(0);
    expect(getMyExpenseShareMinor(txn({ id: 'i1', type: 'income' }), ME, splits)).toBe(0);
    expect(isParticipant(txn({ id: 'g2' }), ME, splits)).toBe(false);
    expect(isParticipant(txn({ id: 'g1' }), ME, splits)).toBe(true);
  });

  it('sorts newest first without mutating', () => {
    const list = [
      txn({ id: 'a', occurred_at: '2026-11-01T00:00:00Z' }),
      txn({ id: 'b', occurred_at: '2026-11-12T00:00:00Z' }),
      txn({ id: 'c', occurred_at: '2026-11-05T00:00:00Z' }),
    ];
    expect(sortByDateDesc(list).map((t) => t.id)).toEqual(['b', 'c', 'a']);
    expect(list.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('group spend excludes income, refunds and deleted', () => {
    const list = [
      txn({ id: '1', group_id: 'G', amount_minor: 1000 }),
      txn({ id: '2', group_id: 'G', type: 'income', amount_minor: 99999 }),
      txn({ id: '3', group_id: 'G', type: 'refund', amount_minor: 500 }),
      txn({ id: '4', group_id: 'G', amount_minor: 700, deleted_at: '2026-11-11T00:00:00Z' }),
      txn({ id: '5', group_id: 'H', amount_minor: 300 }),
    ];
    expect(groupSpendMinor('G', list)).toBe(1000);
  });

  it('detects Careem by payment method / notes / title, not by "ride" substring or income', () => {
    expect(isCareemExpense(txn({ payment_method: 'Careem Pay' }))).toBe(true);
    expect(isCareemExpense(txn({ notes: 'Careem · Careem Ride · ref X' }))).toBe(true);
    expect(isCareemExpense(txn({ title: 'Careem ride to Dubai Marina' }))).toBe(true);
    expect(isCareemExpense(txn({ title: 'Bride shower gift' }))).toBe(false);
    expect(isCareemExpense(txn({ title: 'Friday ride share' }))).toBe(false);
    expect(isCareemExpense(txn({ type: 'income', payment_method: 'Careem Pay' }))).toBe(false);
  });

  it('category shares count only my share in the current month', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    const list = [
      txn({ id: 'g1', group_id: 'G', payer_id: 'b', category_id: 'food' }),
      txn({ id: 'g2', group_id: 'G', payer_id: 'b', category_id: 'food' }),
      txn({ id: 'p1', category_id: 'groceries', amount_minor: 2000 }),
      txn({ id: 'old', category_id: 'groceries', amount_minor: 5000, occurred_at: '2026-10-20T00:00:00Z' }),
      txn({ id: 'inc', type: 'income', amount_minor: 900000 }),
    ];
    const r = monthlyCategoryShares(ME, list, splits, now);
    expect(r.totalMinor).toBe(5334);
    expect(r.totals).toEqual([
      { id: 'food', totalMinor: 3334 },
      { id: 'groceries', totalMinor: 2000 },
    ]);
  });

  it('volume splits expense and income and skips deleted', () => {
    const list = [
      txn({ amount_minor: 100 }),
      txn({ type: 'income', amount_minor: 5000 }),
      txn({ amount_minor: 900, deleted_at: 'x' }),
    ];
    expect(volumeByType(list)).toEqual({ expenseMinor: 100, incomeMinor: 5000 });
  });
});
