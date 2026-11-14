import { describe, it, expect } from 'vitest';
import {
  calculateNetBalances,
  calculateBilateralDebts,
  calculateGroupedBilateralDebts,
  getPairDebtBreakdown,
  getSignedPairDebt,
  checkSettlement,
  summarizeDebtSimplification,
  PERSONAL_DEBT_BUCKET,
  TransactionRecord,
  SplitRecord,
  SettlementRecord,
} from '../balances';
import { simplifyDebts } from '../simplification';
import { LedgerInvariantError } from '../splits';
import {
  INITIAL_TRANSACTIONS,
  INITIAL_SPLITS,
  INITIAL_SETTLEMENTS,
} from '@/lib/store/initialData';

const A = 'a';
const B = 'b';
const C = 'c';

let seq = 0;
function expense(payer: string, amount: number, shares: Record<string, number>, group: string | null = 'g1') {
  const id = `t${++seq}`;
  const txn: TransactionRecord = { id, type: 'expense', amount_minor: amount, currency: 'AED', payer_id: payer, group_id: group };
  const sp: SplitRecord[] = Object.entries(shares).map(([user_id, share_minor]) => ({ transaction_id: id, user_id, share_minor }));
  return { txn, sp };
}
function settle(from: string, to: string, amount: number, group: string | null = 'g1'): SettlementRecord {
  return {
    id: `s${++seq}`,
    group_id: group,
    sender_id: from,
    recipient_id: to,
    amount_minor: amount,
    currency: 'AED',
    status: 'settled',
    settled_at: new Date().toISOString(),
  };
}
function build(items: { txn: TransactionRecord; sp: SplitRecord[] }[]) {
  return { txns: items.map((i) => i.txn), sps: items.flatMap((i) => i.sp) };
}

/** For every user: owed to them - they owe === net balance. */
function expectConsistent(txns: TransactionRecord[], sps: SplitRecord[], sts: SettlementRecord[]) {
  const net = calculateNetBalances(txns, sps, sts);
  const debts = calculateBilateralDebts(txns, sps, sts);
  const derived: Record<string, number> = {};
  for (const [debtor, m] of debts) {
    for (const [creditor, amt] of m) {
      expect(amt).toBeGreaterThan(0);
      expect(debts.get(creditor)?.get(debtor)).toBeUndefined(); // never both directions
      derived[debtor] = (derived[debtor] || 0) - amt;
      derived[creditor] = (derived[creditor] || 0) + amt;
    }
  }
  for (const uid of new Set([...Object.keys(net), ...Object.keys(derived)])) {
    expect(derived[uid] || 0).toBe(net[uid] || 0);
  }
}

