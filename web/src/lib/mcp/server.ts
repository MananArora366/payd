import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
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

export function createPaydMcpServer(): McpServer {
  const server = new McpServer({
    name: 'payd-careem-mcp',
    version: '1.2.0',
  });

  // ─── Careem Official Agent Playbook Tools (builders.careem.com) ─────────
  server.tool(
    'user_info',
    'Playbook Rule 1: Retrieve user coordinates, saved addresses (home/work), Careem Pay wallet balance, and preferences.',
    {
      includeSavedLocations: z.boolean().optional().describe('Include saved home/work lat-long coordinates'),
    },
    async (params) => handleUserInfo(params)
  );

  server.tool(
    'request_ride',
    'Playbook Rule 2: Request ride options with coordinates. Returns quotes and critical expiring context_blob.',
    {
      pickup_latitude: z.number().optional().describe('Pickup latitude (default: user home)'),
      pickup_longitude: z.number().optional().describe('Pickup longitude'),
      dropoff_latitude: z.number().optional().describe('Dropoff latitude (default: user work)'),
      dropoff_longitude: z.number().optional().describe('Dropoff longitude'),
      destination_name: z.string().optional().describe('Destination landmark name'),
    },
    async (params) => handleRequestRide(params)
  );

  server.tool(
    'create_ride',
    'Playbook Rule 2 & Golden Rule: Mutating tool to confirm and dispatch Careem ride using verbatim context_blob.',
    {
      context_blob: z.string().describe('Base64 context_blob returned from request_ride'),
      confirmed_by_user: z.boolean().describe('Golden Rule: User must confirm before mutating money/state'),
      split_with_riders: z.array(z.string()).optional().describe('Friend names to automatically split fare with in Payd'),
    },
    async (params) => handleCreateRide(params)
  );

  server.tool(
    'cart_get_basket_price',
    'Playbook Rule 3: Never checkout blind. Calculate itemized cart total, UAE 5% VAT, and promo before checkout.',
    {
      promo_code: z.string().optional().describe('Promo code to apply (e.g. CAREEM26)'),
      delivery_address: z.string().optional().describe('Delivery location address'),
    },
    async (params) => handleCartGetBasketPrice({ items: [], ...params })
  );

  server.tool(
    'get_activities',
    'Playbook Rule 5: Personalize with past activities and user favorites over cold search.',
    {
      type: z.enum(['past', 'upcoming']).describe('Filter activity history'),
    },
    async (params) => handleGetActivities(params)
  );

  // ─── Careem Super App Extended Actions ──────────────────────────────────
  server.tool(
    'careem_rides_split_fare',
    'Fetch Careem Ride fare details (pickup, dropoff, surge, VAT) and calculate zero-loss passenger splits into Payd.',
    {
      pickup: z.string().optional().describe('Pickup location (e.g. Dubai Marina)'),
      dropoff: z.string().optional().describe('Dropoff location (e.g. Gate Village DIFC)'),
      totalFareAed: z.number().optional().describe('Total ride fare in AED'),
      riderNames: z.array(z.string()).optional().describe('List of passengers sharing the ride'),
    },
    async (params) => handleCareemRideSplit(params)
  );

  server.tool(
    'careem_food_import_order',
    'Import Careem Food order line items, UAE 5% VAT, and delivery fee into Payd Tap-to-Claim bill splitting.',
    {
      restaurantName: z.string().optional().describe('Name of Careem restaurant partner'),
      orderId: z.string().optional().describe('Careem Food Order ID'),
    },
    async (params) => handleCareemFoodImport(params)
  );

  server.tool(
    'careem_quik_basket_split',
    'Import Careem Quik groceries cart items for instant distribution among shared flatmates.',
    {
      storeName: z.string().optional().describe('Careem Quik micro-fulfillment dark store'),
      groupName: z.string().optional().describe('Target flat or trip group in Payd'),
    },
    async (params) => handleCareemQuikBasket(params)
  );

  server.tool(
    'careem_pay_settle_debt',
    'Execute immediate peer-to-peer settlement via Careem Pay / Aani instant payment rail.',
    {
      recipientPhone: z.string().describe('UAE mobile number of recipient (+971...)'),
      amountAed: z.number().describe('Amount in AED to settle'),
      note: z.string().optional().describe('Settlement description'),
    },
    async (params) => handleCareemPaySettle(params)
  );

  // ─── Payd Social Finance Ledger MCP Tools ───────────────────────────────
  server.tool(
    'payd_get_balances',
    'Retrieve current net balances, who owes whom, and total outstanding debt in AED.',
    { groupId: z.string().optional().describe('Optional group ID or name to filter balances') },
    async ({ groupId }) => handleGetBalances(groupId)
  );

  server.tool(
    'payd_simplify_debts',
    'Execute greedy min-cash-flow graph debt simplification algorithm for a group to minimize total settlement transactions.',
    { groupId: z.string().describe('The group ID or name to simplify debts for') },
    async ({ groupId }) => handleSimplifyDebts(groupId)
  );

  server.tool(
    'payd_add_expense',
    'Record a new expense into the Payd ledger with strict integer minor units (fils) and zero-loss split invariants.',
    {
      title: z.string().describe('Description of the expense (e.g. Dinner at Al Safadi)'),
      amount_aed: z.number().describe('Total amount in AED (e.g. 150.00)'),
      payer_name: z.string().optional().describe('Name of the person who fronted the payment (default: Manan)'),
      group_name: z.string().optional().describe('Group to assign this expense to (e.g. Dubai Marina Flatmates)'),
      participant_names: z.array(z.string()).optional().describe('List of member names to split with'),
    },
    async (params) => handleAddExpense(params)
  );

  server.tool(
    'payd_check_reimbursement_lag',
    'Analyze friend repayment turnaround time (lag index in days) and identify high-risk out-of-pocket exposures.',
    {},
    async () => handleCheckReimbursementLag()
  );

  server.tool(
    'payd_spin_coffee_roulette',
    'Run Fair Payer Roulette to fairly decide who covers coffee or lunch based on current group debt weights.',
    {
      amount_aed: z.number().optional().describe('Bill amount in AED (default: 45.00)'),
      mode: z.enum(['debt_weighted', 'equal']).optional().describe('debt_weighted gives higher chance to who owes most'),
    },
    async (params) => handleSpinCoffeeRoulette(params)
  );

  server.tool(
    'payd_trigger_recurring_split',
    'Trigger an automated monthly recurring subscription split (e.g., Du 5G Wi-Fi, DEWA utilities, Housekeeping).',
    {
      subscription_name: z.string().optional().describe('Name of the subscription (e.g. Du 5G Wi-Fi)'),
    },
    async ({ subscription_name }) => handleTriggerRecurringSplit(subscription_name)
  );

  return server;
}
