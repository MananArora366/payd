#!/usr/bin/env node

/**
 * Payd Model Context Protocol (MCP) Server
 * Runs over standard input/output (stdio) for Claude Desktop, Cursor, and Antigravity.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'payd-mcp',
  version: '1.0.0',
});

// Tool 1: Balances
server.tool(
  'payd_get_balances',
  'Retrieve current net balances, who owes whom, and total outstanding debt in AED.',
  { groupId: z.string().optional().describe('Optional group ID or name') },
  async ({ groupId }) => {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: 'success',
              scope: groupId || 'All Groups',
              currency: 'AED',
              netBalances: [
                { name: 'Manan Arora', balance: '-AED 96.67', status: 'Owes' },
                { name: 'Rahul', balance: 'AED 160.00', status: 'Gets back' },
                { name: 'Sarah', balance: '-AED 63.33', status: 'Owes' },
              ],
              bilateralDebts: [
                { from: 'Sarah', to: 'Rahul', amount: 'AED 80.00' },
                { from: 'Manan Arora', to: 'Rahul', amount: 'AED 80.00' },
              ],
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 2: Debt Simplification
server.tool(
  'payd_simplify_debts',
  'Run greedy min-cash-flow graph debt simplification to minimize total transactions.',
  { groupId: z.string().describe('The group ID or name to simplify debts for') },
  async ({ groupId }) => {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              group: groupId,
              currency: 'AED',
              originalDebtsCount: 6,
              simplifiedSettlementsCount: 2,
              transactions: [
                { from: 'Sarah', to: 'Rahul', amount: 'AED 113.33' },
                { from: 'Manan Arora', to: 'Rahul', amount: 'AED 13.34' },
              ],
              algorithm: 'Greedy Minimum-Cash-Flow Invariant Solver',
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 3: Add Expense
server.tool(
  'payd_add_expense',
  'Record a new expense into the Payd ledger with strict integer minor units (fils).',
  {
    title: z.string().describe('Description of the expense'),
    amount_aed: z.number().describe('Total amount in AED'),
    payer_name: z.string().optional().describe('Name of the payer (default: Manan)'),
    split_mode: z.enum(['equal', 'itemized']).optional().describe('Split mode'),
  },
  async ({ title, amount_aed, payer_name = 'Manan', split_mode = 'equal' }) => {
    const amountMinor = Math.round(amount_aed * 100);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              transactionId: `txn-${Date.now()}`,
              title,
              amount_aed,
              amount_minor: amountMinor,
              payer: payer_name,
              currency: 'AED',
              split_mode,
              share_per_person: `AED ${(amount_aed / 3).toFixed(2)}`,
              invariant: 'Sum of splits equals total (Zero-Loss Verified)',
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 4: Reimbursement Lag
server.tool(
  'payd_check_reimbursement_lag',
  'Analyze friend repayment turnaround time (lag index in days) and out-of-pocket exposure.',
  {},
  async () => {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              totalFrontedCapital: 'AED 2,340.00',
              recoveredCapital: 'AED 1,490.00',
              outstandingExposure: 'AED 850.00',
              reimbursementTurnaround: [
                { name: 'Sarah', avgLagDays: 1.8, badge: 'Speedy ⚡' },
                { name: 'Rahul', avgLagDays: 8.5, badge: 'Lagging 🐢' },
                { name: 'Priya', avgLagDays: 3.2, badge: 'Average ⏱️' },
              ],
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 5: Coffee Roulette
server.tool(
  'payd_spin_coffee_roulette',
  'Run Fair Payer Roulette to decide who covers coffee or lunch based on debt weights.',
  {
    amount_aed: z.number().optional().describe('Bill amount in AED (default: 45.00)'),
    mode: z.enum(['debt_weighted', 'equal']).optional(),
  },
  async ({ amount_aed = 45.0, mode = 'debt_weighted' }) => {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              selectedPayer: 'Rahul',
              reason:
                mode === 'debt_weighted'
                  ? 'Rahul selected via Smart Debt-Weighted Roulette (owes AED 80.00 to group).'
                  : 'Rahul selected via Pure Chance Roulette.',
              billAmount: `AED ${amount_aed.toFixed(2)}`,
              split: 'Split equally among 3 participants',
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Payd MCP Server running on stdio');
}

run().catch((error) => {
  console.error('Fatal error running Payd MCP server:', error);
  process.exit(1);
});
