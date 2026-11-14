import { describe, it, expect, vi } from 'vitest';
import {
  handleGetBalances,
  handleSimplifyDebts,
  handleAddExpense,
  handleCheckReimbursementLag,
  handleSpinCoffeeRoulette,
  handleTriggerRecurringSplit,
} from '@/lib/mcp/paydTools';
import { callTool, listTools, readResource, MCP_RESOURCES } from '@/lib/mcp/tools';
import { handleRpcMessage, handleRpcPayload } from '@/lib/mcp/jsonrpc';
import { validateArgs } from '@/lib/mcp/validate';

const parse = (res: { content: { text: string }[] }) => JSON.parse(res.content[0].text);

describe('MCP (Model Context Protocol) Tools Suite', () => {
  it('payd_get_balances returns zero-sum net balances', () => {
    const res = handleGetBalances('Dubai Flatmates');
    const data = parse(res);
    expect(data.currency).toBe('AED');
    expect(data.scope).toBe('Dubai Flatmates');
    expect(data.netBalances.length).toBeGreaterThan(0);
    const sum = data.netBalances.reduce((acc: number, b: any) => acc + b.balanceMinor, 0);
    expect(sum).toBe(0);
  });

  it('payd_get_balances and payd_simplify_debts reject unknown groups', () => {
    expect(handleGetBalances('Nope Group').isError).toBe(true);
    const res = handleSimplifyDebts('Dubai Marina Flatmates');
    expect(res.isError).toBe(true);
    expect(parse(res).availableGroups).toContain('Dubai Flatmates');
  });

  it('payd_simplify_debts counts original pairwise debts, not transactions', () => {
    const data = parse(handleSimplifyDebts('Dubai Flatmates'));
    expect(data.group).toBe('Dubai Flatmates');
    const bal = parse(handleGetBalances('Dubai Flatmates'));
    expect(data.originalDebtsCount).toBe(bal.bilateralDebts.length);
    expect(data.simplifiedSettlementsCount).toBe(data.transactions.length);
  });

  it('payd_add_expense returns an honest draft with an exact zero-loss split', () => {
    const data = parse(
      handleAddExpense({ title: 'DIFC Dinner', amount_aed: 300.0, payer_name: 'Manan', group_name: 'Dubai Flatmates' })
    );
    expect(data.success).toBe(true);
    expect(data.status).toBe('draft_created');
    expect(data.recorded).toBe(false);
    expect(JSON.stringify(data).toLowerCase()).not.toContain('recorded into');
    expect(data.amountMinor).toBe(30000);
    expect(data.amountFormatted).toBe('AED 300.00');
    expect(data.payer).toBe('Manan Arora');
    expect(data.splits).toHaveLength(4); // whole group
    expect(data.splits.reduce((acc: number, s: any) => acc + s.shareMinor, 0)).toBe(30000);
  });

  it.each([
    [{ title: 'x', amount_aed: 0 }, 'greater than 0'],
    [{ title: 'x', amount_aed: -5 }, 'greater than 0'],
    [{ title: 'x', amount_aed: 1.234 }, '2 decimal'],
    [{ title: '', amount_aed: 10 }, 'title is required'],
    [{ title: 'x', amount_aed: 10, participant_names: ['a'] }, 'Unknown person'],
    [{ title: 'x', amount_aed: 10, payer_name: 'Bob' }, 'Unknown person'],
    [{ title: 'x', amount_aed: 10, group_name: 'Dubai Flatmates', participant_names: ['Aisha'] }, 'Unknown person'],
    [{ title: 'x', amount_aed: 10, group_name: 'Nope' }, 'Unknown group'],
  ])('payd_add_expense rejects %j', (params, message) => {
    const res = handleAddExpense(params as any);
    expect(res.isError).toBe(true);
    expect(parse(res).error).toContain(message);
  });

  it('payd_add_expense matches people by exact full or first name, case-insensitive', () => {
    const data = parse(handleAddExpense({ title: 'Taxi', amount_aed: 10, participant_names: ['veer', 'MANAN ARORA'] }));
    expect(data.splits.map((s: any) => s.user).sort()).toEqual(['Manan Arora', 'Veer Nanwani']);
  });

  it('payd_check_reimbursement_lag is derived from the ledger', () => {
    const data = parse(handleCheckReimbursementLag());
    expect(data.reimbursementTurnaround).toBeInstanceOf(Array);
    expect(data.totalFrontedMinor).toBeGreaterThan(0);
    const owedSum = data.reimbursementTurnaround.reduce((s: number, m: any) => s + m.currentOwedMinor, 0);
    expect(owedSum).toBe(data.outstandingExposureMinor);
    // Seed: Veer repaid Manan (AED 50.00) and Prakarsh repaid AED 33.33.
    expect(data.recoveredMinor).toBe(8333);
    expect(JSON.stringify(data)).not.toContain('2,340.00');
  });

  it('payd_spin_coffee_roulette is a weighted random draw with truthful odds', () => {
    const odds = parse(handleSpinCoffeeRoulette({ amount_aed: 55, mode: 'equal' }, () => 0));
    expect(odds.billAmountFormatted).toBe('AED 55.00');
    expect(odds.participantsOdds.every((p: any) => p.probability === '25.0%')).toBe(true);
    expect(odds.recorded).toBe(false);

    // Different tickets pick different winners: not hard-coded.
    const winners = new Set<string>();
    for (let t = 0; t < 300; t += 50) {
      winners.add(parse(handleSpinCoffeeRoulette({ mode: 'equal' }, () => t)).selectedPayer);
    }
    expect(winners.size).toBeGreaterThan(1);

    const real = parse(handleSpinCoffeeRoulette({ mode: 'debt_weighted' }));
    const winnerOdds = real.participantsOdds.find((p: any) => p.name === real.selectedPayer);
    expect(real.reason).toContain(winnerOdds.probability);
  });

  it('payd_spin_coffee_roulette rejects non-positive amounts', () => {
    expect(handleSpinCoffeeRoulette({ amount_aed: -5 }).isError).toBe(true);
    expect(handleSpinCoffeeRoulette({ amount_aed: 0 }).isError).toBe(true);
  });

  it('payd_trigger_recurring_split previews the named bill or errors', () => {
    const data = parse(handleTriggerRecurringSplit('Du 5G'));
    expect(data.subscription).toContain('Du 5G');
    expect(data.recorded).toBe(false);
    expect(data.amountMinor).toBe(38900);
    expect(data.splits).toHaveLength(3);

    expect(parse(handleTriggerRecurringSplit('dewa')).subscription).toContain('DEWA');
    const missing = handleTriggerRecurringSplit('Netflix');
    expect(missing.isError).toBe(true);
    expect(parse(missing).availableSubscriptions.length).toBe(3);
    expect(handleTriggerRecurringSplit(undefined).isError).toBe(true);
  });
});

