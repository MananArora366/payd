/**
 * Careem Super App MCP (Model Context Protocol) Tools
 * Official Careem Builders '26 MCP integration bridging Payd Social Finance
 * with Careem Rides, Careem Food, Careem Quik (Groceries), and Careem Pay.
 *
 * These handlers return mock data and never call Careem. Results are labelled
 * with CAREEM_MCP_URL, which defaults to the local Careem MCP sandbox
 * (https://builders.careem.com/docs/sandbox), not production. Every result
 * carries `simulated: true` where it describes an action (booking, payment).
 *
 * Money is computed in integer fils (100 fils = AED 1) and only formatted to
 * AED strings at the edge.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { McpToolResult, jsonResult, toolError, aedToFils, findGroup } from './paydTools';
import { careemPayDeeplink, careemPayLink, filsToAedString } from './careemPayLink';
import { splitEqual } from '@/lib/ledger';
import { INITIAL_GROUP_MEMBERS, INITIAL_USERS } from '@/lib/store/initialData';

/** Careem MCP server Payd targets. Sandbox by default; production is https://mcp.careemapis.com/mcp. */
export const CAREEM_MCP_URL = process.env.CAREEM_MCP_URL || 'http://127.0.0.1:8787/mcp';

/** UAE VAT rate, in basis points (5%). */
const VAT_BPS = 500;
/** Flat Careem Food delivery fee used by the mock, in fils (AED 7.00). */
const DELIVERY_FEE_MINOR = 700;
/** CAREEM26 promo value in fils (AED 20.00), capped at the subtotal. */
const PROMO_CAREEM26_MINOR = 2000;
/** Lifetime of a request_ride context_blob. */
export const RIDE_BLOB_TTL_MS = 120_000;

const vatOn = (minor: number) => Math.round((minor * VAT_BPS) / 10_000);

/**
 * Official Careem Builders '26 Agent Playbook Contracts & Tools
 */

export interface UserInfoParams {
  includeSavedLocations?: boolean;
  includePaymentMethods?: boolean;
}

export type RideType = 'comfort' | 'eco' | 'hala_taxi' | 'executive';

export interface RequestRideParams {
  pickup_latitude?: number;
  pickup_longitude?: number;
  dropoff_latitude?: number;
  dropoff_longitude?: number;
  destination_name?: string;
  ride_type?: RideType;
}

export interface CreateRideParams {
  context_blob: string;
  confirmed_by_user: boolean;
  split_with_riders?: string[];
}

export interface CartBasketPriceParams {
  items?: Array<{ name: string; price_aed: number; quantity: number }>;
  promo_code?: string;
  delivery_address?: string;
}

export interface GetActivitiesParams {
  type: 'past' | 'upcoming';
  limit?: number;
}

export interface CareemRideSplitParams {
  rideId?: string;
  pickup?: string;
  dropoff?: string;
  totalFareAed?: number;
  riderNames?: string[];
}

export interface CareemFoodOrderParams {
  restaurantName?: string;
  orderId?: string;
  items?: Array<{ name: string; priceAed: number; quantity: number }>;
  vatAed?: number;
  deliveryFeeAed?: number;
}

export interface CareemQuikBasketParams {
  basketId?: string;
  storeName?: string;
  groupName?: string;
}

export interface CareemPaySettleParams {
  /** Careem Pay tag of the recipient, e.g. "@rahul.careem". Either this or recipientPhone is required. */
  recipientTag?: string;
  /** UAE mobile number of the recipient (+971...). */
  recipientPhone?: string;
  recipientName?: string;
  /** Amount in integer fils (100 fils = AED 1). Preferred over amountAed. */
  amountMinor?: number;
  /** Amount in AED; converted to fils. Used only when amountMinor is absent. */
  amountAed?: number;
  note?: string;
  /** Golden Rule: must be the boolean true, set only after the user confirmed this exact payment. */
  confirmed_by_user?: boolean;
}

/** Splits `totalMinor` equally (zero-loss) across `names`, in order. */
function namedEqualSplit(totalMinor: number, names: string[]) {
  const keys = names.map((_, i) => String(i));
  const shares = splitEqual(totalMinor, keys);
  return names.map((name, i) => ({ name, shareMinor: shares[String(i)] }));
}

