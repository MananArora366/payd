/**
 * Single source of truth for the Payd MCP tool set: name, description, JSON
 * input schema (advertised in tools/list AND enforced before every call) and
 * handler. Used by the HTTP endpoint (src/app/api/mcp/route.ts); the stdio
 * server (scripts/mcp-server.mjs) proxies to that endpoint, so both expose
 * exactly the same tools.
 */

import { JsonSchema, validateArgs } from './validate';
import {
  McpToolResult,
  toolError,
  handleGetBalances,
  handleSimplifyDebts,
  handleAddExpense,
  handleCheckReimbursementLag,
  handleSpinCoffeeRoulette,
  handleTriggerRecurringSplit,
} from './paydTools';
import {
  handleUserInfo,
  handleRequestRide,
  handleCreateRide,
  handleCartGetBasketPrice,
  handleGetActivities,
  handleCareemRideSplit,
  handleCareemFoodImport,
  handleCareemQuikBasket,
  handleCareemPaySettle,
} from './careemTools';
import { calculateNetBalances, formatMinorUnits } from '@/lib/ledger';
import {
  INITIAL_USERS,
  INITIAL_GROUPS,
  INITIAL_GROUP_MEMBERS,
  INITIAL_TRANSACTIONS,
  INITIAL_SPLITS,
  INITIAL_SETTLEMENTS,
} from '@/lib/store/initialData';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema & { type: 'object' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any) => McpToolResult | Promise<McpToolResult>;
}

const str = (description: string, extra: Partial<JsonSchema> = {}): JsonSchema => ({ type: 'string', description, ...extra });
const nonEmpty = (description: string) => str(description, { minLength: 1, maxLength: 200 });
const names = (description: string): JsonSchema => ({
  type: 'array',
  description,
  items: { type: 'string', minLength: 1, maxLength: 100 },
  maxItems: 50,
});
const positiveAed = (description: string): JsonSchema => ({ type: 'number', exclusiveMinimum: 0, maximum: 1_000_000_000, description });
const obj = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema & { type: 'object' } => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