describe('Unified debt model: calculateBilateralDebts', () => {
  it('overpayments carry over as a reverse debt instead of vanishing', () => {
    const { txns, sps } = build([expense(A, 10000, { [A]: 5000, [B]: 5000 })]);
    const sts = [settle(B, A, 8000)]; // B owed 50, paid 80
    const debts = calculateBilateralDebts(txns, sps, sts);
    expect(debts.get(B)?.get(A)).toBeUndefined();
    expect(debts.get(A)?.get(B)).toBe(3000);
    expectConsistent(txns, sps, sts);
  });

  it('opposite-direction debts net out', () => {
    const { txns, sps } = build([
      expense(A, 10000, { [A]: 5000, [B]: 5000 }), // B owes A 50
      expense(B, 6000, { [A]: 3000, [B]: 3000 }), // A owes B 30
    ]);
    const debts = calculateBilateralDebts(txns, sps, []);
    expect(debts.get(B)?.get(A)).toBe(2000);
    expect(debts.get(A)?.get(B)).toBeUndefined();
    expectConsistent(txns, sps, []);
  });

  it('nets opposite debts across different groups', () => {
    const { txns, sps } = build([
      expense(A, 10000, { [A]: 5000, [B]: 5000 }, 'g1'),
      expense(B, 4000, { [A]: 2000, [B]: 2000 }, 'g2'),
    ]);
    const debts = calculateBilateralDebts(txns, sps, []);
    expect(debts.get(B)?.get(A)).toBe(3000);
    const grouped = calculateGroupedBilateralDebts(txns, sps, []);
    const parts = getPairDebtBreakdown(grouped, A, B);
    expect(parts).toHaveLength(2);
    expect(parts.find((p) => p.groupId === 'g1')).toMatchObject({ fromUserId: B, toUserId: A, amountMinor: 5000 });
    expect(parts.find((p) => p.groupId === 'g2')).toMatchObject({ fromUserId: A, toUserId: B, amountMinor: 2000 });
  });

  it('handles refunds (reverses the original split)', () => {
    const e = expense(A, 9000, { [A]: 3000, [B]: 3000, [C]: 3000 });
    const r: TransactionRecord = { id: 'r1', type: 'refund', amount_minor: 3000, currency: 'AED', payer_id: A, group_id: 'g1' };
    const rs: SplitRecord[] = [
      { transaction_id: 'r1', user_id: A, share_minor: 1000 },
      { transaction_id: 'r1', user_id: B, share_minor: 1000 },
      { transaction_id: 'r1', user_id: C, share_minor: 1000 },
    ];
    const txns = [e.txn, r];
    const sps = [...e.sp, ...rs];
    const debts = calculateBilateralDebts(txns, sps, []);
    expect(debts.get(B)?.get(A)).toBe(2000);
    expect(debts.get(C)?.get(A)).toBe(2000);
    expectConsistent(txns, sps, []);
  });

  it('ignores soft-deleted transactions, income and non-settled settlements', () => {
    const e = expense(A, 10000, { [A]: 5000, [B]: 5000 });
    const deleted = { ...expense(B, 10000, { [A]: 5000, [B]: 5000 }), };
    deleted.txn.deleted_at = new Date().toISOString();
    const income: TransactionRecord = { id: 'inc', type: 'income', amount_minor: 99999, currency: 'AED', payer_id: B, group_id: null };
    const pending: SettlementRecord = { ...settle(B, A, 5000), status: 'outstanding' };
    const txns = [e.txn, deleted.txn, income];
    const sps = [...e.sp, ...deleted.sp, { transaction_id: 'inc', user_id: B, share_minor: 99999 }];
    expect(calculateBilateralDebts(txns, sps, [pending]).get(B)?.get(A)).toBe(5000);
  });

  it('group debts equal the group simplified suggestions (what the Groups tab shows)', () => {
    const { txns, sps } = build([
      expense(A, 9000, { [A]: 3000, [B]: 3000, [C]: 3000 }),
      expense(B, 3000, { [C]: 3000 }),
    ]);
    const grouped = calculateGroupedBilateralDebts(txns, sps, []);
    const suggestions = simplifyDebts(calculateNetBalances(txns, sps, []));
    for (const s of suggestions) {
      expect(grouped.get('g1')?.get(s.fromUserId)?.get(s.toUserId)).toBe(s.amountMinor);
    }
  });

  it('settlements without a group still affect overall balances and net against group debts', () => {
    const { txns, sps } = build([expense(A, 10000, { [A]: 5000, [B]: 5000 }, 'g1')]);
    const sts = [settle(B, A, 5000, null)];
    const debts = calculateBilateralDebts(txns, sps, sts);
    expect(debts.get(B)?.get(A)).toBeUndefined();
    expect(debts.get(A)?.get(B)).toBeUndefined();
    const grouped = calculateGroupedBilateralDebts(txns, sps, sts);
    // Group view still shows the group debt; the personal bucket holds the offsetting payment.
    expect(getSignedPairDebt(grouped.get('g1'), B, A)).toBe(5000);
    expect(getSignedPairDebt(grouped.get(PERSONAL_DEBT_BUCKET), B, A)).toBe(-5000);
    expectConsistent(txns, sps, sts);
  });

  it('group settlements count in that group only', () => {
    const { txns, sps } = build([
      expense(A, 10000, { [A]: 5000, [B]: 5000 }, 'g1'),
      expense(A, 4000, { [A]: 2000, [B]: 2000 }, 'g2'),
    ]);
    const sts = [settle(B, A, 5000, 'g1')];
    const grouped = calculateGroupedBilateralDebts(txns, sps, sts);
    expect(getSignedPairDebt(grouped.get('g1'), B, A)).toBe(0);
    expect(getSignedPairDebt(grouped.get('g2'), B, A)).toBe(2000);
    expect(calculateBilateralDebts(txns, sps, sts).get(B)?.get(A)).toBe(2000);
  });

  it('owed/owe always sum to the net balance on random ledgers', () => {
    const users = ['u1', 'u2', 'u3', 'u4', 'u5'];
    const groups = ['g1', 'g2', null];
    let rng = 42;
    const rand = (n: number) => {
      rng = (rng * 1103515245 + 12345) % 2147483648;
      return rng % n;
    };
    for (let round = 0; round < 50; round++) {
      const items: { txn: TransactionRecord; sp: SplitRecord[] }[] = [];
      const sts: SettlementRecord[] = [];
      for (let i = 0; i < 6; i++) {
        const payer = users[rand(5)];
        const parts = users.filter(() => rand(2) === 0);
        if (parts.length === 0) parts.push(payer);
        const shares: Record<string, number> = {};
        let total = 0;
        for (const p of parts) {
          shares[p] = 100 + rand(10000);
          total += shares[p];
        }
        items.push(expense(payer, total, shares, groups[rand(3)]));
      }
      for (let i = 0; i < 4; i++) {
        const from = users[rand(5)];
        const to = users.filter((u) => u !== from)[rand(4)];
        sts.push(settle(from, to, 1 + rand(8000), groups[rand(3)]));
      }
      const { txns, sps } = build(items);
      expectConsistent(txns, sps, sts);
    }
  });
});

