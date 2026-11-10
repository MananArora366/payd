import { describe, it, expect } from 'vitest';
import {
  ReceiptScanSchema,
  SAMPLE_UAE_RECEIPTS,
  calculateItemizedShares,
} from '@/lib/ai/receipt-scan';
import { splitEqual } from '@/lib/ledger';

describe('Functionality 2: Camera System / Receipt OCR (Payd Lens Acceptance Criteria)', () => {
  const users = {
    manan: '11111111-1111-1111-1111-111111111111',
    rahul: '22222222-2222-2222-2222-222222222222',
    sarah: '33333333-3333-3333-3333-333333333333',
  };

  it('Validates Al Safadi UAE receipt with 5% VAT and 15-digit TRN', () => {
    const receipt = SAMPLE_UAE_RECEIPTS.al_safadi;
    const validated = ReceiptScanSchema.parse(receipt);

    expect(validated.merchant_name).toContain('Al Safadi');
    expect(validated.currency).toBe('AED');
    expect(validated.total_minor).toBe(26000); // 260.00 AED
    expect(validated.subtotal_minor).toBe(24762);
    expect(validated.vat_minor).toBe(1238); // 12.38 AED (5% VAT)
    expect(validated.trn).toBe('100345678900003');
    expect(validated.line_items.length).toBe(6);
  });

  it('Acceptance Test 7: Itemized split proportionally distributes 5% VAT and matches totalMinor exactly', () => {
    const receipt = SAMPLE_UAE_RECEIPTS.al_safadi;
    const participants = [users.manan, users.rahul, users.sarah];

    // Item assignments:
    // 0: Chicken Biryani (5500 fils) -> Manan
    // 1: Mixed Grill (9500 fils) -> Rahul
    // 2: Hummus (2800 fils) -> Shared (all 3)
    // 3: Fattoush (3200 fils) -> Shared (all 3)
    // 4: Water (2000 fils) -> Shared (all 3)
    // 5: Lemonade (3000 fils) -> Sarah
    const assignments: Record<number, string[]> = {
      0: [users.manan],
      1: [users.rahul],
      2: participants,
      3: participants,
      4: participants,
      5: [users.sarah],
    };

    const shares = calculateItemizedShares(
      receipt.total_minor,
      receipt.line_items,
      assignments,
      participants
    );

    // Sum invariant check: total must equal exactly 26000 fils (260.00 AED)
    const sum = Object.values(shares).reduce((acc, v) => acc + v, 0);
    expect(sum).toBe(receipt.total_minor);
    expect(sum).toBe(26000);

    // Individual shares validation
    expect(shares[users.manan]).toBeGreaterThan(0);
    expect(shares[users.rahul]).toBeGreaterThan(0);
    expect(shares[users.sarah]).toBeGreaterThan(0);

    // Rahul ordered the most expensive single item (Mixed Grill 95.00 AED), so his share must be the highest
    expect(shares[users.rahul]).toBeGreaterThan(shares[users.manan]);
    expect(shares[users.rahul]).toBeGreaterThan(shares[users.sarah]);
  });

  it('Fallbacks to equal split if no specific items are assigned in itemized mode', () => {
    const receipt = SAMPLE_UAE_RECEIPTS.carrefour;
    const participants = [users.manan, users.rahul];

    const shares = calculateItemizedShares(receipt.total_minor, receipt.line_items, {}, participants);
    expect(shares[users.manan] + shares[users.rahul]).toBe(receipt.total_minor);
    expect(shares[users.manan]).toBe(5000);
    expect(shares[users.rahul]).toBe(5000);
  });

  it('Validates LuLu Hypermarket UAE receipt with 5% VAT and exact integer minor-unit sum', () => {
    const receipt = SAMPLE_UAE_RECEIPTS.lulu;
    const validated = ReceiptScanSchema.parse(receipt);

    expect(validated.merchant_name).toContain('LuLu');
    expect(validated.currency).toBe('AED');
    expect(validated.total_minor).toBe(4130); // 41.30 AED
    expect(validated.subtotal_minor).toBe(3934); // 39.34 AED
    expect(validated.vat_minor).toBe(196); // 1.96 AED
    expect(validated.trn).toBe('100282231000003');
    expect(validated.line_items.length).toBe(5);

    // Verify item sum equals total_minor
    const itemSum = validated.line_items.reduce((acc, it) => acc + it.price_minor, 0);
    expect(itemSum).toBe(4130);

    // Test itemized split
    const participants = [users.manan, users.rahul, users.sarah];
    const assignments: Record<number, string[]> = {
      0: [users.manan], // Butter Chicken Boneless 2955 fils -> Manan
      1: [users.rahul], // Mutton Paneer Samosa 300 fils -> Rahul
      2: [users.sarah], // Vegetable Samosa 300 fils -> Sarah
      3: participants,   // Malabar Parotta 550 fils -> All 3
      4: [users.manan], // Bag 25 fils -> Manan
    };

    const shares = calculateItemizedShares(receipt.total_minor, receipt.line_items, assignments, participants);
    const sum = Object.values(shares).reduce((a, b) => a + b, 0);
    expect(sum).toBe(4130);
    expect(shares[users.manan]).toBeGreaterThan(shares[users.rahul]);
  });
});
