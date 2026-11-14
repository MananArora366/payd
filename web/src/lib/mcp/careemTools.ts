/**
 * Careem Super App MCP (Model Context Protocol) Tools
 * Official Careem Builders '26 MCP integration bridging Payd Social Finance
 * with Careem Rides, Careem Food, Careem Quik (Groceries), and Careem Pay.
 * 
 * Endpoint: https://mcp.careemapis.com/mcp
 */

import { McpToolResult } from './paydTools';

/**
 * Official Careem Builders '26 Agent Playbook Contracts & Tools
 * Endpoint: https://mcp.careemapis.com/mcp
 */

export interface UserInfoParams {
  includeSavedLocations?: boolean;
  includePaymentMethods?: boolean;
}

export interface RequestRideParams {
  pickup_latitude?: number;
  pickup_longitude?: number;
  dropoff_latitude?: number;
  dropoff_longitude?: number;
  destination_name?: string;
  ride_type?: 'comfort' | 'eco' | 'hala_taxi' | 'executive';
}

export interface CreateRideParams {
  context_blob: string;
  confirmed_by_user: boolean;
  split_with_riders?: string[];
}

export interface CartBasketPriceParams {
  items: Array<{ name: string; price_aed: number; quantity: number }>;
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
  recipientPhone: string;
  amountAed: number;
  note?: string;
}

/**
 * Playbook Tool 1: user_info
 * Playbook Rule 1: Always pass user's coordinates. Get saved addresses for "home" or "work".
 */
export async function handleUserInfo(params: UserInfoParams = {}): Promise<McpToolResult> {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            success: true,
            user_id: 'cr-usr-manan-9281',
            name: 'Manan Arora',
            phone: '+971501234567',
            currency: 'AED',
            careem_pay_wallet_balance_aed: 345.50,
            saved_locations: {
              home: {
                label: 'Home',
                address: 'Silverene Tower B, Dubai Marina, Dubai',
                latitude: 25.0772,
                longitude: 55.1333,
              },
              work: {
                label: 'Work',
                address: 'Gate Village 03, DIFC, Dubai',
                latitude: 25.2104,
                longitude: 55.2818,
              },
            },
            preferred_payment: 'Careem Pay Wallet (Default: card -> wallet -> cash)',
            careem_plus_subscriber: true,
          },
          null,
          2
        ),
      },
    ],
  };
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

  const now = Date.now();
  const contextBlob = Buffer.from(
    JSON.stringify({
      req_id: `CR-REQ-${now.toString(36).toUpperCase()}`,
      pickup: [pickupLat, pickupLng],
      dropoff: [dropoffLat, dropoffLng],
      fare_aed: 68.50,
      surge_multiplier: 1.0,
      expires_at: now + 120_000, // 2 minutes expiry (Playbook Rule 2)
    })
  ).toString('base64');

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            success: true,
            provider: 'Careem Rides MCP',
            pickup: { latitude: pickupLat, longitude: pickupLng, label: 'Dubai Marina' },
            dropoff: { latitude: dropoffLat, longitude: dropoffLng, label: params.destination_name || 'DIFC Gate Village' },
            options: [
              { type: 'Careem Comfort', fare_aed: '68.50', eta_mins: 4, vehicle: 'Lexus ES300h' },
              { type: 'Careem Eco', fare_aed: '56.00', eta_mins: 6, vehicle: 'Toyota Camry Hybrid' },
              { type: 'Hala Taxi', fare_aed: '48.00', eta_mins: 8, vehicle: 'Dubai Taxi Metered' },
            ],
            context_blob: contextBlob,
            expires_in_seconds: 120,
            notice: 'Playbook Rule 2: Pass context_blob verbatim to create_ride before expiry.',
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Playbook Tool 3: create_ride (Mutating)
 * Playbook Golden Rule: Mutating tools spend user money - ALWAYS confirm first, never blind-retry.
 */
export async function handleCreateRide(params: CreateRideParams): Promise<McpToolResult> {
  if (!params.context_blob) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: 'Missing required context_blob from request_ride (Playbook Rule 2)',
          }),
        },
      ],
    };
  }

  if (!params.confirmed_by_user) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: 'User confirmation required before executing mutating ride creation (Playbook Golden Rule)',
            prompt: 'Please confirm booking a Careem Comfort ride for AED 68.50.',
          }),
        },
      ],
    };
  }

  let decodedContext: any = {};
  try {
    decodedContext = JSON.parse(Buffer.from(params.context_blob, 'base64').toString('utf-8'));
  } catch {
    decodedContext = { fare_aed: 68.50 };
  }

  const riders = params.split_with_riders || ['Manan Arora', 'Sarah', 'Rahul'];
  const fareAed = decodedContext.fare_aed || 68.50;
  const fareMinor = Math.round(fareAed * 100);
  const shareMinor = Math.floor(fareMinor / riders.length);
  const remainder = fareMinor % riders.length;

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            success: true,
            status: 'BOOKED_AND_DISPATCHED',
            booking_id: `CR-BK-${Date.now().toString(36).toUpperCase()}`,
            captain: {
              name: 'Muhammad Tariq',
              rating: 4.94,
              car: 'Lexus ES 300h (Black)',
              plate: 'DXB B-84920',
              eta_minutes: 3,
            },
            total_fare_aed: fareAed.toFixed(2),
            payment_status: 'Charged to Careem Pay Wallet (Default Rail)',
            payd_social_split: {
              riders_count: riders.length,
              splits: riders.map((r, i) => ({
                rider: r,
                share_aed: ((shareMinor + (i < remainder ? 1 : 0)) / 100).toFixed(2),
              })),
              zero_loss_conservation: '100% verified',
            },
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Playbook Tool 4: cart_get_basket_price
 * Playbook Rule 3: Never checkout blind - call cart_get_basket_price first and pass total as total_price.
 */
