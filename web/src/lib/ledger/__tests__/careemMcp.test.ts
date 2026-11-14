import { describe, it, expect, vi } from 'vitest';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import {
  handleCareemRideSplit,
  handleCareemFoodImport,
  handleCareemQuikBasket,
  handleCareemPaySettle,
  handleRequestRide,
  handleCreateRide,
  handleCartGetBasketPrice,
  handleGetActivities,
  signRideContext,
  verifyRideContext,
} from '@/lib/mcp/careemTools';
import { callTool } from '@/lib/mcp/tools';

const parse = (res: { content: { text: string }[] }) => JSON.parse(res.content[0].text);
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

  it('careem_pay_settle_debt authorizes an exact-fils Careem Pay transfer by tag', async () => {
    const res = await handleCareemPaySettle({
      recipientTag: '@rahul.careem',
      recipientName: 'Rahul',
      amountMinor: 8550,
      note: 'Dinner split',
      confirmed_by_user: true,
    });

    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.status).toBe('INSTANT_AUTHORIZED');
    expect(parsed.settlement_method).toBe('Careem Pay');
    expect(parsed.amount_minor).toBe(8550);
    expect(parsed.amount_aed).toBe('85.50');
    expect(parsed.transaction_ref).toMatch(/^CP-/);
    expect(parsed.careem_pay_deeplink).toBe(
      'careem://pay/transfer?tag=%40rahul.careem&amount=85.50&currency=AED'
    );
    expect(JSON.stringify(parsed).toLowerCase()).not.toContain('aani');
  });

  it('careem_pay_settle_debt converts legacy amountAed and accepts a UAE phone', async () => {
    const res = await handleCareemPaySettle({ recipientPhone: '+971 50 123 4567', amountAed: 85.5, confirmed_by_user: true });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.amount_minor).toBe(8550);
    expect(parsed.recipient.phone).toBe('+971501234567');
  });

  it.each([
    [{ amountMinor: 1000 }, 'recipientTag or recipientPhone is required'],
    [{ recipientTag: '@rahul.careem' }, 'amountMinor (fils) or amountAed is required'],
    [{ recipientTag: '@rahul.careem', amountMinor: 0 }, 'positive whole number'],
    [{ recipientTag: '@rahul.careem', amountMinor: 10.5 }, 'positive whole number'],
    [{ recipientTag: 'rahul', amountMinor: 1000 }, 'Invalid Careem Pay tag'],
    [{ recipientPhone: '12345', amountMinor: 1000 }, 'Invalid UAE mobile number'],
    [{ recipientTag: '@rahul.careem', amountMinor: 1000 }, 'confirmed_by_user must be the boolean true'],
    [{ recipientTag: '@rahul.careem', amountMinor: 1000, confirmed_by_user: 'true' }, 'confirmed_by_user must be the boolean true'],
    [{ recipientTag: '@rahul.careem', amountAed: -5, confirmed_by_user: true }, 'greater than 0'],
  ])('careem_pay_settle_debt rejects invalid input %j', async (params, message) => {
    const res = await handleCareemPaySettle(params as any);
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text).error).toContain(message);
  });

  it('careem_quik_basket_split total equals the sum of qty x price', async () => {
    const parsed = parse(await handleCareemQuikBasket({}));
    const sum = parsed.items.reduce((s: number, i: any) => s + Math.round(Number(i.price_aed) * 100) * i.qty, 0);
    expect(parsed.total_basket_minor).toBe(sum);
    expect(parsed.total_basket_aed).toBe('191.50');
    const shares = parsed.split_recommendation.shares.reduce((s: number, x: any) => s + x.share_minor, 0);
    expect(shares).toBe(sum);
    expect((await handleCareemQuikBasket({ groupName: 'Nowhere' })).isError).toBe(true);
  });

  it('careem_rides_split_fare rejects negative and string fares and reports VAT', async () => {
    expect((await handleCareemRideSplit({ totalFareAed: -10 })).isError).toBe(true);
    expect((await callTool('careem_rides_split_fare', { totalFareAed: '50' })).isError).toBe(true);
    const parsed = parse(await handleCareemRideSplit({ totalFareAed: 105 }));
    expect(parsed.vat_included_aed).toBe('5.00');
  });

  it('cart_get_basket_price caps promo at subtotal, applies VAT to delivery, rejects negatives', async () => {
    const tiny = parse(await handleCartGetBasketPrice({ items: [{ name: 'Gum', price_aed: 5, quantity: 1 }], promo_code: 'careem26' }));
    expect(tiny.pricing.promo_discount_aed).toBe('5.00');
    // (5 - 5 + 7) = 7.00 + VAT 0.35
    expect(tiny.pricing.uae_vat_5_pct_aed).toBe('0.35');
    expect(tiny.pricing.total_price).toBe('7.35');
    const neg = await callTool('cart_get_basket_price', { items: [{ name: 'X', price_aed: -5, quantity: 1 }] });
    expect(neg.isError).toBe(true);
    const zeroQty = await callTool('cart_get_basket_price', { items: [{ name: 'X', price_aed: 5, quantity: 0 }] });
    expect(zeroQty.isError).toBe(true);
  });

  it('careem_food_import_order uses provided items, VAT and delivery fee in fils', async () => {
    const parsed = parse(
      await handleCareemFoodImport({ items: [{ name: 'Wrap', priceAed: 10.1, quantity: 3 }], deliveryFeeAed: 0, vatAed: 1.52 })
    );
    expect(parsed.breakdown.subtotal_aed).toBe('30.30');
    expect(parsed.breakdown.total_aed).toBe('31.82');
  });

  it('get_activities enforces type and returns upcoming (empty) for upcoming', async () => {
    expect(parse(await handleGetActivities({ type: 'upcoming' })).activities).toEqual([]);
    expect(parse(await handleGetActivities({ type: 'past', limit: 1 })).activities).toHaveLength(1);
    expect((await handleGetActivities({ type: 'future' as any })).isError).toBe(true);
  });

  it('request_ride validates coordinates and respects ride_type', async () => {
    expect((await handleRequestRide({ pickup_latitude: 200 })).isError).toBe(true);
    expect((await callTool('request_ride', { dropoff_longitude: -181 })).isError).toBe(true);
    const eco = parse(await handleRequestRide({ ride_type: 'eco' }));
    expect(eco.ride_type).toBe('eco');
    expect(eco.quote.fare_aed).toBe('56.00');
  });

  it('create_ride requires boolean confirmation and a genuine, unexpired, unused blob', async () => {
    const quote = parse(await handleRequestRide({ ride_type: 'hala_taxi' }));
    const blob = quote.context_blob as string;

    expect((await callTool('create_ride', { context_blob: blob, confirmed_by_user: 'false' })).isError).toBe(true);
    const unconfirmed = await handleCreateRide({ context_blob: blob, confirmed_by_user: false });
    expect(unconfirmed.isError).toBe(true);
    expect(parse(unconfirmed).prompt).toContain('48.00');

    // Forged fare: re-encode the payload with a negative fare but keep the old signature.
    const [payload, sig] = blob.split('.');
    const ctx = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const forged = Buffer.from(JSON.stringify({ ...ctx, fare_minor: -100 })).toString('base64url') + '.' + sig;
    expect(parse(await handleCreateRide({ context_blob: forged, confirmed_by_user: true })).error).toContain('integrity');
    // Legacy unsigned base64 blob.
    const legacy = Buffer.from(JSON.stringify({ fare_aed: 1 })).toString('base64');
    expect((await handleCreateRide({ context_blob: legacy, confirmed_by_user: true })).isError).toBe(true);
    // Expired.
    const expired = signRideContext({ ...ctx, expires_at: Date.now() - 1 });
    expect(parse(await handleCreateRide({ context_blob: expired, confirmed_by_user: true })).error).toContain('expired');
    expect(verifyRideContext(blob, ctx.expires_at + 1).ok).toBe(false);
    // split_with_riders must be an array.
    expect((await callTool('create_ride', { context_blob: blob, confirmed_by_user: true, split_with_riders: 'Sarah' })).isError).toBe(true);

    const booked = parse(await handleCreateRide({ context_blob: blob, confirmed_by_user: true, split_with_riders: ['Sarah', 'Rahul'] }));
    expect(booked.total_fare_minor).toBe(4800);
    expect(booked.payd_social_split.splits.reduce((s: number, x: any) => s + x.share_minor, 0)).toBe(4800);
    // Single use: no blind retry.
    expect(parse(await handleCreateRide({ context_blob: blob, confirmed_by_user: true })).error).toContain('already booked');

    // Through the schema-validated path too (real blobs are long).
    const viaTool = parse(await callTool('request_ride', {}));
    expect((await callTool('create_ride', { context_blob: viaTool.context_blob, confirmed_by_user: true })).isError).toBeFalsy();

    const solo = parse(await handleRequestRide({}));
    const soloBooked = parse(await handleCreateRide({ context_blob: solo.context_blob, confirmed_by_user: true, split_with_riders: [] }));
    expect(soloBooked.payd_social_split).toBeNull();
  });

  it('AWS Bedrock pipeline gracefully falls back to deterministic zero-loss parser offline', async () => {
    const mockContext = {
      currentUser: { id: 'user-1', name: 'Manan Arora', currency: 'AED' },
      knownMembers: [{ id: 'user-2', name: 'Sarah' }],
      groups: [{ id: 'grp-1', name: 'Dubai Flatmates' }],
      categories: ['Food and dining'],
    };

    vi.stubEnv('BEDROCK_ENABLED', 'true'); // Bedrock is opt-in
    const sendSpy = vi
      .spyOn(BedrockRuntimeClient.prototype, 'send')
      .mockRejectedValue(new Error('offline') as never);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let intent;
    try {
      intent = await interpretVoiceTranscriptBedrock(
        'Spent 85 dirhams on dinner with Sarah at Al Safadi',
        mockContext
      );
      expect(sendSpy).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledOnce();
    } finally {
      sendSpy.mockRestore();
      warnSpy.mockRestore();
      vi.unstubAllEnvs();
    }

    expect(intent.intent).toBe('split_expense');
    expect(intent.amount).toBe(85);
    expect(intent.currency).toBe('AED');
    expect(intent.participants).toContain('Sarah');
  });
});