/**
 * Playbook Tool 1: user_info
 * Playbook Rule 1: Always pass user's coordinates. Get saved addresses for "home" or "work".
 */
export async function handleUserInfo(params: UserInfoParams = {}): Promise<McpToolResult> {
  return jsonResult({
    success: true,
    simulated: true,
    user_id: 'cr-usr-manan-9281',
    name: 'Manan Arora',
    phone: '+971501234567',
    currency: 'AED',
    careem_pay_wallet_balance_aed: '345.50',
    ...(params.includeSavedLocations === false
      ? {}
      : {
          saved_locations: {
            home: { label: 'Home', address: 'Silverene Tower B, Dubai Marina, Dubai', latitude: 25.0772, longitude: 55.1333 },
            work: { label: 'Work', address: 'Gate Village 03, DIFC, Dubai', latitude: 25.2104, longitude: 55.2818 },
          },
        }),
    preferred_payment: 'Careem Pay Wallet (Default: card -> wallet -> cash)',
    careem_plus_subscriber: true,
  });
}

// ─── Signed ride context blobs ─────────────────────────────────────────────

const RIDE_OPTIONS: Record<RideType, { label: string; fareMinor: number; eta: number; vehicle: string }> = {
  comfort: { label: 'Careem Comfort', fareMinor: 6850, eta: 4, vehicle: 'Lexus ES300h' },
  eco: { label: 'Careem Eco', fareMinor: 5600, eta: 6, vehicle: 'Toyota Camry Hybrid' },
  hala_taxi: { label: 'Hala Taxi', fareMinor: 4800, eta: 8, vehicle: 'Dubai Taxi Metered' },
  executive: { label: 'Careem Executive', fareMinor: 11200, eta: 7, vehicle: 'Mercedes E-Class' },
};

export interface RideContext {
  req_id: string;
  ride_type: RideType;
  pickup: [number, number];
  dropoff: [number, number];
  fare_minor: number;
  expires_at: number;
}

type GlobalWithSecret = typeof globalThis & { __paydMcpBlobSecret?: Buffer; __paydMcpUsedRides?: Set<string> };
const g = globalThis as GlobalWithSecret;

/** HMAC key for context blobs. Set PAYD_MCP_SECRET in production; otherwise a per-process random key. */
function blobSecret(): Buffer {
  if (process.env.PAYD_MCP_SECRET) return Buffer.from(process.env.PAYD_MCP_SECRET, 'utf8');
  if (!g.__paydMcpBlobSecret) g.__paydMcpBlobSecret = randomBytes(32);
  return g.__paydMcpBlobSecret;
}

/** Ride requests that have already been booked (blobs are single-use: never blind-retry). */
function usedRides(): Set<string> {
  if (!g.__paydMcpUsedRides) g.__paydMcpUsedRides = new Set();
  return g.__paydMcpUsedRides;
}

const sign = (payload: string) => createHmac('sha256', blobSecret()).update(payload).digest('base64url');

export function signRideContext(ctx: RideContext): string {
  const payload = Buffer.from(JSON.stringify(ctx), 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyRideContext(
  blob: string,
  now = Date.now()
): { ok: true; ctx: RideContext } | { ok: false; error: string } {
  const parts = typeof blob === 'string' ? blob.trim().split('.') : [];
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, error: 'context_blob is not a valid blob from request_ride. Pass it verbatim.' };
  }
  const [payload, sig] = parts;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, error: 'context_blob failed its integrity check (altered or not issued by request_ride). Call request_ride again.' };
  }
  let ctx: RideContext;
  try {
    ctx = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, error: 'context_blob could not be read. Call request_ride again.' };
  }
  if (!Number.isSafeInteger(ctx.fare_minor) || ctx.fare_minor <= 0 || !RIDE_OPTIONS[ctx.ride_type]) {
    return { ok: false, error: 'context_blob contains an invalid quote. Call request_ride again.' };
  }
  if (typeof ctx.expires_at !== 'number' || now > ctx.expires_at) {
    return { ok: false, error: 'context_blob has expired (quotes last 2 minutes). Call request_ride again and re-confirm with the user.' };
  }
  return { ok: true, ctx };
}

