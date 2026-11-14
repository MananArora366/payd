import { describe, it, expect, vi } from 'vitest';
import {
  runCareemPaySettlement,
  friendlyCareemPayError,
  CareemPayAmountMismatchError,
  CareemPayReceipt,
  parseCareemPayResponse,
} from './careemPaySettle';

const receipt: CareemPayReceipt = {
  success: true,
  status: 'INSTANT_AUTHORIZED',
  transaction_ref: 'CP-123',
  amount_minor: 9667,
  careem_pay_deeplink: 'careem://pay',
};

describe('runCareemPaySettlement sequencing', () => {
  it('validates BEFORE charging and never charges an invalid settlement', async () => {
    const charge = vi.fn(async () => receipt);
    const record = vi.fn();
    const out = await runCareemPaySettlement({
      validate: () => ({ ok: false, reason: 'Too much' }),
      charge,
      record,
    });
    expect(out).toEqual({ kind: 'invalid', message: 'Too much' });
    expect(charge).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('charges once then records on the happy path', async () => {
    const order: string[] = [];
    const out = await runCareemPaySettlement({
      validate: () => {
        order.push('validate');
        return { ok: true };
      },
      charge: async () => {
        order.push('charge');
        return receipt;
      },
      record: () => {
        order.push('record');
      },
    });
    expect(order).toEqual(['validate', 'charge', 'record']);
    expect(out).toEqual({ kind: 'recorded', receipt });
  });

  it('a failed charge records nothing and gives a friendly message', async () => {
    const record = vi.fn();
    const out = await runCareemPaySettlement({
      validate: () => ({ ok: true }),
      charge: async () => {
        throw new TypeError('Failed to fetch');
      },
      record,
    });
    expect(out.kind).toBe('charge_failed');
    expect(record).not.toHaveBeenCalled();
    if (out.kind === 'charge_failed') expect(out.message).toMatch(/not been charged/);
  });

  it('ledger failure after a charge -> success-with-warning; retry only re-records (no second charge)', async () => {
    const charge = vi.fn(async () => receipt);
    let fail = true;
    const record = vi.fn(() => {
      if (fail) throw new Error('Ledger Invariant Violation: boom');
    });
    const validate = vi.fn(() => ({ ok: true as const }));

    const first = await runCareemPaySettlement({ validate, charge, record });
    expect(first.kind).toBe('charged_not_recorded');
    if (first.kind !== 'charged_not_recorded') return;
    expect(first.message).toContain('CP-123');
    expect(first.message).not.toMatch(/invariant/i);
    expect(charge).toHaveBeenCalledTimes(1);

    fail = false;
    const second = await runCareemPaySettlement({ validate, charge, record }, first.receipt);
    expect(second).toEqual({ kind: 'recorded', receipt });
    expect(charge).toHaveBeenCalledTimes(1); // reused the auth ref
    expect(validate).toHaveBeenCalledTimes(1); // retry does not re-validate a settled charge
    expect(record).toHaveBeenLastCalledWith(receipt);
  });
});

describe('friendlyCareemPayError', () => {
  it('maps errors to plain language', () => {
    expect(friendlyCareemPayError(new Error('Careem Pay did not authorize the transfer'))).toMatch(/didn't approve/);
    expect(friendlyCareemPayError(new Error('Failed to fetch'))).toMatch(/couldn't reach/i);
    expect(friendlyCareemPayError(new Error('-32602 something internal'))).not.toMatch(/32602/);
    expect(friendlyCareemPayError(new CareemPayAmountMismatchError({ ...receipt, amount_minor: 1 }))).toMatch(
      /different amount.*CP-123/
    );
  });
});

describe('parseCareemPayResponse (new /api/mcp tool-result shape)', () => {
  const ok = (body: unknown, isError = false) => ({
    jsonrpc: '2.0',
    id: 1,
    result: { isError, content: [{ type: 'text', text: JSON.stringify(body) }] },
  });

  it('accepts an authorized receipt for the exact amount', () => {
    const r = parseCareemPayResponse(true, 200, ok({ ...receipt, simulated: true }), 9667);
    expect(r.transaction_ref).toBe('CP-123');
    expect(r.simulated).toBe(true);
  });

  it('treats isError tool results (HTTP 200) as declined, without charging', () => {
    const body = { success: false, error: 'User confirmation required', prompt: 'Please confirm' };
    expect(() => parseCareemPayResponse(true, 200, ok(body, true), 9667)).toThrow(/confirmation/);
    try {
      parseCareemPayResponse(true, 200, ok(body, true), 9667);
    } catch (e) {
      expect(friendlyCareemPayError(e)).toMatch(/didn't approve/);
    }
  });

  it('rejects HTTP errors, JSON-RPC errors, garbage and amount mismatches', () => {
    expect(() => parseCareemPayResponse(false, 403, { error: 'Forbidden' }, 9667)).toThrow();
    expect(() => parseCareemPayResponse(true, 200, { error: { code: -32601, message: 'nope' } }, 9667)).toThrow();
    expect(() => parseCareemPayResponse(true, 200, { result: { content: [{ text: 'not json' }] } }, 9667)).toThrow();
    expect(() => parseCareemPayResponse(true, 200, ok(receipt), 100)).toThrow(CareemPayAmountMismatchError);
  });
});