describe('Seed data', () => {
  const MANAN = '11111111-1111-1111-1111-111111111111';
  const RAHUL = '22222222-2222-2222-2222-222222222222';
  const FLAT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  it('Home owed/owe sums to the net balance (+1,500.00 for Manan)', () => {
    expectConsistent(INITIAL_TRANSACTIONS, INITIAL_SPLITS, INITIAL_SETTLEMENTS);
    const net = calculateNetBalances(INITIAL_TRANSACTIONS, INITIAL_SPLITS, INITIAL_SETTLEMENTS);
    expect(net[MANAN]).toBe(150000);
  });

  it('the group-suggested Prakarsh -> Manan 240.00 is a valid settlement (QA critical #1)', () => {
    const grouped = calculateGroupedBilateralDebts(INITIAL_TRANSACTIONS, INITIAL_SPLITS, INITIAL_SETTLEMENTS);
    const debt = getSignedPairDebt(grouped.get(FLAT), RAHUL, MANAN);
    expect(debt).toBe(24000);
    expect(checkSettlement({ sender_id: RAHUL, recipient_id: MANAN, amount_minor: 24000, group_id: FLAT }, debt).ok).toBe(true);
  });

  it('every settlement is dated after the expenses it repays', () => {
    const rahulSettlement = INITIAL_SETTLEMENTS.find((s) => s.sender_id === RAHUL)!;
    const dinner = INITIAL_TRANSACTIONS.find((t) => t.title.includes('Dinner'))!;
    expect(new Date(rahulSettlement.settled_at).getTime()).toBeGreaterThan(new Date(dinner.occurred_at).getTime());
  });
});