/**
 * Playbook Tool 2: request_ride
 * Playbook Rule 2: context_blob from request_ride must be passed verbatim to create_ride and expires quickly.
 */
export async function handleRequestRide(params: RequestRideParams = {}): Promise<McpToolResult> {
  const pickupLat = params.pickup_latitude ?? 25.0772; // Default: Dubai Marina Home
  const pickupLng = params.pickup_longitude ?? 55.1333;
  const dropoffLat = params.dropoff_latitude ?? 25.2104; // Default: DIFC Work
  const dropoffLng = params.dropoff_longitude ?? 55.2818;
  for (const [label, v, lim] of [
    ['pickup_latitude', pickupLat, 90],
    ['dropoff_latitude', dropoffLat, 90],
    ['pickup_longitude', pickupLng, 180],
    ['dropoff_longitude', dropoffLng, 180],
  ] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > lim) {
      return toolError(`${label} must be a number between -${lim} and ${lim}`);
    }
  }
  const rideType: RideType = params.ride_type ?? 'comfort';
  const option = RIDE_OPTIONS[rideType];
  if (!option) return toolError(`ride_type must be one of: ${Object.keys(RIDE_OPTIONS).join(', ')}`);

  const now = Date.now();
  const contextBlob = signRideContext({
    req_id: `CR-REQ-${now.toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`,
    ride_type: rideType,
    pickup: [pickupLat, pickupLng],
    dropoff: [dropoffLat, dropoffLng],
    fare_minor: option.fareMinor,
    expires_at: now + RIDE_BLOB_TTL_MS,
  });

  return jsonResult({
    success: true,
    simulated: true,
    provider: 'Careem Rides MCP',
    pickup: { latitude: pickupLat, longitude: pickupLng },
    dropoff: { latitude: dropoffLat, longitude: dropoffLng, label: params.destination_name || null },
    ride_type: rideType,
    quote: { type: option.label, fare_aed: filsToAedString(option.fareMinor), eta_mins: option.eta, vehicle: option.vehicle },
    other_options: (Object.keys(RIDE_OPTIONS) as RideType[])
      .filter((k) => k !== rideType)
      .map((k) => ({ ride_type: k, type: RIDE_OPTIONS[k].label, fare_aed: filsToAedString(RIDE_OPTIONS[k].fareMinor) })),
    context_blob: contextBlob,
    expires_in_seconds: RIDE_BLOB_TTL_MS / 1000,
    notice: 'Playbook Rule 2: Pass context_blob verbatim to create_ride before expiry. The blob covers only the quoted ride_type; call request_ride again to book a different one.',
  });
}

/**
 * Playbook Tool 3: create_ride (Mutating)
 * Playbook Golden Rule: Mutating tools spend user money - ALWAYS confirm first, never blind-retry.
 */
export async function handleCreateRide(params: CreateRideParams): Promise<McpToolResult> {
  if (!params || typeof params.context_blob !== 'string' || !params.context_blob.trim()) {
    return toolError('Missing required context_blob from request_ride (Playbook Rule 2)');
  }
  const verified = verifyRideContext(params.context_blob);
  if (!verified.ok) return toolError(verified.error);
  const ctx = verified.ctx;
  const option = RIDE_OPTIONS[ctx.ride_type];

  if (params.confirmed_by_user !== true) {
    return toolError('User confirmation required before booking (Playbook Golden Rule). confirmed_by_user must be the boolean true.', {
      prompt: `Please confirm booking a ${option.label} ride for AED ${filsToAedString(ctx.fare_minor)}.`,
    });
  }
  if (params.split_with_riders !== undefined && !Array.isArray(params.split_with_riders)) {
    return toolError('split_with_riders must be an array of names');
  }
  const friends = (params.split_with_riders ?? []).map((r) => (typeof r === 'string' ? r.trim() : ''));
  if (friends.some((r) => !r)) return toolError('split_with_riders must contain non-empty names');

  if (usedRides().has(ctx.req_id)) {
    return toolError('This ride quote was already booked. Do not retry; call request_ride for a new ride.');
  }
  usedRides().add(ctx.req_id);

  const riders = ['You (Manan Arora)', ...new Set(friends)];
  const split =
    riders.length > 1
      ? {
          riders_count: riders.length,
          splits: namedEqualSplit(ctx.fare_minor, riders).map((s) => ({ rider: s.name, share_minor: s.shareMinor, share_aed: filsToAedString(s.shareMinor) })),
          zero_loss_conservation: '100% verified',
          recorded: false,
          next_step: 'Not saved in Payd. Ask the user to add this split in the Payd app.',
        }
      : null;

  return jsonResult({
    success: true,
    simulated: true,
    status: 'BOOKED_AND_DISPATCHED',
    booking_id: `CR-BK-${Date.now().toString(36).toUpperCase()}`,
    request_id: ctx.req_id,
    ride_type: ctx.ride_type,
    captain: { name: 'Muhammad Tariq', rating: 4.94, car: option.vehicle, plate: 'DXB B-84920', eta_minutes: option.eta },
    total_fare_minor: ctx.fare_minor,
    total_fare_aed: filsToAedString(ctx.fare_minor),
    payment_status: 'Charged to Careem Pay Wallet (Default Rail)',
    payd_social_split: split,
    notice: 'Sandbox mock: no real ride was booked and no money moved.',
  });
}

