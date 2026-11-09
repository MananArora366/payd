import { describe, it, expect } from 'vitest';
import {
  handleGetBalances,
  handleSimplifyDebts,
  handleAddExpense,
  handleCheckReimbursementLag,
  handleSpinCoffeeRoulette,
  handleTriggerRecurringSplit,
} from '@/lib/mcp/paydTools';

describe('MCP (Model Context Protocol) Tools Suite', () => {
  it('payd_get_balances returns valid JSON-RPC content with zero-sum net balances', () => {
    const res = handleGetBalances('Dubai Flatmates');
    expect(res.content).toBeDefined();
    expect(res.content.length).toBe(1);

    const data = JSON.parse(res.content[0].text);
    expect(data.currency).toBe('AED');
    expect(data.netBalances).toBeInstanceOf(Array);
    expect(data.netBalances.length).toBeGreaterThan(0);

    // Invariant check: Net balances sum to zero
    const sum = data.netBalances.reduce((acc: number, b: any) => acc + b.balanceMinor, 0);
    expect(sum).toBe(0);
  });

  it('payd_simplify_debts executes greedy min-cash-flow graph solver', () => {
    const res = handleSimplifyDebts('Dubai Flatmates');
    const data = JSON.parse(res.content[0].text);

    expect(data.group).toBeDefined();
    expect(data.transactions).toBeInstanceOf(Array);
    expect(data.simplifiedSettlementsCount).toBeLessThanOrEqual(data.originalDebtsCount);
  });

  it('payd_add_expense enforces strict integer fils minor units and zero-loss invariant', () => {
    const res = handleAddExpense({
      title: 'DIFC Dinner',
      amount_aed: 300.0,
      payer_name: 'Manan',
      group_name: 'Dubai Flatmates',
    });

    const data = JSON.parse(res.content[0].text);
    expect(data.success).toBe(true);
    expect(data.amountMinor).toBe(30000); // 300.00 AED
    expect(data.amountFormatted).toBe('AED 300.00');

    // Verify split sum equals total exactly
    const splitSum = data.splits.reduce((acc: number, s: any) => acc + s.shareMinor, 0);
    expect(splitSum).toBe(30000);
  });

  it('payd_check_reimbursement_lag computes friend turnaround metrics', () => {
    const res = handleCheckReimbursementLag();
    const data = JSON.parse(res.content[0].text);

    expect(data.totalFrontedCapitalFormatted).toBeDefined();
    expect(data.reimbursementTurnaround).toBeInstanceOf(Array);
    expect(data.reimbursementTurnaround.some((f: any) => f.tier === 'lagging')).toBe(true);
  });

  it('payd_spin_coffee_roulette returns calculated odds and payer decision', () => {
    const res = handleSpinCoffeeRoulette({ amount_aed: 55.0, mode: 'debt_weighted' });
    const data = JSON.parse(res.content[0].text);

    expect(data.selectedPayer).toBeDefined();
    expect(data.participantsOdds).toBeInstanceOf(Array);
    expect(data.billAmountFormatted).toBe('AED 55.00');
  });

  it('payd_trigger_recurring_split posts shared utility bill split', () => {
    const res = handleTriggerRecurringSplit('Du 5G');
    const data = JSON.parse(res.content[0].text);

    expect(data.success).toBe(true);
    expect(data.postedSubscription).toContain('Du 5G');
    expect(data.amountMinor).toBe(38900); // AED 389.00
    expect(data.splits.length).toBe(3);
  });
});
