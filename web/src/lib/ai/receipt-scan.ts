import { z } from 'zod';
import { splitEqual, LedgerInvariantError } from '@/lib/ledger';

export const ReceiptItemSchema = z.object({
  name: z.string(),
  quantity: z.number().int().min(1).default(1),
  price_minor: z.number().int().nonnegative(), // in fils
});

export type ReceiptItem = z.infer<typeof ReceiptItemSchema>;

export const ReceiptScanSchema = z.object({
  merchant_name: z.string().default('UAE Merchant'),
  date: z.string().nullable().default(null),
  currency: z.string().default('AED'),
  trn: z.string().nullable().default(null), // UAE Tax Registration Number (15 digits)
  subtotal_minor: z.number().int().nonnegative().default(0),
  vat_minor: z.number().int().nonnegative().default(0), // UAE 5% VAT in fils
  total_minor: z.number().int().positive(), // in fils
  category: z.string().default('Food and dining'),
  line_items: z.array(ReceiptItemSchema).default([]),
  /** Service charges / tips minus discounts printed on the receipt (signed fils). */
  charges_minor: z.number().int().optional(),
  confidence: z.number().min(0).max(1).default(0.95),
  /** Reconciliation problems (e.g. items + VAT != total) the user should check. */
  warnings: z.array(z.string()).optional(),
  notes: z.string().nullable().default(null),
  engine: z.string().optional().default('local_ocr'),
});

export type ReceiptScanResult = z.infer<typeof ReceiptScanSchema>;

/**
 * Pre-configured realistic UAE receipts adhering to FTA 5% VAT and CBUAE AED currency standards.
 * Guaranteed zero-failure offline and on-stage demo presets.
 */
export const SAMPLE_UAE_RECEIPTS: Record<string, ReceiptScanResult> = {
  lulu: {
    merchant_name: 'LuLu Hypermarket LLC (Dubai Branch)',
    date: '2024-10-15',
    currency: 'AED',
    trn: '100282231000003',
    subtotal_minor: 3934, // 39.34 AED
    vat_minor: 196, // 1.96 AED (5% VAT)
    total_minor: 4130, // 41.30 AED
    category: 'Groceries',
    confidence: 0.99,
    notes: 'LuLu Hypermarket Dubai groceries split. 5% UAE VAT itemized.',
    line_items: [
      { name: 'Butter Chicken Boneless', quantity: 1, price_minor: 2955 },
      { name: 'Mutton Paneer Samosa', quantity: 1, price_minor: 300 },
      { name: 'Vegetable Samosa Snack', quantity: 1, price_minor: 300 },
      { name: 'Nellara Malabar Parotta 3s', quantity: 1, price_minor: 550 },
      { name: 'Supermarket Shopping Bag', quantity: 1, price_minor: 25 },
    ],
    engine: 'demo_sample',
  },
  al_safadi: {
    merchant_name: 'Al Safadi Restaurant (Sheikh Zayed Rd)',
    date: new Date().toISOString().split('T')[0],
    currency: 'AED',
    trn: '100345678900003',
    subtotal_minor: 24762, // 247.62 AED
    vat_minor: 1238, // 12.38 AED (5% VAT)
    total_minor: 26000, // 260.00 AED
    category: 'Food and dining',
    confidence: 0.98,
    notes: 'Dinner at Al Safadi with flatmates. 5% UAE VAT itemized.',
    line_items: [
      { name: 'Chicken Biryani', quantity: 1, price_minor: 5500 },
      { name: 'Mixed Grill Platter', quantity: 1, price_minor: 9500 },
      { name: 'Hummus Beiruti', quantity: 1, price_minor: 2800 },
      { name: 'Fattoush Salad', quantity: 1, price_minor: 3200 },
      { name: 'Large Mineral Water', quantity: 2, price_minor: 2000 },
      { name: 'Fresh Mint Lemonade', quantity: 2, price_minor: 3000 },
    ],
    engine: 'demo_sample',
  },
  carrefour: {
    merchant_name: 'Carrefour Market (Dubai Marina Crown)',
    date: new Date().toISOString().split('T')[0],
    currency: 'AED',
    trn: '100012345600003',
    subtotal_minor: 9524, // 95.24 AED
    vat_minor: 476, // 4.76 AED (5% VAT)
    total_minor: 10000, // 100.00 AED
    category: 'Groceries',
    confidence: 0.99,
    notes: 'Weekly shared apartment supplies.',
    line_items: [
      { name: 'Organic Fresh Milk 2L', quantity: 2, price_minor: 2200 },
      { name: 'Sourdough Country Bread', quantity: 1, price_minor: 1650 },
      { name: 'Free Range Eggs 30pk', quantity: 1, price_minor: 2850 },
      { name: 'Greek Yoghurt 1kg', quantity: 2, price_minor: 2200 },
      { name: 'Fresh Cavendish Bananas', quantity: 1, price_minor: 1100 },
    ],
    engine: 'demo_sample',
  },
  zaatar: {
    merchant_name: 'Careem DineOut • Zaatar w Zeit (DIFC)',
    date: new Date().toISOString().split('T')[0],
    currency: 'AED',
    trn: '100897654300003',
    subtotal_minor: 11810, // 118.10 AED
    vat_minor: 590, // 5.90 AED (5% VAT)
    total_minor: 12400, // 124.00 AED
    category: 'Food and dining',
    confidence: 0.97,
    notes: 'Careem DineOut team lunch split.',
    line_items: [
      { name: 'Famous Chicken Wrap', quantity: 2, price_minor: 6400 },
      { name: 'Manakeesh Zaatar & Cheese', quantity: 2, price_minor: 3800 },
      { name: 'Spiced Potato Wedges', quantity: 1, price_minor: 2200 },
    ],
    engine: 'demo_sample',
  },
};

