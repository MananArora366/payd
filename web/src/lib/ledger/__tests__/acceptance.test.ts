import { describe, it, expect } from 'vitest';
import {
  formatMinorUnits,
  parseMajorToMinor,
  splitEqual,
  splitExact,
  splitPercentage,
  splitShares,
  calculateNetBalances,
  calculateBilateralDebts,
  calculatePersonalSpend,
  simplifyDebts,
  validateSettlementAmount,
  LedgerInvariantError,
} from '@/lib/ledger';
import { deterministicParseIntent } from '@/lib/ai/gemini';

describe('Payd Acceptance Test Suite (All 10 Invariants & Criteria)', () => {
  const users = {
    prakarsh: '11111111-1111-1111-1111-111111111111',
    rahul: '22222222-2222-2222-2222-222222222222',
    sarah: '33333333-3333-3333-3333-333333333333',
    priya: '44444444-4444-4444-4444-444444444444',
  };

  // Criterion 1: Integer minor units throughout
  it('Criterion 1: Strict integer minor units without floating-point inaccuracies', () => {
    const minorVal = parseMajorToMinor('120.99', 'AED');
    expect(minorVal).toBe(12099);
    expect(Number.isInteger(minorVal)).toBe(true);

    const formatted = formatMinorUnits(minorVal, 'AED');
    expect(formatted).toBe('AED 120.99');
  });

  // Criterion 2: Pure deterministic calculation in /lib/ledger
  it('Criterion 2: Calculations are strictly deterministic in /lib/ledger without AI hallucination', () => {
    const totalMinor = 15000; // 150.00 AED
    const splits = splitEqual(totalMinor, [users.prakarsh, users.rahul, users.sarah]);
    expect(splits[users.prakarsh]).toBe(5000);
    expect(splits[users.rahul]).toBe(5000);
    expect(splits[users.sarah]).toBe(5000);
    expect(splits[users.prakarsh] + splits[users.rahul] + splits[users.sarah]).toBe(15000);
  });

  // Criterion 3: 3-way split test: 100 AED -> 34/33/33 (or 3334/3333/3333 for 10000 minor)
  it('Criterion 3: 3-way split distributes remainder deterministically to first participants sorted by stable ID', () => {
    // 100 cents split 3 ways: 34, 33, 33
    const split100 = splitEqual(100, ['u1', 'u2', 'u3']);
    expect(split100['u1']).toBe(34);
    expect(split100['u2']).toBe(33);
    expect(split100['u3']).toBe(33);
    expect(split100['u1'] + split100['u2'] + split100['u3']).toBe(100);

    // 100.00 AED (10000 minor) split 3 ways: 3334, 3333, 3333
    const split10000 = splitEqual(10000, ['u1', 'u2', 'u3']);
    expect(split10000['u1']).toBe(3334);
    expect(split10000['u2']).toBe(3333);
    expect(split10000['u3']).toBe(3333);
    expect(split10000['u1'] + split10000['u2'] + split10000['u3']).toBe(10000);
  });

  // Criterion 4: Repayments are settlements and cannot exceed liability unless flagged
  it('Criterion 4: Settlements validate liability and cannot exceed debt unless explicit overpayment', () => {
    const debtMinor = 3333;
    expect(validateSettlementAmount(3333, debtMinor, false)).toBe(true);
    expect(validateSettlementAmount(3000, debtMinor, false)).toBe(true);
    // Exceeding liability rejected
    expect(validateSettlementAmount(3334, debtMinor, false)).toBe(false);
    // Allowed when flagged as overpayment
    expect(validateSettlementAmount(3334, debtMinor, true)).toBe(true);
  });

  // Criterion 5: Derived balances & soft-delete reversing audit logs
  it('Criterion 5: Balances are dynamically derived; soft delete reverses effect immediately', () => {
    const txn = {
      id: 't-audit-1',
      type: 'expense' as const,
      amount_minor: 12000,
      currency: 'AED',
      payer_id: users.prakarsh,
      deleted_at: null,
    };
    const txnSplits = [
      { transaction_id: 't-audit-1', user_id: users.prakarsh, share_minor: 6000 },
      { transaction_id: 't-audit-1', user_id: users.rahul, share_minor: 6000 },
    ];

    // Active
    const balActive = calculateNetBalances([txn], txnSplits, []);
    expect(balActive[users.prakarsh]).toBe(6000);
    expect(balActive[users.rahul]).toBe(-6000);

    // Soft deleted
    const balDeleted = calculateNetBalances(
      [{ ...txn, deleted_at: new Date().toISOString() }],
      txnSplits,
      []
    );
    expect(balDeleted[users.prakarsh] || 0).toBe(0);
    expect(balDeleted[users.rahul] || 0).toBe(0);
  });

  // Criterion 6: Debt simplification algorithm (min-cash-flow greedy bipartition)
  it('Criterion 6: Simplifies multi-party debt cycles into minimal payment transactions', () => {
    // A owes B 100, B owes C 100 => A pays C 100 directly
    const netBalances = {
      userA: -100,
      userB: 0,
      userC: 100,
    };
    const simplified = simplifyDebts(netBalances);
    expect(simplified).toHaveLength(1);
    expect(simplified[0].fromUserId).toBe('userA');
    expect(simplified[0].toUserId).toBe('userC');
    expect(simplified[0].amountMinor).toBe(100);
  });

  // Criterion 7: Voice parser intent extraction
  it('Criterion 7: Voice parser accurately extracts intent, amount, category, and members', () => {
    const ctx = {
      currentUser: { id: users.prakarsh, name: 'Prakarsh', currency: 'AED' },
      knownMembers: [
        { id: users.prakarsh, name: 'Prakarsh' },
        { id: users.rahul, name: 'Rahul' },
        { id: users.sarah, name: 'Sarah' },
      ],
      groups: [{ id: 'g1', name: 'Dubai Flatmates' }],
      categories: ['Food and dining', 'Groceries'],
    };

    const intent = deterministicParseIntent('Paid 120 AED for dinner with Rahul and Sarah', ctx);
    expect(intent.intent).toBe('split_expense');
    expect(intent.amount).toBe(120);
    expect(intent.currency).toBe('AED');
    expect(intent.category).toBe('Food and dining');
    expect(intent.participants).toContain('Rahul');
    expect(intent.participants).toContain('Sarah');
  });

  // Criterion 8: Clarification loop when fields are missing
  it('Criterion 8: Triggers clarification loop when amount or participants are missing', () => {
    const ctx = {
      currentUser: { id: users.prakarsh, name: 'Prakarsh', currency: 'AED' },
      knownMembers: [{ id: users.prakarsh, name: 'Prakarsh' }],
      groups: [],
      categories: ['Food and dining'],
    };

    // Missing amount
    const intentMissingAmount = deterministicParseIntent('Split dinner with Rahul', ctx);
    expect(intentMissingAmount.missing_fields).toContain('amount');
    expect(intentMissingAmount.clarification_question).toBeDefined();

    // Missing participants
    const intentMissingParticipants = deterministicParseIntent('Split 100 AED for groceries', ctx);
    expect(intentMissingParticipants.missing_fields).toContain('participants');
    expect(intentMissingParticipants.clarification_question).toBeDefined();
  });

  // Criterion 9: Personal spending vs group liability
  it('Criterion 9: Distinguishes personal spending from group debts accurately', () => {
    const txns = [
      // Personal coffee: 25.00 AED
      { id: 't-p1', type: 'expense' as const, amount_minor: 2500, currency: 'AED', payer_id: users.prakarsh, group_id: null },
      // Shared dinner: 100.00 AED total, user's share is 34.00 AED
      { id: 't-g1', type: 'expense' as const, amount_minor: 10000, currency: 'AED', payer_id: users.rahul, group_id: 'g1' },
      // Income: 5000.00 AED
      { id: 't-inc', type: 'income' as const, amount_minor: 500000, currency: 'AED', payer_id: users.prakarsh, group_id: null },
    ];
    const splits = [
      { transaction_id: 't-p1', user_id: users.prakarsh, share_minor: 2500 },
      { transaction_id: 't-g1', user_id: users.prakarsh, share_minor: 3400 },
      { transaction_id: 't-g1', user_id: users.rahul, share_minor: 6600 },
    ];

    const spend = calculatePersonalSpend(users.prakarsh, txns, splits);
    // Total spent is personal coffee (2500) + shared dinner share (3400) = 5900 minor
    expect(spend.totalSpentMinor).toBe(5900);
    expect(spend.totalIncomeMinor).toBe(500000);
    expect(spend.netSavingsMinor).toBe(500000 - 5900);
  });

  // Criterion 10: Percentage and Weighted Shares splits
  it('Criterion 10: Percentage and shares splits maintain exact minor unit sums', () => {
    // 10000 minor split 50%, 30%, 20%
    const pctSplits = splitPercentage(10000, { 'u1': 50, 'u2': 30, 'u3': 20 });
    expect(pctSplits['u1'] + pctSplits['u2'] + pctSplits['u3']).toBe(10000);

    // 10000 minor split 3 shares vs 1 share
    const shareSplits = splitShares(10000, { 'u1': 3, 'u2': 1 });
    expect(shareSplits['u1']).toBe(7500);
    expect(shareSplits['u2']).toBe(2500);
    expect(shareSplits['u1'] + shareSplits['u2']).toBe(10000);
  });

  // Criterion 11: Careem Pay instant settlements zero-out liability
  it('Criterion 11: Careem Pay settlements satisfy Invariant 4 and zero-out liabilities', () => {
    const txn = {
      id: 't-careem-1',
      type: 'expense' as const,
      amount_minor: 10000, // 100.00 AED
      currency: 'AED',
      payer_id: users.prakarsh,
      group_id: 'g1',
      deleted_at: null,
    };
    const splits = [
      { transaction_id: 't-careem-1', user_id: users.prakarsh, share_minor: 5000 },
      { transaction_id: 't-careem-1', user_id: users.rahul, share_minor: 5000 },
    ];

    // Initial debt: Rahul owes Prakarsh 50.00 AED
    const initialBilateral = calculateBilateralDebts([txn], splits, []);
    expect(initialBilateral.get(users.rahul)?.get(users.prakarsh)).toBe(5000);

    // Rahul settles via Careem Pay
    const careemSettlement = {
      id: 's-careem-1',
      group_id: 'g1',
      sender_id: users.rahul,
      recipient_id: users.prakarsh,
      amount_minor: 5000,
      currency: 'AED',
      method: 'Careem Pay',
      reference: 'Instant Careem Pay QR settlement',
      status: 'settled' as const,
      settled_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    const settledBilateral = calculateBilateralDebts([txn], splits, [careemSettlement]);
    expect(settledBilateral.get(users.rahul)?.get(users.prakarsh) || 0).toBe(0);
  });
});
