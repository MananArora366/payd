import { NextRequest, NextResponse } from 'next/server';
import {
  handleGetBalances,
  handleSimplifyDebts,
  handleAddExpense,
  handleCheckReimbursementLag,
  handleSpinCoffeeRoulette,
  handleTriggerRecurringSplit,
} from '@/lib/mcp/paydTools';
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
} from '@/lib/mcp/careemTools';

const MCP_TOOLS_MANIFEST = [
  // ─── Careem Official Agent Playbook Tools ──────────────────────────────
  {
    name: 'user_info',
    description: 'Rule 1: Always pass coordinates. Retrieve saved addresses (Home/Work), Careem Pay balance.',
    inputSchema: {
      type: 'object',
      properties: {
        includeSavedLocations: { type: 'boolean' },
      },
    },
  },
  {
    name: 'request_ride',
    description: 'Rule 2: Request ride options with coordinates. Returns quotes and critical expiring context_blob.',
    inputSchema: {
      type: 'object',
      properties: {
        pickup_latitude: { type: 'number' },
        pickup_longitude: { type: 'number' },
        dropoff_latitude: { type: 'number' },
        dropoff_longitude: { type: 'number' },
        destination_name: { type: 'string' },
      },
    },
  },
  {
    name: 'create_ride',
    description: 'Rule 2 & Golden Rule: Mutating tool to confirm and dispatch Careem ride using verbatim context_blob.',
    inputSchema: {
      type: 'object',
      properties: {
        context_blob: { type: 'string' },
        confirmed_by_user: { type: 'boolean' },
        split_with_riders: { type: 'array', items: { type: 'string' } },
      },
      required: ['context_blob', 'confirmed_by_user'],
    },
  },
  {
    name: 'cart_get_basket_price',
    description: 'Rule 3: Never checkout blind. Compute total, UAE 5% VAT, and pass total_price verbatim to checkout.',
    inputSchema: {
      type: 'object',
      properties: {
        promo_code: { type: 'string' },
        delivery_address: { type: 'string' },
      },
    },
  },
  {
    name: 'get_activities',
    description: 'Rule 5: Personalize with past activities and user favorites over cold search.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['past', 'upcoming'] },
      },
      required: ['type'],
    },
  },

  // ─── Careem Super App Extended Actions ──────────────────────────────────
  {
    name: 'careem_rides_split_fare',
    description: 'Fetch Careem Ride fare details (pickup, dropoff, VAT) and calculate zero-loss splits across riders.',
    inputSchema: {
      type: 'object',
      properties: {
        pickup: { type: 'string' },
        dropoff: { type: 'string' },
        totalFareAed: { type: 'number' },
        riderNames: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'careem_food_import_order',
    description: 'Import Careem Food order line items, UAE 5% VAT, and delivery fee into Tap-to-Claim splitting.',
    inputSchema: {
      type: 'object',
      properties: {
        restaurantName: { type: 'string' },
        orderId: { type: 'string' },
      },
    },
  },
  {
    name: 'careem_quik_basket_split',
    description: 'Import Careem Quik groceries cart items for instant distribution among shared flatmates.',
    inputSchema: {
      type: 'object',
      properties: {
        storeName: { type: 'string' },
        groupName: { type: 'string' },
      },
    },
  },
  {
    name: 'careem_pay_settle_debt',
    description: 'Execute immediate peer-to-peer settlement via Careem Pay / Aani instant payment rail.',
    inputSchema: {
      type: 'object',
      properties: {
        recipientPhone: { type: 'string' },
        amountAed: { type: 'number' },
        note: { type: 'string' },
      },
      required: ['recipientPhone', 'amountAed'],
    },
  },

  // ─── Payd Social Finance Ledger Tools ──────────────────────────────────
  {
    name: 'payd_get_balances',
    description: 'Retrieve current net balances, who owes whom, and total outstanding debt in AED.',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'Optional group ID or name' },
      },
    },
  },
  {
    name: 'payd_simplify_debts',
    description: 'Execute greedy min-cash-flow graph debt simplification algorithm for a group.',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'Group ID or name to simplify debts for' },
      },
      required: ['groupId'],
    },
  },
  {
    name: 'payd_add_expense',
    description: 'Record a new expense into the Payd ledger with strict integer minor units (fils).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Description of the expense' },
        amount_aed: { type: 'number', description: 'Total amount in AED' },
        payer_name: { type: 'string', description: 'Name of the person who paid' },
        group_name: { type: 'string', description: 'Group to assign to' },
        participant_names: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'amount_aed'],
    },
  },
  {
    name: 'payd_check_reimbursement_lag',
    description: 'Analyze friend repayment turnaround time (lag index in days) and out-of-pocket exposure.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'payd_spin_coffee_roulette',
    description: 'Run Fair Payer Roulette to decide who covers coffee or lunch based on debt weights.',
    inputSchema: {
      type: 'object',
      properties: {
        amount_aed: { type: 'number', description: 'Bill amount in AED (default 45.00)' },
        mode: { type: 'string', enum: ['debt_weighted', 'equal'] },
      },
    },
  },
  {
    name: 'payd_trigger_recurring_split',
    description: 'Trigger an automated monthly recurring subscription split (Du Wi-Fi, DEWA, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        subscription_name: { type: 'string', description: 'Subscription title' },
      },
    },
  },
];