/**
 * Playbook Tool 4: cart_get_basket_price
 * Playbook Rule 3: Never checkout blind - call cart_get_basket_price first and pass total as total_price.
 *
 * Pricing: subtotal = Σ price×qty; promo is capped at the subtotal; a flat
 * AED 7.00 delivery fee applies; UAE VAT (5%) is charged on the discounted
 * subtotal plus the delivery fee (delivery is a taxable supply in the UAE).
 */
export async function handleCartGetBasketPrice(params: CartBasketPriceParams = {}): Promise<McpToolResult> {
  const defaultItems = [
    { name: 'Al Safadi Mixed Grill Platter', price_aed: 125.0, quantity: 1 },
    { name: 'Hummus Beiruty', price_aed: 28.0, quantity: 2 },
    { name: 'Fresh Mint Lemonade', price_aed: 24.0, quantity: 2 },
  ];
  const items = params.items && params.items.length > 0 ? params.items : defaultItems;

  const lines: { name: string; quantity: number; unitMinor: number; lineMinor: number }[] = [];
  for (const [i, item] of items.entries()) {
    if (!item || typeof item.name !== 'string' || !item.name.trim()) return toolError(`items[${i}].name is required`);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) return toolError(`items[${i}].quantity must be a whole number of at least 1`);
    if (item.price_aed === 0) {
      lines.push({ name: item.name, quantity: item.quantity, unitMinor: 0, lineMinor: 0 });
      continue;
    }
    const unit = aedToFils(item.price_aed, `items[${i}].price_aed`);
    if (!unit.ok) return toolError(unit.error);
    const lineMinor = unit.value * item.quantity;
    if (!Number.isSafeInteger(lineMinor)) return toolError(`items[${i}] total is too large`);
    lines.push({ name: item.name, quantity: item.quantity, unitMinor: unit.value, lineMinor });
  }

  const subtotal = lines.reduce((s, l) => s + l.lineMinor, 0);
  const promoCode = params.promo_code?.trim().toUpperCase();
  const promoValid = promoCode === 'CAREEM26';
  const promoDiscount = promoValid ? Math.min(PROMO_CAREEM26_MINOR, subtotal) : 0;
  const deliveryFee = DELIVERY_FEE_MINOR;
  const vatBase = subtotal - promoDiscount + deliveryFee;
  const vat = vatOn(vatBase);
  const total = vatBase + vat;

  return jsonResult({
    success: true,
    simulated: true,
    provider: 'Careem Food MCP',
    delivery_address: params.delivery_address || 'Silverene Tower B, Dubai Marina',
    items: lines.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      price_aed: filsToAedString(l.unitMinor),
      line_total: filsToAedString(l.lineMinor),
    })),
    promo: promoCode ? { code: promoCode, applied: promoValid, reason: promoValid ? null : 'Unknown promo code' } : null,
    pricing: {
      subtotal_aed: filsToAedString(subtotal),
      promo_discount_aed: filsToAedString(promoDiscount),
      delivery_fee_aed: filsToAedString(deliveryFee),
      uae_vat_5_pct_aed: filsToAedString(vat),
      vat_basis: 'UAE VAT 5% on (subtotal - promo + delivery fee)',
      total_price: filsToAedString(total), // Must be passed verbatim to checkout (Rule 3)
      total_price_minor: total,
    },
    notice: 'Playbook Rule 3: Pass this total_price verbatim to checkout. Confirm with user before mutating.',
  });
}

