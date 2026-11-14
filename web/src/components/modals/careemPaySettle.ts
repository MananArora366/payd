/**
 * Pure sequencing for "Settle with Careem Pay", kept out of the React component so
 * it can be unit tested.
 *
 * Order (never charge first and validate later):
 *   1. validate the settlement against the same debt the UI shows
 *   2. charge via Careem Pay (only if there is no earlier successful charge)
 *   3. record the settlement in the ledger
 * If step 3 fails after a successful charge we report success-with-warning and keep
 * the receipt, so a retry only re-attempts the ledger write and never re-charges.
 */

/** Receipt returned by the careem_pay_settle_debt MCP tool. */
export interface CareemPayReceipt {
  success: boolean;
  status: string;
  transaction_ref: string;
  amount_minor: number;
  careem_pay_deeplink: string;
  /** True for the sandbox mock: no real money moved. */
  simulated?: boolean;
}

export type CareemPayOutcome =
  /** Validation failed; nobody was charged. */
  | { kind: 'invalid'; message: string }
  /** The charge failed or was declined; nobody was charged. */
  | { kind: 'charge_failed'; message: string }
  /** Charged and recorded. */
  | { kind: 'recorded'; receipt: CareemPayReceipt }
  /** Charged, but the ledger write failed. Keep `receipt` and retry recording only. */
  | { kind: 'charged_not_recorded'; receipt: CareemPayReceipt; message: string };

export interface CareemPayDeps {
  validate: () => { ok: true } | { ok: false; reason: string };
  charge: () => Promise<CareemPayReceipt>;
  record: (receipt: CareemPayReceipt) => void;
}

/** Thrown by the charge step when Careem Pay authorised something other than requested. */
export class CareemPayAmountMismatchError extends Error {
  constructor(public receipt: CareemPayReceipt) {
    super('Careem Pay authorised a different amount');
    this.name = 'CareemPayAmountMismatchError';
  }
}

/** Thrown when Careem Pay (or the MCP tool) refused the request. Message is internal; map it with friendlyCareemPayError. */
export class CareemPayDeclinedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CareemPayDeclinedError';
  }
}

/**
 * Parses a JSON-RPC response from /api/mcp `tools/call careem_pay_settle_debt`.
 * Tool errors arrive as HTTP 200 with result.isError and a JSON {success:false,error}
 * text block; transport/protocol errors as non-2xx or a JSON-RPC `error`.
 * Returns the receipt only if Careem Pay authorised exactly `requestedMinor` fils.
 */
export function parseCareemPayResponse(httpOk: boolean, httpStatus: number, data: any, requestedMinor: number): CareemPayReceipt {
  if (!httpOk || !data) {
    throw new Error(`Careem Pay request failed (HTTP ${httpStatus})`);
  }
  if (data.error) {
    throw new CareemPayDeclinedError(String(data.error?.message || 'Careem Pay request was rejected'));
  }
  const text = data.result?.content?.[0]?.text;
  let body: any = null;
  try {
    body = typeof text === 'string' ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (data.result?.isError || !body || body.success !== true) {
    throw new CareemPayDeclinedError(String(body?.error || 'Careem Pay did not authorize the transfer'));
  }
  if (body.status !== 'INSTANT_AUTHORIZED' || typeof body.transaction_ref !== 'string') {
    throw new CareemPayDeclinedError('Careem Pay did not authorize the transfer');
  }
  const receipt: CareemPayReceipt = {
    success: true,
    status: body.status,
    transaction_ref: body.transaction_ref,
    amount_minor: body.amount_minor,
    careem_pay_deeplink: body.careem_pay_deeplink || '',
    simulated: body.simulated === true,
  };
  if (receipt.amount_minor !== requestedMinor) {
    throw new CareemPayAmountMismatchError(receipt);
  }
  return receipt;
}

/** Plain-language message for a failed charge. */
export function friendlyCareemPayError(err: unknown): string {
  if (err instanceof CareemPayAmountMismatchError) {
    return (
      `Careem Pay returned a different amount than requested (ref ${err.receipt.transaction_ref}), ` +
      'so Payd did not record it. Check your Careem Pay activity before trying again.'
    );
  }
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (/failed to fetch|network|load failed|timeout|ECONN/i.test(msg)) {
    return "We couldn't reach Careem Pay. Check your connection and try again. You have not been charged.";
  }
  if (err instanceof CareemPayDeclinedError || /authori[sz]e|declin/i.test(msg)) {
    return "Careem Pay didn't approve the transfer. You have not been charged.";
  }
  return 'Careem Pay could not complete the transfer. You have not been charged. Please try again.';
}

/** Plain-language message when the ledger write fails after a successful charge. */
export function friendlyRecordWarning(receipt: CareemPayReceipt): string {
  return (
    `Your Careem Pay transfer went through (ref ${receipt.transaction_ref}), but Payd couldn't save it to your ` +
    "balances yet. Tap \"Retry saving\" — you won't be charged again."
  );
}

/**
 * Runs one settle attempt. Pass the receipt from an earlier attempt (if any) as
 * `priorReceipt`: then validation and charging are skipped and only the ledger
 * write is retried.
 */
export async function runCareemPaySettlement(
  deps: CareemPayDeps,
  priorReceipt: CareemPayReceipt | null = null
): Promise<CareemPayOutcome> {
  let receipt = priorReceipt;

  if (!receipt) {
    const check = deps.validate();
    if (!check.ok) return { kind: 'invalid', message: check.reason };
    try {
      receipt = await deps.charge();
    } catch (err) {
      return { kind: 'charge_failed', message: friendlyCareemPayError(err) };
    }
  }

  try {
    deps.record(receipt);
  } catch {
    return { kind: 'charged_not_recorded', receipt, message: friendlyRecordWarning(receipt) };
  }
  return { kind: 'recorded', receipt };
}
