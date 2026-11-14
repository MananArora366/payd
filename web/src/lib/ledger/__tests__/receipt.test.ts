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

// ---------------------------------------------------------------------------
// Local OCR parser (Apple Vision via bin/payd-ocr). Fixtures are the raw
// `lines` payd-ocr returned for the QA repro images.
// ---------------------------------------------------------------------------
import {
  parseRawReceiptTextLines,
  decodeReceiptImage,
  ReceiptScanError,
  extractReceiptDate,
} from '@/lib/ai/receipt-server';
import { POST as receiptScanPOST } from '@/app/api/ai/receipt-scan/route';
import { NextRequest } from 'next/server';

const NOW = new Date('2026-11-14T12:00:00Z');

// /tmp/payd-qa/agent5/receipt.png: Vision returned labels and prices as two columns.
const BLUE_OASIS_LINES = [
  'BLUE OASIS BISTRO',
  'Jumeirah Beach Road Dubai',
  'TRN: 100123456700003',
  'Chicken Shawarma 2 x',
  'Falafel Plate',
  'Fresh Lemon Mint',
  'Hummus',
  'Subtotal',
  'VAT 5%',
  'TOTAL AED',
  '36.00',
  '24.50',
  '18.00',
  '15.00',
  '93.50',
  '4.68',
  '98.18',
  'THANK YOU',
];

// /tmp/payd-qa/agent2/receipt.png: labels and prices interleaved.
const CARREFOUR_LINES = [
  'CARREFOUR MALL OF THE EMIRATES',
  'TRN 100234567800003',
  'Date: 2026-11-10',
  'Milk 2L',
  '13.50',
  'Bread',
  '6.00',
  'Eggs 30pc',
  '21.00',
  'Subtotal',
  '40.50',
  'VAT 5%',
  '2.03',
  'TOTAL AED',
  '42.53',
];