describe('MCP argument validation', () => {
  it('validateArgs reports type, enum, required and unknown-field problems', () => {
    const schema = {
      type: 'object' as const,
      properties: { a: { type: 'integer' as const, minimum: 1 }, b: { type: 'string' as const, enum: ['x'] } },
      required: ['a'],
      additionalProperties: false,
    };
    expect(validateArgs(schema, { a: 1, b: 'x' })).toEqual([]);
    expect(validateArgs(schema, {})).toEqual(['a is required']);
    expect(validateArgs(schema, { a: '1' })[0]).toContain('must be a integer');
    expect(validateArgs(schema, { a: 1.5 })[0]).toContain('whole number');
    expect(validateArgs(schema, { a: 1, b: 'y' })[0]).toContain('one of');
    expect(validateArgs(schema, { a: 1, c: 1 })[0]).toContain('not a recognised');
  });

  it('callTool validates arguments against the advertised schema for every tool', async () => {
    for (const t of listTools()) {
      const res = await callTool(t.name, { definitely_not_an_arg: 1 });
      expect(res.isError, t.name).toBe(true);
    }
    const bad = await callTool('payd_add_expense', { title: 'Dinner', amount_aed: 'abc' });
    expect(bad.isError).toBe(true);
    expect(parse(bad).error).toContain('amount_aed must be a number');
    expect((await callTool('payd_add_expense', { title: 'Dinner' })).isError).toBe(true);
    expect((await callTool('get_activities', { type: 'future' })).isError).toBe(true);
  });

  it('every handler-used field is in the schema', () => {
    const props = (n: string) => Object.keys(listTools().find((t) => t.name === n)!.inputSchema.properties || {});
    expect(props('cart_get_basket_price')).toContain('items');
    expect(props('careem_food_import_order')).toEqual(expect.arrayContaining(['items', 'vatAed', 'deliveryFeeAed']));
    expect(props('request_ride')).toContain('ride_type');
    expect(props('careem_pay_settle_debt')).toContain('confirmed_by_user');
  });
});

