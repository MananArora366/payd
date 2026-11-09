import { describe, it, expect } from 'vitest';
import { splitEqual, splitExact } from '@/lib/ledger';
import { calculateItemizedShares } from '@/lib/ai/receipt-scan';
import { RecurringBill } from '@/types/database';

describe('Feature Suite: Tap-to-Claim, Recurring Subscriptions & Cash Flow Health', () => {
  const users = {
    manan: '11111111-1111-1111-1111-111111111111',
    rahul: '22222222-2222-2222-2222-222222222222',
    sarah: '33333333-3333-3333-3333-333333333333',
  };

  it('Feature 1: Tap-to-Claim handles fractional shared dishes with zero remainder loss', () => {
    // 3 items:
    // Item 1: Truffle Fries (45.00 AED = 4500 fils) claimed by Manan & Rahul (50% each)
    // Item 2: Wagyu Slider (75.00 AED = 7500 fils) claimed only by Rahul (100%)
    // Item 3: Mocktails (30.00 AED = 3000 fils) claimed by Manan & Sarah (50% each)
    // Total = 150.00 AED = 15000 fils
    const lineItems = [
      { name: 'Truffle Fries', quantity: 1, price_minor: 4500 },
      { name: 'Wagyu Slider', quantity: 1, price_minor: 7500 },
      { name: 'Mocktails', quantity: 1, price_minor: 3000 },
    ];

    const assignments = {
      0: [users.manan, users.rahul],
      1: [users.rahul],
      2: [users.manan, users.sarah],
    };

    const participants = [users.manan, users.rahul, users.sarah];
    const shares = calculateItemizedShares(15000, lineItems, assignments, participants);

    // Sum invariant check:
    const sum = Object.values(shares).reduce((a, b) => a + b, 0);
    expect(sum).toBe(15000);

    // Manan: 4500/2 + 3000/2 = 2250 + 1500 = 3750 fils (AED 37.50)
    expect(shares[users.manan]).toBe(3750);
    // Rahul: 4500/2 + 7500 = 2250 + 7500 = 9750 fils (AED 97.50)
    expect(shares[users.rahul]).toBe(9750);
    // Sarah: 3000/2 = 1500 fils (AED 15.00)
    expect(shares[users.sarah]).toBe(1500);
  });

  it('Feature 6: Recurring Subscriptions preserves zero-sum split invariants', () => {
    // Du 5G Wi-Fi: 389.00 AED (38900 fils) split 3 ways
    const totalMinor = 38900;
    const participants = [users.manan, users.rahul, users.sarah];
    const shares = splitEqual(totalMinor, participants);

    const sum = Object.values(shares).reduce((a, b) => a + b, 0);
    expect(sum).toBe(totalMinor);
    // 38900 / 3 = 12966.666...
    // Largest remainder distributes 2 fils across 3 people: two get 12967, one gets 12966
    const values = Object.values(shares).sort((a, b) => b - a);
    expect(values).toEqual([12967, 12967, 12966]);
  });

  it('Feature 4: Fair Payer Roulette calculates fair equal share allocation when triggered', () => {
    // Round of coffee: AED 45.00 (4500 fils) for 3 people
    const coffeeTotal = 4500;
    const participants = [users.manan, users.rahul, users.sarah];
    const shares = splitEqual(coffeeTotal, participants);

    expect(shares[users.manan]).toBe(1500);
    expect(shares[users.rahul]).toBe(1500);
    expect(shares[users.sarah]).toBe(1500);
    expect(shares[users.manan] + shares[users.rahul] + shares[users.sarah]).toBe(coffeeTotal);
  });
});
