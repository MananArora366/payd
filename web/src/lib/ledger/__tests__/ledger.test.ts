import { describe, it, expect } from 'vitest';
import {
  formatMinorUnits,
  parseMajorToMinor,
  minorToMajor,
  getCurrencySymbol,
} from '../currency';
import {
  splitEqual,
  splitExact,
  splitPercentage,
  splitShares,
  splitUnequal,
  LedgerInvariantError,
} from '../splits';
import {
  calculateNetBalances,
  calculateBilateralDebts,
  calculatePersonalSpend,
  validateSettlementAmount,
} from '../balances';
import { simplifyDebts } from '../simplification';

describe('Ledger: Currency & Minor Units Utilities', () => {
  it('formats minor units to major formatted currency string', () => {
    expect(formatMinorUnits(10000, 'AED')).toBe('AED 100.00');
    expect(formatMinorUnits(3333, 'AED')).toBe('AED 33.33');
    expect(formatMinorUnits(5, 'USD')).toBe('$0.05');
    expect(formatMinorUnits(0, 'EUR')).toBe('€0.00');
  });

  it('correctly parses major currency strings to integer minor units without float errors', () => {
    expect(parseMajorToMinor('100')).toBe(10000);
    expect(parseMajorToMinor('100.00')).toBe(10000);
    expect(parseMajorToMinor('100.50')).toBe(10050);
    expect(parseMajorToMinor('0.05')).toBe(5);
    expect(parseMajorToMinor('19.99')).toBe(1999);
    expect(parseMajorToMinor(19.99)).toBe(1999);
  });

  it('converts minor to major float safely', () => {
    expect(minorToMajor(10050)).toBe(100.5);
    expect(minorToMajor(3333)).toBe(33.33);
  });

  it('returns currency symbol', () => {
    expect(getCurrencySymbol('AED')).toBe('AED');
    expect(getCurrencySymbol('USD')).toBe('$');
    expect(getCurrencySymbol('EUR')).toBe('€');
    expect(getCurrencySymbol('INR')).toBe('₹');
  });
});