/**
 * Playbook Tool 5: get_activities
 * Playbook Rule 5: Personalize with get_activities(past) - prefer known favourites over cold search.
 */
const PAST_ACTIVITIES = [
  { id: 'ACT-9821', service: 'Careem Rides', title: 'Ride to DIFC Gate Village', date: 'Yesterday, 8:45 PM', amount_aed: '68.50', status: 'Completed', split_ready: true },
  { id: 'ACT-9819', service: 'Careem Food', title: 'Al Safadi Lebanese Restaurant', date: 'Nov 12, 1:15 PM', amount_aed: '229.00', status: 'Delivered', split_ready: true },
  { id: 'ACT-9804', service: 'Careem Quik', title: 'Weekly Flatmate Groceries', date: 'Nov 10, 6:30 PM', amount_aed: '191.50', status: 'Delivered', split_ready: true },
];

export async function handleGetActivities(params: GetActivitiesParams): Promise<McpToolResult> {
  if (params?.type !== 'past' && params?.type !== 'upcoming') return toolError('type must be one of: past, upcoming');
  if (params.limit !== undefined && (!Number.isSafeInteger(params.limit) || params.limit < 1)) {
    return toolError('limit must be a whole number of at least 1');
  }
  const all = params.type === 'past' ? PAST_ACTIVITIES : [];
  const activities = all.slice(0, params.limit ?? all.length);
  return jsonResult({
    success: true,
    simulated: true,
    type: params.type,
    activities,
    ...(params.type === 'past'
      ? { favourites: ['Al Safadi DIFC (Ordered 4 times)', 'Careem Comfort: Marina -> DIFC (Taken 12 times)'] }
      : { notice: 'No upcoming scheduled rides or orders.' }),
  });
}

/**
 * Tool 6: Split Careem Ride Fare among passengers with integer minor units.
 * Careem fares are VAT-inclusive; the VAT portion (5/105 of the fare) is reported for information.
 */
export async function handleCareemRideSplit(params: CareemRideSplitParams = {}): Promise<McpToolResult> {
  const fare = aedToFils(params.totalFareAed ?? 68.5, 'totalFareAed');
  if (!fare.ok) return toolError(fare.error);
  if (params.riderNames !== undefined && !Array.isArray(params.riderNames)) return toolError('riderNames must be an array of names');
  const riders = params.riderNames && params.riderNames.length > 0 ? params.riderNames.map((r) => (typeof r === 'string' ? r.trim() : '')) : ['Manan', 'Veer', 'Prakarsh'];
  if (riders.some((r) => !r)) return toolError('riderNames must contain non-empty names');

  const fareMinor = fare.value;
  const vatIncluded = Math.round((fareMinor * VAT_BPS) / (10_000 + VAT_BPS));
  const splits = namedEqualSplit(fareMinor, riders).map((s) => ({
    member: s.name,
    share_aed: filsToAedString(s.shareMinor),
    share_minor: s.shareMinor,
  }));

  return jsonResult({
    success: true,
    simulated: true,
    provider: 'Careem MCP Rides',
    endpoint: CAREEM_MCP_URL,
    service: 'Careem Comfort',
    pickup: params.pickup || 'Dubai Marina, Silverene Tower',
    dropoff: params.dropoff || 'Gate Village, DIFC',
    total_fare_aed: filsToAedString(fareMinor),
    total_fare_minor: fareMinor,
    vat_included_aed: filsToAedString(vatIncluded),
    vat_note: 'Fare is VAT-inclusive; UAE VAT 5% portion shown for information.',
    riders_count: riders.length,
    splits,
    zero_loss_verified: splits.reduce((s, x) => s + x.share_minor, 0) === fareMinor,
    careem_pay_deeplink: `careem://pay/split?amount=${filsToAedString(fareMinor)}&currency=AED&ref=payd-ride-split`,
  });
}

