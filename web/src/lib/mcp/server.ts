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

export function createPaydMcpServer(): McpServer {
  const server = new McpServer({
    name: 'payd-mcp',
    version: '1.0.0',
  });

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
