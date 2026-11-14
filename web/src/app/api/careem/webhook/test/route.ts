import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { careemEventStore, makeDemoEvent } from '@/lib/careem/events';
import { guardWebhookRequest } from '@/lib/careem/webhookAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };

const TestBodySchema = z
  .object({ kind: z.enum(['ride', 'food', 'groceries']).default('food') })
  .strict();

/**
 * POST /api/careem/webhook/test   body (optional): { kind: 'ride' | 'food' | 'groceries' }
 * Dev-only helper: injects a sample Careem event into the pending store.
 * Same auth as the real webhook: X-Payd-Webhook-Secret + Content-Type: application/json.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'Demo events disabled in production' }, { status: 403, headers: NO_STORE });
  }
  const guard = await guardWebhookRequest(req);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status, headers: NO_STORE });
  }
  const parsed = TestBodySchema.safeParse(guard.body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Body must be {} or { kind: 'ride' | 'food' | 'groceries' }", issues: parsed.error.flatten() },
      { status: 400, headers: NO_STORE }
    );
  }
  const { event } = careemEventStore.add(makeDemoEvent(parsed.data.kind));
  return NextResponse.json({ ok: true, id: event.id, event }, { status: 202, headers: NO_STORE });
}