export const MCP_TOOLS: McpToolDefinition[] = [
  // ─── Careem Official Agent Playbook Tools (sandbox mock) ────────────────
  {
    name: 'user_info',
    description: 'Rule 1: Always pass coordinates. Retrieve saved addresses (Home/Work), Careem Pay balance. Sandbox mock data.',
    inputSchema: obj({
      includeSavedLocations: { type: 'boolean', description: 'Include saved home/work coordinates (default true)' },
      includePaymentMethods: { type: 'boolean' },
    }),
    handler: (a) => handleUserInfo(a),
  },
  {
    name: 'request_ride',
    description:
      'Rule 2: Request a ride quote with coordinates. Returns the fare for ride_type and a signed context_blob that expires in 2 minutes. Sandbox mock data.',
    inputSchema: obj({
      pickup_latitude: { type: 'number', minimum: -90, maximum: 90 },
      pickup_longitude: { type: 'number', minimum: -180, maximum: 180 },
      dropoff_latitude: { type: 'number', minimum: -90, maximum: 90 },
      dropoff_longitude: { type: 'number', minimum: -180, maximum: 180 },
      destination_name: str('Destination landmark name', { maxLength: 200 }),
      ride_type: { type: 'string', enum: ['comfort', 'eco', 'hala_taxi', 'executive'], description: 'Default comfort' },
    }),
    handler: (a) => handleRequestRide(a),
  },
  {
    name: 'create_ride',
    description:
      'Rule 2 & Golden Rule: Mutating. Books the ride quoted by request_ride. Pass context_blob verbatim; set confirmed_by_user to true only after the user confirmed the fare. Each quote can be booked once. Sandbox mock: nothing is really booked.',
    inputSchema: obj(
      {
        context_blob: str('Signed context_blob returned by request_ride, verbatim', { minLength: 1, maxLength: 4000 }),
        confirmed_by_user: { type: 'boolean', description: 'Must be true: the user explicitly confirmed this booking' },
        split_with_riders: names('Friends (besides you) to split the fare with'),
      },
      ['context_blob', 'confirmed_by_user']
    ),
    handler: (a) => handleCreateRide(a),
  },
  {
    name: 'cart_get_basket_price',
    description:
      'Rule 3: Never checkout blind. Prices a basket in fils: subtotal, promo (CAREEM26 = AED 20, capped at subtotal), AED 7 delivery fee, and UAE 5% VAT on (subtotal - promo + delivery). Pass total_price verbatim to checkout. Sandbox mock.',
    inputSchema: obj({
      items: {
        type: 'array',
        description: 'Basket lines (defaults to a sample Al Safadi order)',
        maxItems: 100,
        items: obj(
          {
            name: nonEmpty('Item name'),
            price_aed: { type: 'number', minimum: 0, maximum: 1_000_000, description: 'Unit price in AED' },
            quantity: { type: 'integer', minimum: 1, maximum: 1000 },
          },
          ['name', 'price_aed', 'quantity']
        ),
      },
      promo_code: str('Promo code, e.g. CAREEM26', { maxLength: 50 }),
      delivery_address: str('Delivery address', { maxLength: 300 }),
    }),
    handler: (a) => handleCartGetBasketPrice(a),
  },
  {
    name: 'get_activities',
    description: 'Rule 5: Personalize with past activities and user favorites over cold search. "upcoming" lists scheduled rides/orders. Sandbox mock.',
    inputSchema: obj(
      {
        type: { type: 'string', enum: ['past', 'upcoming'] },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      ['type']
    ),
    handler: (a) => handleGetActivities(a),
  },

  // ─── Careem Super App Extended Actions (sandbox mock) ───────────────────
  {
    name: 'careem_rides_split_fare',
    description:
      'Split a Careem ride fare (VAT-inclusive; the 5% VAT portion is reported) into zero-loss fils shares across riders. Does not save anything.',
    inputSchema: obj({
      rideId: str('Careem ride ID', { maxLength: 100 }),
      pickup: str('Pickup location', { maxLength: 200 }),
      dropoff: str('Dropoff location', { maxLength: 200 }),
      totalFareAed: positiveAed('Total ride fare in AED (default 68.50)'),
      riderNames: names('Passengers sharing the ride'),
    }),
    handler: (a) => handleCareemRideSplit(a),
  },
  {
    name: 'careem_food_import_order',
    description:
      'Import Careem Food order line items, delivery fee and UAE 5% VAT (on subtotal + delivery unless vatAed is given) for Tap-to-Claim splitting. Does not save anything.',
    inputSchema: obj({
      restaurantName: str('Restaurant name', { maxLength: 200 }),
      orderId: str('Careem Food order ID', { maxLength: 100 }),
      items: {
        type: 'array',
        maxItems: 100,
        items: obj(
          {
            name: nonEmpty('Item name'),
            priceAed: positiveAed('Unit price in AED'),
            quantity: { type: 'integer', minimum: 1, maximum: 1000 },
          },
          ['name', 'priceAed', 'quantity']
        ),
      },
      vatAed: { type: 'number', minimum: 0, maximum: 1_000_000, description: 'VAT in AED, if known' },
      deliveryFeeAed: { type: 'number', minimum: 0, maximum: 10_000, description: 'Delivery fee in AED (default 7.00)' },
    }),
    handler: (a) => handleCareemFoodImport(a),
  },
  {
    name: 'careem_quik_basket_split',
    description: 'Import a Careem Quik grocery basket (total = Σ qty × price) and suggest an equal split across a Payd group. Does not save anything.',
    inputSchema: obj({
      basketId: str('Quik basket ID', { maxLength: 100 }),
      storeName: str('Careem Quik dark store', { maxLength: 200 }),
      groupName: str('Payd group name or ID (default Dubai Flatmates)', { maxLength: 200 }),
    }),
    handler: (a) => handleCareemQuikBasket(a),
  },
  {
    name: 'careem_pay_settle_debt',
    description:
      'Golden Rule: Mutating. Peer-to-peer settlement via Careem Pay. Amount in integer fils (100 fils = AED 1). Requires confirmed_by_user: true after the user confirmed recipient and amount. Sandbox mock: no money moves.',
    inputSchema: obj(
      {
        recipientTag: str('Careem Pay tag, e.g. @rahul.careem', { maxLength: 100 }),
        recipientPhone: str('UAE mobile number (+971...), if no tag', { maxLength: 30 }),
        recipientName: str('Recipient display name', { maxLength: 100 }),
        amountMinor: { type: 'integer', minimum: 1, maximum: 100_000_000_000, description: 'Amount in fils' },
        amountAed: positiveAed('Amount in AED, used only if amountMinor is absent'),
        note: str('Settlement note', { maxLength: 300 }),
        confirmed_by_user: { type: 'boolean', description: 'Must be true: the user explicitly confirmed this payment' },
      }
    ),
    handler: (a) => handleCareemPaySettle(a),
  },

  // ─── Payd Social Finance Ledger Tools (demo seed ledger) ────────────────
  {
    name: 'payd_get_balances',
    description: 'Net balances, who owes whom, and total outstanding debt in AED, from the Payd demo ledger.',
    inputSchema: obj({ groupId: str('Optional group ID or exact group name', { maxLength: 200 }) }),
    handler: (a) => handleGetBalances(a.groupId),
  },
  {
    name: 'payd_simplify_debts',
    description: 'Minimum-transfer debt simplification for a group in the Payd demo ledger.',
    inputSchema: obj({ groupId: nonEmpty('Group ID or exact group name') }, ['groupId']),
    handler: (a) => handleSimplifyDebts(a.groupId),
  },
  {
    name: 'payd_add_expense',
    description:
      'Prepare an expense draft in integer fils with a zero-loss equal split. People are matched by exact full or first name. The server cannot write the user\'s ledger (it lives in their browser), so the result is a draft (status "draft_created") the user records in the Payd app.',
    inputSchema: obj(
      {
        title: nonEmpty('Description of the expense'),
        amount_aed: positiveAed('Total amount in AED (max 2 decimals)'),
        payer_name: str('Who paid (default: you, Manan Arora)', { minLength: 1, maxLength: 100 }),
        group_name: str('Group name or ID (participants must be members)', { maxLength: 200 }),
        participant_names: names('People to split with (default: whole group, or just the payer if no group)'),
      },
      ['title', 'amount_aed']
    ),
    handler: (a) => handleAddExpense(a),
  },
  {
    name: 'payd_check_reimbursement_lag',
    description: 'Friend repayment turnaround (days from expense to repayment) and outstanding exposure, derived from the Payd demo ledger.',
    inputSchema: obj({}),
    handler: () => handleCheckReimbursementLag(),
  },
  {
    name: 'payd_spin_coffee_roulette',
    description:
      'Fair Payer Roulette: random draw of who covers coffee/lunch, optionally weighted by how much each member owes. Does not record the expense.',
    inputSchema: obj({
      amount_aed: positiveAed('Bill amount in AED (default 45.00)'),
      mode: { type: 'string', enum: ['debt_weighted', 'equal'] },
      group_name: str('Group name or ID (default Dubai Flatmates)', { maxLength: 200 }),
      participant_names: names('Subset of group members to include'),
    }),
    handler: (a) => handleSpinCoffeeRoulette(a),
  },
  {
    name: 'payd_trigger_recurring_split',
    description:
      'Preview the split for a named recurring bill (e.g. "Du 5G", "DEWA"). Errors if no single bill matches. Not posted: the user posts it from Payd > Recurring.',
    inputSchema: obj({ subscription_name: nonEmpty('Recurring bill title (or unique part of it)') }, ['subscription_name']),
    handler: (a) => handleTriggerRecurringSplit(a.subscription_name),
  },
];

const TOOL_INDEX = new Map(MCP_TOOLS.map((t) => [t.name, t]));

/** Public manifest entries (no handlers). */
export function listTools() {
  return MCP_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

export class McpUnknownToolError extends Error {}

/**
 * Validates `args` against the tool's schema and runs it. Invalid arguments
 * produce a tool result with isError:true (so the model can correct itself);
 * an unknown tool throws McpUnknownToolError (mapped to JSON-RPC -32602).
 */
export async function callTool(name: string, args: unknown): Promise<McpToolResult> {
  const tool = TOOL_INDEX.get(name);
  if (!tool) throw new McpUnknownToolError(`Unknown tool: ${name}`);
  const input = args === undefined || args === null ? {} : args;
  const problems = validateArgs(tool.inputSchema, input);
  if (problems.length) return toolError(`Invalid arguments for ${name}: ${problems.join('; ')}`, { problems });
  return tool.handler(input);
}

// ─── Resources ─────────────────────────────────────────────────────────────

export const MCP_RESOURCES = [
  { uri: 'payd://ledger/summary', name: 'Payd Active Financial Ledger Summary', mimeType: 'application/json' },
  { uri: 'payd://groups/roster', name: 'Payd User & Groups Roster', mimeType: 'application/json' },
];

/** Returns the resource contents, or null for an unknown URI. */
export function readResource(uri: string): { uri: string; mimeType: string; text: string } | null {
  if (uri === 'payd://ledger/summary') {
    const balances = JSON.parse(handleGetBalances().content[0].text);
    return { uri, mimeType: 'application/json', text: JSON.stringify(balances, null, 2) };
  }
  if (uri === 'payd://groups/roster') {
    const roster = {
      users: INITIAL_USERS.map((u) => ({ id: u.id, name: u.name })),
      groups: INITIAL_GROUPS.map((g) => {
        const txns = INITIAL_TRANSACTIONS.filter((t) => t.group_id === g.id && !t.deleted_at);
        const ids = new Set(txns.map((t) => t.id));
        const net = calculateNetBalances(
          txns,
          INITIAL_SPLITS.filter((s) => ids.has(s.transaction_id)),
          INITIAL_SETTLEMENTS.filter((s) => s.group_id === g.id)
        );
        return {
          id: g.id,
          name: g.name,
          currency: 'AED',
          members: INITIAL_GROUP_MEMBERS.filter((m) => m.group_id === g.id).map((m) => ({
            name: INITIAL_USERS.find((u) => u.id === m.user_id)?.name || m.user_id,
            role: m.role,
            balanceFormatted: formatMinorUnits(net[m.user_id] || 0, 'AED'),
          })),
        };
      }),
    };
    return { uri, mimeType: 'application/json', text: JSON.stringify(roster, null, 2) };
  }
  return null;
}