/**
 * Deterministically distributes itemized line items and proportionally scales the 5% VAT.
 * Invariant 3: Payer & Allocation Invariants (sum must equal totalMinor exactly).
 */
export function calculateItemizedShares(
  totalMinor: number,
  lineItems: ReceiptItem[],
  itemAssignments: Record<number, string[]>, // item index -> userIds
  participantIds: string[]
): Record<string, number> {
  if (!participantIds || participantIds.length === 0) {
    throw new LedgerInvariantError('Cannot split receipt without participants');
  }

  // Check if any items are assigned
  const hasAssignments = Object.values(itemAssignments).some((uids) => uids.length > 0);
  if (!hasAssignments || !lineItems || lineItems.length === 0) {
    return splitEqual(totalMinor, participantIds);
  }

  const userSubtotals: Record<string, number> = {};
  participantIds.forEach((id) => {
    userSubtotals[id] = 0;
  });

  // 1. Distribute each item's minor units among its assigned users
  let rawItemsTotal = 0;

  lineItems.forEach((item, idx) => {
    const assignedUsers = itemAssignments[idx] || [];
    const targetUsers = assignedUsers.length > 0 ? assignedUsers : participantIds;
    rawItemsTotal += item.price_minor;

    const baseShare = Math.floor(item.price_minor / targetUsers.length);
    let remainder = item.price_minor - baseShare * targetUsers.length;

    targetUsers.forEach((uid) => {
      let share = baseShare;
      if (remainder > 0) {
        share += 1;
        remainder -= 1;
      }
      userSubtotals[uid] = (userSubtotals[uid] || 0) + share;
    });
  });

  // 2. Proportionally scale user shares to match totalMinor exactly (allocating VAT & rounding)
  if (rawItemsTotal === 0) {
    return splitEqual(totalMinor, participantIds);
  }

  const finalShares: Record<string, number> = {};
  let distributedMinor = 0;

  participantIds.forEach((uid) => {
    const userSub = userSubtotals[uid] || 0;
    const scaled = Math.floor((userSub * totalMinor) / rawItemsTotal);
    finalShares[uid] = scaled;
    distributedMinor += scaled;
  });

  // 3. Invariant check: remainder distribution (zero-loss guarantee)
  let diff = totalMinor - distributedMinor;
  if (diff > 0) {
    const sortedParticipants = [...participantIds].sort(
      (a, b) => (userSubtotals[b] || 0) - (userSubtotals[a] || 0)
    );
    let i = 0;
    while (diff > 0) {
      const uid = sortedParticipants[i % sortedParticipants.length];
      finalShares[uid] += 1;
      diff -= 1;
      i++;
    }
  }

  return finalShares;
}
