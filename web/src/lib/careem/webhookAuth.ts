// Shared-secret auth and request hygiene for the Careem → Payd webhook.
// careem-mcp sends X-Payd-Webhook-Secret; both sides read PAYD_WEBHOOK_SECRET and
// default to DEFAULT_WEBHOOK_SECRET for local dev.

import { createHash, timingSafeEqual } from 'node:crypto';

export const WEBHOOK_SECRET_HEADER = 'x-payd-webhook-secret';
export const DEFAULT_WEBHOOK_SECRET = 'payd-local-dev-secret';
/** Max webhook body. careem-mcp sends {args, result} in `raw`, which is a few KB in practice. */
export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export function getWebhookSecret(env: Record<string, string | undefined> = process.env): string {
  return env.PAYD_WEBHOOK_SECRET || DEFAULT_WEBHOOK_SECRET;
}

/** Constant-time comparison (hashing first, so length differences don't leak either). */
export function secretsMatch(provided: string | null | undefined, expected: string): boolean {
  if (typeof provided !== 'string' || provided.length === 0 || expected.length === 0) return false;
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

export function isJsonContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  const mime = contentType.split(';')[0].trim().toLowerCase();
  return mime === 'application/json' || (mime.startsWith('application/') && mime.endsWith('+json'));
}

export type GuardResult =
  | { ok: true; body: unknown }
  | { ok: false; status: 400 | 401 | 413 | 415; error: string };

/**
 * Checks the secret, the content type and the size, then parses the JSON body.
 * Order: 401 → 415 → 413 → 400, so unauthenticated callers learn nothing else.
 */
export async function guardWebhookRequest(
  req: Request,
  opts: { secret?: string; maxBytes?: number } = {}
): Promise<GuardResult> {
  const secret = opts.secret ?? getWebhookSecret();
  const maxBytes = opts.maxBytes ?? MAX_WEBHOOK_BODY_BYTES;

  if (!secretsMatch(req.headers.get(WEBHOOK_SECRET_HEADER), secret)) {
    return { ok: false, status: 401, error: 'Missing or invalid webhook secret' };
  }
  if (!isJsonContentType(req.headers.get('content-type'))) {
    return { ok: false, status: 415, error: 'Content-Type must be application/json' };
  }
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, error: `Body exceeds ${maxBytes} bytes` };
  }

  const text = await readTextCapped(req, maxBytes);
  if (text === null) return { ok: false, status: 413, error: `Body exceeds ${maxBytes} bytes` };
  if (text.trim() === '') return { ok: true, body: undefined };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON body' };
  }
}

/** Reads the body as UTF-8, returning null once more than maxBytes have arrived. */
async function readTextCapped(req: Request, maxBytes: number): Promise<string | null> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}