describe('Ledger: Split Algorithms & Invariants', () => {
  it('splitEqual: distributes remainder deterministically by stable user ID sort', () => {
    // 100.00 AED (10000 minor) split among 3 users:
    // 10000 / 3 = 3333 each with remainder 1.
    // Sorted IDs: 'user-a', 'user-b', 'user-c'
    // 'user-a' gets 3334, 'user-b' gets 3333, 'user-c' gets 3333
    const userIds = ['user-c', 'user-a', 'user-b']; // shuffled
    const splits = splitEqual(10000, userIds);

    expect(splits['user-a']).toBe(3334);
    expect(splits['user-b']).toBe(3333);
    expect(splits['user-c']).toBe(3333);

    // Sum invariant
    const sum = Object.values(splits).reduce((a, b) => a + b, 0);
    expect(sum).toBe(10000);
  });

  it('splitEqual: 100 minor units split 3 ways yields 34, 33, 33', () => {
    const splits = splitEqual(100, ['u1', 'u2', 'u3']);
    expect(splits['u1']).toBe(34);
    expect(splits['u2']).toBe(33);
    expect(splits['u3']).toBe(33);
    expect(splits['u1'] + splits['u2'] + splits['u3']).toBe(100);
  });

  it('splitEqual: 10000 minor units (100 AED) split 3 ways yields 3334, 3333, 3333 exactly', () => {
    const splits = splitEqual(10000, ['u1', 'u2', 'u3']);
    expect(splits['u1']).toBe(3334);
    expect(splits['u2']).toBe(3333);
    expect(splits['u3']).toBe(3333);
    expect(splits['u1'] + splits['u2'] + splits['u3']).toBe(10000);
  });

  it('splitEqual: handles 7-way split and throws on zero participants', () => {
    const users7 = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const splits7 = splitEqual(10000, users7);
    const sum7 = Object.values(splits7).reduce((a, b) => a + b, 0);
    expect(sum7).toBe(10000);

    expect(() => splitEqual(1000, [])).toThrow(LedgerInvariantError);
    expect(() => splitEqual(-50, ['u1'])).toThrow(LedgerInvariantError);
  });

  it('splitExact: validates sum equals total exactly', () => {
    const exact = {
      'user-1': 6000,
      'user-2': 4000,
    };
    expect(splitExact(10000, exact)).toEqual(exact);

    // Invalid sum throws LedgerInvariantError
    expect(() =>
      splitExact(10000, {
        'user-1': 6000,
        'user-2': 3999,
      })
    ).toThrow(LedgerInvariantError);
  });

  it('splitPercentage: calculates exact shares with remainder handling', () => {
    // 100.00 AED with 50%, 25%, 25%
    const splits = splitPercentage(10000, {
      'u1': 50,
      'u2': 25,
      'u3': 25,
    });
    expect(splits['u1']).toBe(5000);
    expect(splits['u2']).toBe(2500);
    expect(splits['u3']).toBe(2500);
    expect(splits['u1'] + splits['u2'] + splits['u3']).toBe(10000);

    // Non-100% sum throws
    expect(() =>
      splitPercentage(10000, {
        'u1': 50,
        'u2': 40,
      })
    ).toThrow(LedgerInvariantError);
  });

  it('splitShares: allocates based on weighted shares with deterministic remainders', () => {
    // Rahul: 2 shares, Sarah: 1 share, Prakarsh: 1 share. Total = 4 shares.
    // 100.00 AED (10000 minor)
    const splits = splitShares(10000, {
      'rahul': 2,
      'sarah': 1,
      'prakarsh': 1,
    });

    expect(splits['rahul']).toBe(5000);
    expect(splits['sarah']).toBe(2500);
    expect(splits['prakarsh']).toBe(2500);
    expect(Object.values(splits).reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('splitUnequal: custom split wrapper validates exact sum', () => {
    const res = splitUnequal(5000, { 'a': 3000, 'b': 2000 });
    expect(res).toEqual({ 'a': 3000, 'b': 2000 });
  });
});

describe('Ledger: Derived Balances & Settlements', () => {
  const users = {
    prakarsh: '11111111-1111-1111-1111-111111111111',
    rahul: '22222222-2222-2222-2222-222222222222',
    sarah: '33333333-3333-3333-3333-333333333333',
  };

  it('calculates net balances for expenses and splits', () => {
    // Prakarsh pays 100.00 AED (10000 minor) for dinner split equally among 3
    const transactions = [
      {
        id: 't1',
        type: 'expense' as const,
        amount_minor: 10000,
        currency: 'AED',
        payer_id: users.prakarsh,
      },
    ];
    const splits = [
      { transaction_id: 't1', user_id: users.prakarsh, share_minor: 3334 },
      { transaction_id: 't1', user_id: users.rahul, share_minor: 3333 },
      { transaction_id: 't1', user_id: users.sarah, share_minor: 3333 },
    ];
    const settlements: any[] = [];

    const balances = calculateNetBalances(transactions, splits, settlements);
    // Prakarsh paid 10000, his share is 3334 => net +6666
    // Rahul paid 0, share 3333 => net -3333
    // Sarah paid 0, share 3333 => net -3333
    expect(balances[users.prakarsh]).toBe(6666);
    expect(balances[users.rahul]).toBe(-3333);
    expect(balances[users.sarah]).toBe(-3333);
    // Sum of all net balances in closed system is exactly 0
    expect(balances[users.prakarsh] + balances[users.rahul] + balances[users.sarah]).toBe(0);
  });

  it('applies settlements: reduces debtor debt and creditor credit without expense records', () => {
    const transactions = [
      {
        id: 't1',
        type: 'expense' as const,
        amount_minor: 10000,
        currency: 'AED',
        payer_id: users.prakarsh,
      },
    ];
    const splits = [
      { transaction_id: 't1', user_id: users.prakarsh, share_minor: 3334 },
      { transaction_id: 't1', user_id: users.rahul, share_minor: 3333 },
      { transaction_id: 't1', user_id: users.sarah, share_minor: 3333 },
    ];
    // Rahul repays 3333 to Prakarsh
    const settlements = [
      {
        id: 's1',
        sender_id: users.rahul,
        recipient_id: users.prakarsh,
        amount_minor: 3333,
        currency: 'AED',
        status: 'settled' as const,
        settled_at: new Date().toISOString(),
      },
    ];

    const balances = calculateNetBalances(transactions, splits, settlements);
    expect(balances[users.rahul]).toBe(0); // settled!
    expect(balances[users.sarah]).toBe(-3333);
    expect(balances[users.prakarsh]).toBe(3333); // remaining owed from Sarah
  });

  it('ignores soft-deleted transactions in balance calculation', () => {
    const transactions = [
      {
        id: 't1',
        type: 'expense' as const,
        amount_minor: 10000,
        currency: 'AED',
        payer_id: users.prakarsh,
        deleted_at: new Date().toISOString(), // soft deleted!
      },
    ];
    const splits = [
      { transaction_id: 't1', user_id: users.prakarsh, share_minor: 3334 },
      { transaction_id: 't1', user_id: users.rahul, share_minor: 3333 },
      { transaction_id: 't1', user_id: users.sarah, share_minor: 3333 },
    ];

    const balances = calculateNetBalances(transactions, splits, []);
    expect(balances[users.prakarsh] || 0).toBe(0);
    expect(balances[users.rahul] || 0).toBe(0);
    expect(balances[users.sarah] || 0).toBe(0);
  });

  it('validateSettlementAmount prevents paying more than outstanding liability unless allowed', () => {
    // Current debt is 3333
    const currentDebtMinor = 3333;
    expect(validateSettlementAmount(3333, currentDebtMinor, false)).toBe(true);
    expect(validateSettlementAmount(2000, currentDebtMinor, false)).toBe(true);
    expect(validateSettlementAmount(5000, currentDebtMinor, false)).toBe(false);
    expect(validateSettlementAmount(5000, currentDebtMinor, true)).toBe(true); // allowed overpayment
  });
});

describe('Ledger: Debt Simplification Algorithm', () => {
  it('simplifies 3-party cycle into minimal cash transactions', () => {
    // Net balances:
    // Alice (A): +100
    // Bob (B): -40
    // Charlie (C): -60
    const netBalances = {
      'alice': 100,
      'bob': -40,
      'charlie': -60,
    };

    const simplified = simplifyDebts(netBalances);
    // Should be exactly 2 payments instead of complex loops:
    // Charlie pays Alice 60, Bob pays Alice 40
    expect(simplified).toHaveLength(2);

    const charliePayment = simplified.find((s) => s.fromUserId === 'charlie');
    expect(charliePayment).toBeDefined();
    expect(charliePayment?.toUserId).toBe('alice');
    expect(charliePayment?.amountMinor).toBe(60);

    const bobPayment = simplified.find((s) => s.fromUserId === 'bob');
    expect(bobPayment).toBeDefined();
    expect(bobPayment?.toUserId).toBe('alice');
    expect(bobPayment?.amountMinor).toBe(40);
  });

  it('returns empty array when everyone is settled', () => {
    const netBalances = {
      'user-1': 0,
      'user-2': 0,
    };
    expect(simplifyDebts(netBalances)).toEqual([]);
  });
});