describe('Payd Lens local OCR parser', () => {
  it('pairs column-split labels with prices (Blue Oasis repro)', () => {
    const r = parseRawReceiptTextLines(BLUE_OASIS_LINES, NOW);
    expect(r.merchant_name).toBe('Blue Oasis Bistro');
    expect(r.trn).toBe('100123456700003');
    expect(r.total_minor).toBe(9818);
    expect(r.subtotal_minor).toBe(9350);
    expect(r.vat_minor).toBe(468);
    expect(r.line_items).toEqual([
      { name: 'Chicken Shawarma', quantity: 2, price_minor: 3600 },
      { name: 'Falafel Plate', quantity: 1, price_minor: 2450 },
      { name: 'Fresh Lemon Mint', quantity: 1, price_minor: 1800 },
      { name: 'Hummus', quantity: 1, price_minor: 1500 },
    ]);
    expect(r.warnings).toEqual([]);
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    expect(r.date).toBeNull(); // no date printed; never invent one
  });

  it('uses TOTAL (not Subtotal), printed VAT (not the "5" in 5%) and the receipt date (Carrefour repro)', () => {
    const r = parseRawReceiptTextLines(CARREFOUR_LINES, NOW);
    expect(r.merchant_name).toBe('Carrefour Mall Of The Emirates');
    expect(r.category).toBe('Groceries');
    expect(r.trn).toBe('100234567800003');
    expect(r.date).toBe('2026-11-10');
    expect(r.total_minor).toBe(4253);
    expect(r.subtotal_minor).toBe(4050);
    expect(r.vat_minor).toBe(203);
    expect(r.line_items.map((i) => [i.name, i.price_minor])).toEqual([
      ['Milk 2L', 1350],
      ['Bread', 600],
      ['Eggs 30pc', 2100],
    ]);
    const itemSum = r.line_items.reduce((a, i) => a + i.price_minor, 0);
    expect(itemSum + r.vat_minor).toBe(r.total_minor);
  });

  it('parses inline rows, thousands separators, service charge and grand total', () => {
    const r = parseRawReceiptTextLines(
      [
        'GOLDEN PALACE',
        'Date 10/11/2026',
        'Wagyu Platter 1,250.50',
        'Lobster 2 x 400.00 800.00',
        'Sub Total 2,050.50',
        'Service Charge 10% 205.05',
        'VAT 5% 112.78',
        'Total 2,368.33',
        'Grand Total AED 2,368.33',
        'Cash 2,400.00',
        'Change 31.67',
      ],
      NOW
    );
    expect(r.date).toBe('2026-11-10');
    expect(r.line_items).toEqual([
      { name: 'Wagyu Platter', quantity: 1, price_minor: 125050 },
      { name: 'Lobster', quantity: 2, price_minor: 80000 },
    ]);
    expect(r.subtotal_minor).toBe(205050);
    expect(r.vat_minor).toBe(11278);
    expect(r.charges_minor).toBe(20505);
    expect(r.total_minor).toBe(236833);
    expect(r.warnings).toEqual([]);
  });

  it('flags and lowers confidence when items + VAT do not reconcile with the total', () => {
    const lines = [...CARREFOUR_LINES];
    lines[lines.indexOf('6.00')] = '9.00'; // misread price
    const r = parseRawReceiptTextLines(lines, NOW);
    expect(r.total_minor).toBe(4253);
    expect(r.warnings!.length).toBeGreaterThan(0);
    expect(r.warnings!.join(' ')).toMatch(/total/i);
    expect(r.confidence).toBeLessThan(0.7);
  });

  it('refuses to fabricate: blank or amount-less OCR throws ReceiptScanError (422)', () => {
    for (const lines of [[], ['', '  '], ['HELLO WORLD', 'just a photo of a cat']]) {
      let err: unknown;
      try {
        parseRawReceiptTextLines(lines, NOW);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(ReceiptScanError);
      expect((err as ReceiptScanError).status).toBe(422);
    }
  });

  it('ignores impossible or future dates', () => {
    expect(extractReceiptDate(['Date: 31/02/2026'], NOW)).toBeNull();
    expect(extractReceiptDate(['Date: 2027-01-01'], NOW)).toBeNull();
    expect(extractReceiptDate(['12 Nov 2026'], NOW)).toBe('2026-11-12');
  });
});

describe('Payd Lens upload validation', () => {
  const PNG_1PX =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const statusOf = (fn: () => unknown) => {
    try {
      fn();
      return 0;
    } catch (e) {
      return e instanceof ReceiptScanError ? e.status : -1;
    }
  };

  it('accepts a real PNG and sniffs its MIME type from the bytes', () => {
    const d = decodeReceiptImage(`data:image/jpeg;base64,${PNG_1PX}`);
    expect(d.mimeType).toBe('image/png');
  });

  it('rejects invalid base64, non-image MIME, non-image bytes and oversize uploads', () => {
    expect(statusOf(() => decodeReceiptImage('not base64 !!!'))).toBe(400);
    expect(statusOf(() => decodeReceiptImage(`data:text/plain;base64,${PNG_1PX}`))).toBe(400);
    expect(statusOf(() => decodeReceiptImage(PNG_1PX, 'application/pdf'))).toBe(400);
    expect(statusOf(() => decodeReceiptImage(Buffer.from('hello, this is text').toString('base64')))).toBe(400);
    const huge = 'A'.repeat(Math.ceil((9 * 1024 * 1024 * 4) / 3));
    expect(statusOf(() => decodeReceiptImage(huge))).toBe(413);
  });
});

describe('/api/ai/receipt-scan route', () => {
  const post = (body: unknown) =>
    receiptScanPOST(
      new NextRequest('http://localhost/api/ai/receipt-scan', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      })
    );

  it('serves explicit sample presets but not prototype keys', async () => {
    const ok = await post({ sample: 'lulu' });
    expect(ok.status).toBe(200);
    expect((await ok.json()).receipt.total_minor).toBe(4130);
    for (const sample of ['__proto__', 'constructor', 'toString']) {
      const res = await post({ sample });
      expect(res.status).toBe(400);
      expect((await res.json()).success).toBe(false);
    }
  });

  it('returns an error (never the LuLu sample) for garbage uploads', async () => {
    const res = await post({ image: 'data:image/png;base64,Zm9vYmFy', mimeType: 'image/png' });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.receipt).toBeUndefined();
  });
});
