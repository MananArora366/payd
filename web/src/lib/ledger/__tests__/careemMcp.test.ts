import { describe, it, expect } from 'vitest';
import {
  handleCareemRideSplit,
  handleCareemFoodImport,
  handleCareemQuikBasket,
  handleCareemPaySettle,
} from '@/lib/mcp/careemTools';
import { interpretVoiceTranscriptBedrock } from '@/lib/ai/bedrock';

describe('Careem Super App MCP Tools (Careem Builders 26)', () => {
  it('careem_rides_split_fare calculates exact zero-loss shares among passengers', async () => {
    const res = await handleCareemRideSplit({
      pickup: 'Marina Gate',
      dropoff: 'Dubai Mall',
      totalFareAed: 100.0,
      riderNames: ['Manan', 'Sarah', 'Rahul'],
    });

    expect(res.content[0].type).toBe('text');
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.provider).toBe('Careem MCP Rides');
    expect(parsed.total_fare_aed).toBe('100.00');
    expect(parsed.splits).toHaveLength(3);

    // Verify zero loss (100 AED = 10,000 fils; 3334 + 3333 + 3333 = 10,000)
    const totalMinor = parsed.splits.reduce((acc: number, s: any) => acc + s.share_minor, 0);
    expect(totalMinor).toBe(10000);
  });

  it('careem_food_import_order parses restaurant order line items with 5% UAE VAT', async () => {
    const res = await handleCareemFoodImport({
      restaurantName: 'Al Safadi DIFC',
      orderId: 'CR-TEST-123',
    });

    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.restaurant).toBe('Al Safadi DIFC');
    expect(parsed.items.length).toBeGreaterThan(0);
    expect(parsed.breakdown.uae_vat_5_pct).toBeDefined();
  });

  it('careem_quik_basket_split imports dark-store grocery basket items', async () => {
    const res = await handleCareemQuikBasket({
      storeName: 'Careem Quik Downtown',
      groupName: 'Dubai Flatmates',
    });

    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.provider).toBe('Careem MCP Quik (Groceries)');
    expect(parsed.items.length).toBeGreaterThan(0);
  });

  it('careem_pay_settle_debt generates instant Aani QR and deep link', async () => {
    const res = await handleCareemPaySettle({
      recipientPhone: '+971501234567',
      amountAed: 85.5,
    });

    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.status).toBe('INSTANT_AUTHORIZED');
    expect(parsed.aani_qr_payload).toContain('aani://pay');
    expect(parsed.careem_pay_deeplink).toContain('careem://pay');
  });

  it('AWS Bedrock pipeline gracefully falls back to deterministic zero-loss parser offline', async () => {
    const mockContext = {
      currentUser: { id: 'user-1', name: 'Manan Arora', currency: 'AED' },
      knownMembers: [{ id: 'user-2', name: 'Sarah' }],
      groups: [{ id: 'grp-1', name: 'Dubai Flatmates' }],
      categories: ['Food and dining'],
    };

    const intent = await interpretVoiceTranscriptBedrock(
      'Spent 85 dirhams on dinner with Sarah at Al Safadi',
      mockContext
    );

    expect(intent.intent).toBe('split_expense');
    expect(intent.amount).toBe(85);
    expect(intent.currency).toBe('AED');
    expect(intent.participants).toContain('Sarah');
  });
});