/**
 * Tool 7: Import Careem Food order into Payd Tap-to-Claim bill splitting.
 * VAT defaults to 5% of (subtotal + delivery fee) unless vatAed is given.
 */
export async function handleCareemFoodImport(params: CareemFoodOrderParams = {}): Promise<McpToolResult> {
  const restaurant = params.restaurantName || 'Al Safadi DIFC';
  const defaultItems = [
    { name: 'Mixed Grill Platter (Large)', priceAed: 125.0, quantity: 1 },
    { name: 'Hummus Beiruty & Fresh Bread', priceAed: 28.0, quantity: 2 },
    { name: 'Fattoush Salad with Pomegranate', priceAed: 32.0, quantity: 1 },
    { name: 'Fresh Mint Lemonade', priceAed: 24.0, quantity: 3 },
  ];
  const items = params.items && params.items.length > 0 ? params.items : defaultItems;

  const lines: { name: string; quantity: number; unitMinor: number; lineMinor: number }[] = [];
  for (const [i, it] of items.entries()) {
    if (!it || typeof it.name !== 'string' || !it.name.trim()) return toolError(`items[${i}].name is required`);
    if (!Number.isSafeInteger(it.quantity) || it.quantity < 1) return toolError(`items[${i}].quantity must be a whole number of at least 1`);
    const unit = aedToFils(it.priceAed, `items[${i}].priceAed`);
    if (!unit.ok) return toolError(unit.error);
    lines.push({ name: it.name, quantity: it.quantity, unitMinor: unit.value, lineMinor: unit.value * it.quantity });
  }
  const optionalFils = (v: number | undefined, field: string) => (v === undefined || v === 0 ? { ok: true as const, value: v === 0 ? 0 : undefined } : aedToFils(v, field));
  const fee = optionalFils(params.deliveryFeeAed, 'deliveryFeeAed');
  if (!fee.ok) return toolError(fee.error);
  const vatIn = optionalFils(params.vatAed, 'vatAed');
  if (!vatIn.ok) return toolError(vatIn.error);

  const subtotal = lines.reduce((s, l) => s + l.lineMinor, 0);
  const deliveryFee = fee.value ?? DELIVERY_FEE_MINOR;
  const vat = vatIn.value ?? vatOn(subtotal + deliveryFee);
  const total = subtotal + deliveryFee + vat;

  return jsonResult({
    success: true,
    simulated: true,
    provider: 'Careem MCP Food',
    endpoint: CAREEM_MCP_URL,
    restaurant,
    order_id: params.orderId || 'CR-FOOD-92841-DXB',
    items: lines.map((l, idx) => ({
      id: `item-${idx + 1}`,
      name: l.name,
      quantity: l.quantity,
      unit_price_aed: filsToAedString(l.unitMinor),
      line_total_aed: filsToAedString(l.lineMinor),
      claimable: true,
    })),
    breakdown: {
      subtotal_aed: filsToAedString(subtotal),
      delivery_fee_aed: filsToAedString(deliveryFee),
      uae_vat_5_pct: filsToAedString(vat),
      vat_basis: params.vatAed !== undefined ? 'As provided' : 'UAE VAT 5% on (subtotal + delivery fee)',
      total_aed: filsToAedString(total),
      total_minor: total,
    },
    status: 'Ready for Tap-to-Claim splitting in Payd (not yet saved)',
  });
}

/**
 * Tool 8: Import Careem Quik Groceries basket and suggest an equal split
 * across the members of the named Payd group.
 */
const QUIK_ITEMS = [
  { name: 'Almarai Fresh Milk Full Fat 2L', qty: 2, priceMinor: 1350 },
  { name: 'Avocados Hass Mexico (Pack of 4)', qty: 1, priceMinor: 1800 },
  { name: 'Lurpak Slightly Salted Butter 400g', qty: 1, priceMinor: 2450 },
  { name: 'Nespresso Original Capsules (10pk)', qty: 2, priceMinor: 4200 },
  { name: 'Mai Dubai Water 1.5L (Case of 6)', qty: 2, priceMinor: 1900 },
];