describe('MCP JSON-RPC dispatcher', () => {
  it('rejects wrong jsonrpc version, missing method and non-objects with -32600', async () => {
    expect((await handleRpcMessage({ jsonrpc: '1.0', id: 1, method: 'ping' }))!.error!.code).toBe(-32600);
    expect((await handleRpcMessage({ jsonrpc: '2.0', id: 1 }))!.error!.code).toBe(-32600);
    expect((await handleRpcMessage(null))!.error!.code).toBe(-32600);
    expect((await handleRpcPayload([]) as any).error.code).toBe(-32600);
  });

  it('echoes ids exactly (including 0 and strings) and never defaults them', async () => {
    expect((await handleRpcMessage({ jsonrpc: '2.0', id: 0, method: 'ping' }))!.id).toBe(0);
    expect((await handleRpcMessage({ jsonrpc: '2.0', id: 'abc', method: 'ping' }))!.id).toBe('abc');
  });

  it('notifications get no response; batches return only request responses', async () => {
    expect(await handleRpcMessage({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    const batch = (await handleRpcPayload([
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ])) as any[];
    expect(batch.map((r) => r.id)).toEqual([1, 2]);
    expect(await handleRpcPayload([{ jsonrpc: '2.0', method: 'notifications/initialized' }])).toBeNull();
  });

  it('unknown method -32601, unknown tool -32602, bad args isError', async () => {
    expect((await handleRpcMessage({ jsonrpc: '2.0', id: 1, method: 'foo/bar' }))!.error!.code).toBe(-32601);
    const unknown = await handleRpcMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nope' } });
    expect(unknown!.error!.code).toBe(-32602);
    expect((await handleRpcMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call' }))!.error!.code).toBe(-32602);
    const bad = await handleRpcMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'payd_add_expense', arguments: { title: 'x', amount_aed: 0 } },
    });
    expect((bad!.result as any).isError).toBe(true);
  });

  it('handler exceptions become -32603 without leaking details', async () => {
    const tools = await import('@/lib/mcp/tools');
    const def = tools.MCP_TOOLS.find((t) => t.name === 'payd_check_reimbursement_lag')!;
    const original = def.handler;
    def.handler = () => {
      throw new Error('secret stack detail');
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await handleRpcMessage({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'payd_check_reimbursement_lag', arguments: {} },
      });
      expect(res!.error!.code).toBe(-32603);
      expect(JSON.stringify(res)).not.toContain('secret');
    } finally {
      def.handler = original;
      errSpy.mockRestore();
    }
  });

  it('resources/read serves both advertised resources', async () => {
    for (const r of MCP_RESOURCES) {
      const res = await handleRpcMessage({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: r.uri } });
      const contents = (res!.result as any).contents;
      expect(contents[0].uri).toBe(r.uri);
      expect(() => JSON.parse(contents[0].text)).not.toThrow();
    }
    expect(readResource('payd://nope')).toBeNull();
    const missing = await handleRpcMessage({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: 'payd://nope' } });
    expect(missing!.error!.code).toBe(-32602);
  });
});