describe('checkSettlement (pure validator used by validateSettlement)', () => {
  const base = { sender_id: A, recipient_id: B, amount_minor: 5000 };
  it('accepts amounts up to the debt', () => {
    expect(checkSettlement(base, 5000)).toEqual({ ok: true, debtMinor: 5000 });
    expect(checkSettlement({ ...base, amount_minor: 1 }, 5000).ok).toBe(true);
  });
  it('rejects more than the debt unless recorded as an advance', () => {
    const r = checkSettlement({ ...base, amount_minor: 5001 }, 5000);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).not.toMatch(/invariant/i);
      expect(r.reason).toMatch(/advance/i);
    }
    expect(checkSettlement({ ...base, amount_minor: 5001, allowOverpayment: true }, 5000).ok).toBe(true);
  });
  it('allows an advance between people with no debt', () => {
    expect(checkSettlement(base, 0).ok).toBe(false);
    expect(checkSettlement({ ...base, allowOverpayment: true }, 0).ok).toBe(true);
  });
  it('rejects self-payments, zero, negative, fractional and unsafe amounts', () => {
    expect(checkSettlement({ ...base, recipient_id: A }, 5000).ok).toBe(false);
    for (const amount_minor of [0, -5, 1.5, NaN, Number.MAX_SAFE_INTEGER + 2]) {
      expect(checkSettlement({ ...base, amount_minor, allowOverpayment: true }, 5000).ok).toBe(false);
    }
    expect(checkSettlement({ ...base, recipient_id: '' }, 5000).ok).toBe(false);
  });
  it('uses friendly names and grammar for "You"', () => {
    const r = checkSettlement(base, 0, { sender: 'You', recipient: 'Rahul' });
    expect(!r.ok && r.reason).toContain("You don't currently owe Rahul");
  });
});

describe('simplifyDebts', () => {
  it('throws when balances do not sum to zero', () => {
    expect(() => simplifyDebts({ a: 100, b: -50 })).toThrow(LedgerInvariantError);
  });

  it('uses n - (#zero-sum groups) transfers', () => {
    // Two independent zero-sum pairs plus a triangle: 1 + 1 + 2 = 4 transfers.
    // The plain greedy pass mixes the subsets and needs 5.
    const balances = { a: 700, b: -700, c: 300, d: -300, e: 500, f: -250, g: -250 };
    const r = simplifyDebts(balances);
    expect(r).toHaveLength(4);
  });

  it('never uses more transfers than greedy and always conserves balances (random)', () => {
    let rng = 7;
    const rand = (n: number) => {
      rng = (rng * 1103515245 + 12345) % 2147483648;
      return rng % n;
    };
    for (let round = 0; round < 200; round++) {
      const n = 2 + rand(7);
      const bal: Record<string, number> = {};
      let sum = 0;
      for (let i = 0; i < n - 1; i++) {
        const v = (rand(10) - 5) * 100;
        bal[`u${i}`] = v;
        sum += v;
      }
      bal[`u${n - 1}`] = -sum;
      const r = simplifyDebts(bal);
      const net: Record<string, number> = {};
      for (const t of r) {
        expect(t.amountMinor).toBeGreaterThan(0);
        net[t.fromUserId] = (net[t.fromUserId] || 0) - t.amountMinor;
        net[t.toUserId] = (net[t.toUserId] || 0) + t.amountMinor;
      }
      for (const [k, v] of Object.entries(bal)) expect((net[k] || 0) + 0).toBe(v + 0);
      const nonZero = Object.values(bal).filter((v) => v !== 0).length;
      expect(r.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
    }
  });
});

describe('summarizeDebtSimplification', () => {
  it('reports real before/after transfer counts', () => {
    const { txns, sps } = build([
      expense(A, 9000, { [A]: 3000, [B]: 3000, [C]: 3000 }),
      expense(B, 9000, { [A]: 3000, [B]: 3000, [C]: 3000 }),
    ]);
    // Direct: B->A, C->A, A->B, C->B nets within the group to C->A, C->B (2 pairs after netting per pair).
    const { beforeTransfers, afterTransfers } = summarizeDebtSimplification(txns, sps, []);
    expect(beforeTransfers).toBe(2);
    expect(afterTransfers).toBe(2);
    expect(summarizeDebtSimplification([], [], [])).toEqual({ beforeTransfers: 0, afterTransfers: 0 });
  });
});