export async function handleCareemQuikBasket(params: CareemQuikBasketParams = {}): Promise<McpToolResult> {
  const store = params.storeName || 'Careem Quik Marina Central';
  const groupRef = params.groupName?.trim() || 'Dubai Flatmates';
  const grp = findGroup(groupRef);
  if (!grp) return toolError(`Unknown group "${groupRef}"`);
  const memberIds = new Set(INITIAL_GROUP_MEMBERS.filter((m) => m.group_id === grp.id).map((m) => m.user_id));
  const members = INITIAL_USERS.filter((u) => memberIds.has(u.id)).map((u) => u.name);

  const total = QUIK_ITEMS.reduce((s, i) => s + i.qty * i.priceMinor, 0);
  const shares = namedEqualSplit(total, members);

  return jsonResult({
    success: true,
    simulated: true,
    provider: 'Careem MCP Quik (Groceries)',
    endpoint: CAREEM_MCP_URL,
    store,
    group: grp.name,
    basket_id: params.basketId || 'QK-BASKET-77312',
    delivery_eta: '15-20 mins',
    items: QUIK_ITEMS.map((i) => ({
      name: i.name,
      qty: i.qty,
      price_aed: filsToAedString(i.priceMinor),
      line_total_aed: filsToAedString(i.qty * i.priceMinor),
    })),
    total_basket_aed: filsToAedString(total),
    total_basket_minor: total,
    split_recommendation: {
      method: 'equal',
      members_count: members.length,
      shares: shares.map((s) => ({ member: s.name, share_minor: s.shareMinor, share_aed: filsToAedString(s.shareMinor) })),
    },
  });
}

/**
 * Tool 9: Direct instant peer-to-peer settlement via Careem Pay.
 * Validates the recipient, amount (integer fils) and explicit user
 * confirmation, and returns a simulated transfer receipt. Never invents a
 * default amount.
 */
export async function handleCareemPaySettle(params: CareemPaySettleParams): Promise<McpToolResult> {
  const tag = params.recipientTag?.trim();
  const phone = params.recipientPhone?.trim();
  if (!tag && !phone) {
    return toolError('recipientTag or recipientPhone is required');
  }
  if (tag && !/^@[a-z0-9._-]+\.careem$/i.test(tag)) {
    return toolError(`Invalid Careem Pay tag: ${tag} (expected @name.careem)`);
  }
  if (!tag && phone && !/^\+971\d{8,9}$/.test(phone.replace(/[\s-]/g, ''))) {
    return toolError(`Invalid UAE mobile number: ${phone} (expected +971...)`);
  }

  let amountMinor: number;
  if (params.amountMinor !== undefined) {
    amountMinor = params.amountMinor;
  } else if (params.amountAed !== undefined) {
    const r = aedToFils(params.amountAed, 'amountAed');
    if (!r.ok) return toolError(r.error);
    amountMinor = r.value;
  } else {
    return toolError('amountMinor (fils) or amountAed is required');
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return toolError('Amount must be a positive whole number of fils');
  }

  const recipient = tag ? { tag } : { phone: phone!.replace(/[\s-]/g, '') };
  const who = params.recipientName || tag || recipient.phone;
  if (params.confirmed_by_user !== true) {
    return toolError('User confirmation required before sending money (Playbook Golden Rule). confirmed_by_user must be the boolean true.', {
      prompt: `Please confirm sending AED ${filsToAedString(amountMinor)} to ${who} via Careem Pay.`,
    });
  }

  const ref = `CP-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`;

  return jsonResult({
    success: true,
    simulated: true,
    provider: 'Careem MCP Pay',
    endpoint: CAREEM_MCP_URL,
    settlement_method: 'Careem Pay',
    recipient: { ...recipient, name: params.recipientName || null },
    amount_minor: amountMinor,
    amount_aed: filsToAedString(amountMinor),
    currency: 'AED',
    note: params.note || null,
    status: 'INSTANT_AUTHORIZED',
    transaction_ref: ref,
    careem_pay_deeplink: careemPayDeeplink(recipient, amountMinor),
    payment_link: tag ? careemPayLink(tag, amountMinor) : null,
    authorized_at: new Date().toISOString(),
    notice: 'Sandbox mock: no money moved. Record the settlement in Payd once the real transfer completes.',
  });
}