export async function handleCartGetBasketPrice(params: CartBasketPriceParams): Promise<McpToolResult> {
  const defaultItems = [
    { name: 'Al Safadi Mixed Grill Platter', price_aed: 125.0, quantity: 1 },
    { name: 'Hummus Beiruty', price_aed: 28.0, quantity: 2 },
    { name: 'Fresh Mint Lemonade', price_aed: 24.0, quantity: 2 },
  ];

  const items = params.items && params.items.length > 0 ? params.items : defaultItems;
  const subtotal = items.reduce((sum, item) => sum + item.price_aed * item.quantity, 0);
  const promoDiscount = params.promo_code?.toUpperCase() === 'CAREEM26' ? 20.0 : 0.0;
  const uaeVat = +((subtotal - promoDiscount) * 0.05).toFixed(2);
  const deliveryFee = 7.0;
  const totalPrice = +(subtotal - promoDiscount + uaeVat + deliveryFee).toFixed(2);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            success: true,
            provider: 'Careem Food MCP',
            delivery_address: params.delivery_address || 'Silverene Tower B, Dubai Marina',
            items: items.map((i) => ({
              ...i,
              line_total: (i.price_aed * i.quantity).toFixed(2),
            })),
            pricing: {
              subtotal_aed: subtotal.toFixed(2),
              promo_discount_aed: promoDiscount.toFixed(2),
              uae_vat_5_pct_aed: uaeVat.toFixed(2),
              delivery_fee_aed: deliveryFee.toFixed(2),
              total_price: totalPrice.toFixed(2), // Must be passed verbatim to checkout (Rule 3)
            },
            notice: 'Playbook Rule 3: Pass this total_price verbatim to checkout. Confirm with user before mutating.',
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Playbook Tool 5: get_activities
 * Playbook Rule 5: Personalize with get_activities(past) - prefer known favourites over cold search.
 */
export async function handleGetActivities(params: GetActivitiesParams): Promise<McpToolResult> {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            success: true,
            type: params.type || 'past',
            activities: [
              {
                id: 'ACT-9821',
                service: 'Careem Rides',
                title: 'Ride to DIFC Gate Village',
                date: 'Yesterday, 8:45 PM',
                amount_aed: 68.50,
                status: 'Completed',
                split_ready: true,
              },
              {
                id: 'ACT-9819',
                service: 'Careem Food',
                title: 'Al Safadi Lebanese Restaurant',
                date: 'Nov 12, 1:15 PM',
                amount_aed: 229.00,
                status: 'Delivered',
                split_ready: true,
              },
              {
                id: 'ACT-9804',
                service: 'Careem Quik',
                title: 'Weekly Flatmate Groceries',
                date: 'Nov 10, 6:30 PM',
                amount_aed: 117.00,
                status: 'Delivered',
                split_ready: true,
              },
            ],
            favourites: [
              'Al Safadi DIFC (Ordered 4 times)',
              'Careem Comfort: Marina -> DIFC (Taken 12 times)',
            ],
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Tool 6: Split Careem Ride Fare among passengers with integer minor units
 */
export async function handleCareemRideSplit(params: CareemRideSplitParams): Promise<McpToolResult> {
  const fare = params.totalFareAed ?? 68.50; // Typical Careem Comfort Dubai ride (e.g. Marina to DIFC)
  const riders = params.riderNames && params.riderNames.length > 0
    ? params.riderNames
    : ['Manan', 'Sarah', 'Rahul'];

  const fareMinor = Math.round(fare * 100);
  const baseShareMinor = Math.floor(fareMinor / riders.length);
  const remainderFils = fareMinor % riders.length;

  const splits = riders.map((name, index) => {
    // Zero-loss fils remainder distributed to first riders
    const shareMinor = baseShareMinor + (index < remainderFils ? 1 : 0);
    return {
      member: name,
      share_aed: (shareMinor / 100).toFixed(2),
      share_minor: shareMinor,
    };
  });

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            success: true,
            provider: 'Careem MCP Rides',
            endpoint: 'https://mcp.careemapis.com/mcp',
            service: 'Careem Comfort',
            pickup: params.pickup || 'Dubai Marina, Silverene Tower',
            dropoff: params.dropoff || 'Gate Village, DIFC',
            total_fare_aed: fare.toFixed(2),
            riders_count: riders.length,
            splits,
            zero_loss_verified: true,
            careem_pay_deeplink: `careem://pay/split?amount=${fare}&ref=payd-ride-split`,
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Tool 7: Import Careem Food order into Payd Tap-to-Claim bill splitting
 */
export async function handleCareemFoodImport(params: CareemFoodOrderParams): Promise<McpToolResult> {
  const restaurant = params.restaurantName || 'Al Safadi DIFC';
  const defaultItems = [
    { name: 'Mixed Grill Platter (Large)', priceAed: 125.0, quantity: 1 },
    { name: 'Hummus Beiruty & Fresh Bread', priceAed: 28.0, quantity: 2 },
    { name: 'Fattoush Salad with Pomegranate', priceAed: 32.0, quantity: 1 },
    { name: 'Fresh Mint Lemonade', priceAed: 24.0, quantity: 3 },
  ];

  const items = params.items && params.items.length > 0 ? params.items : defaultItems;
  const subtotal = items.reduce((sum, item) => sum + item.priceAed * item.quantity, 0);
  const vatAed = params.vatAed ?? +(subtotal * 0.05).toFixed(2);
  const deliveryFee = params.deliveryFeeAed ?? 7.0;
  const totalBillAed = subtotal + vatAed + deliveryFee;

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            success: true,
            provider: 'Careem MCP Food',
            endpoint: 'https://mcp.careemapis.com/mcp',
            restaurant,
            order_id: params.orderId || 'CR-FOOD-92841-DXB',
            items: items.map((it, idx) => ({
              id: `item-${idx + 1}`,
              name: it.name,
              quantity: it.quantity,
              unit_price_aed: it.priceAed.toFixed(2),
              line_total_aed: (it.priceAed * it.quantity).toFixed(2),
              claimable: true,
            })),
            breakdown: {
              subtotal_aed: subtotal.toFixed(2),
              uae_vat_5_pct: vatAed.toFixed(2),
              delivery_fee_aed: deliveryFee.toFixed(2),
              total_aed: totalBillAed.toFixed(2),
            },
            status: 'Ready for Tap-to-Claim splitting in Payd',
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Tool 8: Import Careem Quik Groceries basket
 */
export async function handleCareemQuikBasket(params: CareemQuikBasketParams): Promise<McpToolResult> {
  const store = params.storeName || 'Careem Quik Marina Central';
  const group = params.groupName || 'Dubai Marina Flatmates';

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            success: true,
            provider: 'Careem MCP Quik (Groceries)',
            endpoint: 'https://mcp.careemapis.com/mcp',
            store,
            group,
            basket_id: params.basketId || 'QK-BASKET-77312',
            delivery_eta: '15-20 mins',
            items: [
              { name: 'Almarai Fresh Milk Full Fat 2L', qty: 2, price_aed: 13.50 },
              { name: 'Avocados Hass Mexico (Pack of 4)', qty: 1, price_aed: 18.00 },
              { name: 'Lurpak Slightly Salted Butter 400g', qty: 1, price_aed: 24.50 },
              { name: 'Nespresso Original Capsules (10pk)', qty: 2, price_aed: 42.00 },
              { name: 'Mai Dubai Water 1.5L (Case of 6)', qty: 2, price_aed: 19.00 },
            ],
            total_basket_aed: '117.00',
            split_recommendation: 'Equal split across 3 flatmates = AED 39.00 each',
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Tool 9: Direct instant settlement via Careem Pay / Aani
 */
export async function handleCareemPaySettle(params: CareemPaySettleParams): Promise<McpToolResult> {
  const phone = params.recipientPhone || '+971501234567';
  const amount = params.amountAed || 120.0;
  const qrData = `aani://pay?recipient=${encodeURIComponent(phone)}&amount=${amount.toFixed(2)}&currency=AED&ref=payd-settle`;

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            success: true,
            provider: 'Careem MCP Pay',
            endpoint: 'https://mcp.careemapis.com/mcp',
            settlement_method: 'Careem Pay / Aani UAE Instant Protocol',
            recipient_phone: phone,
            amount_aed: amount.toFixed(2),
            currency: 'AED',
            status: 'INSTANT_AUTHORIZED',
            transaction_ref: `CP-AANI-${Date.now().toString(36).toUpperCase()}`,
            aani_qr_payload: qrData,
            careem_pay_deeplink: `careem://pay/transfer?phone=${encodeURIComponent(phone)}&amount=${amount.toFixed(2)}`,
            clearing_time: 'Immediate (< 2 seconds)',
          },
          null,
          2
        ),
      },
    ],
  };
}