export async function GET() {
  return NextResponse.json({
    status: 'online',
    protocol: 'Model Context Protocol (MCP)',
    specVersion: '2024-11-05',
    server: {
      name: 'payd-mcp',
      version: '1.0.0',
      description: 'Model Context Protocol server for Payd Social Financial Ledger & Tracker',
    },
    capabilities: {
      tools: MCP_TOOLS_MANIFEST.length,
      resources: 2,
    },
    tools: MCP_TOOLS_MANIFEST,
    endpoint: '/api/mcp',
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jsonrpc = '2.0', id = 1, method, params = {} } = body;

    // 1. Initialize
    if (method === 'initialize') {
      return NextResponse.json({
        jsonrpc,
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
          },
          serverInfo: {
            name: 'payd-mcp',
            version: '1.0.0',
          },
        },
      });
    }

    // 2. Ping
    if (method === 'ping') {
      return NextResponse.json({ jsonrpc, id, result: {} });
    }

    // 3. Tools List
    if (method === 'tools/list') {
      return NextResponse.json({
        jsonrpc,
        id,
        result: {
          tools: MCP_TOOLS_MANIFEST,
        },
      });
    }

    // 4. Tools Call
    if (method === 'tools/call') {
      const toolName = params.name;
      const args = params.arguments || {};

      let output;

      switch (toolName) {
        // ─── Careem Official Agent Playbook Tools ──────────────────────────
        case 'user_info':
          output = await handleUserInfo(args);
          break;
        case 'request_ride':
          output = await handleRequestRide(args);
          break;
        case 'create_ride':
          output = await handleCreateRide(args);
          break;
        case 'cart_get_basket_price':
          output = await handleCartGetBasketPrice(args);
          break;
        case 'get_activities':
          output = await handleGetActivities(args);
          break;

        // ─── Careem Super App Extended Actions ──────────────────────────────
        case 'careem_rides_split_fare':
          output = await handleCareemRideSplit(args);
          break;
        case 'careem_food_import_order':
          output = await handleCareemFoodImport(args);
          break;
        case 'careem_quik_basket_split':
          output = await handleCareemQuikBasket(args);
          break;
        case 'careem_pay_settle_debt':
          output = await handleCareemPaySettle(args);
          break;

        // ─── Payd Social Finance Ledger Tools ──────────────────────────────
        case 'payd_get_balances':
          output = handleGetBalances(args.groupId);
          break;
        case 'payd_simplify_debts':
          output = handleSimplifyDebts(args.groupId || 'Dubai Marina Flatmates');
          break;
        case 'payd_add_expense':
          output = handleAddExpense({
            title: args.title || 'Expense',
            amount_aed: args.amount_aed || 50,
            payer_name: args.payer_name,
            group_name: args.group_name,
            participant_names: args.participant_names,
          });
          break;
        case 'payd_check_reimbursement_lag':
          output = handleCheckReimbursementLag();
          break;
        case 'payd_spin_coffee_roulette':
          output = handleSpinCoffeeRoulette({
            amount_aed: args.amount_aed,
            mode: args.mode,
          });
          break;
        case 'payd_trigger_recurring_split':
          output = handleTriggerRecurringSplit(args.subscription_name);
          break;
        default:
          return NextResponse.json(
            {
              jsonrpc,
              id,
              error: {
                code: -32601,
                message: `Method not found: ${toolName}`,
              },
            },
            { status: 404 }
          );
      }

      return NextResponse.json({
        jsonrpc,
        id,
        result: output,
      });
    }

    // 5. Resources List
    if (method === 'resources/list') {
      return NextResponse.json({
        jsonrpc,
        id,
        result: {
          resources: [
            {
              uri: 'payd://ledger/summary',
              name: 'Payd Active Financial Ledger Summary',
              mimeType: 'application/json',
            },
            {
              uri: 'payd://groups/roster',
              name: 'Payd User & Groups Roster',
              mimeType: 'application/json',
            },
          ],
        },
      });
    }

    // Default: unknown method
    return NextResponse.json(
      {
        jsonrpc,
        id,
        error: {
          code: -32601,
          message: `Unknown MCP method: ${method}`,
        },
      },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: err.message || 'Parse error in JSON-RPC request',
        },
      },
      { status: 500 }
    );
  }
}
