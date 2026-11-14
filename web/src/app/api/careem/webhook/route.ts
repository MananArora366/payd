import { NextRequest, NextResponse } from 'next/server';
import { CareemEventSchema, careemEventStore } from '@/lib/careem/events';
import { guardWebhookRequest } from '@/lib/careem/webhookAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * POST /api/careem/webhook
 * Receives order.placed / ride.booked events from the local careem-mcp server.
 * Requires X-Payd-Webhook-Secret (401), Content-Type: application/json (415), body <= 256 KB (413).
 */
export async function POST(req: NextRequest) {
  const guard = await guardWebhookRequest(req);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status, headers: NO_STORE });
  }

  const parsed = CareemEventSchema.safeParse(guard.body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Invalid Careem event', issues: parsed.error.flatten() },
      { status: 400, headers: NO_STORE }
    );
  }

  const headerType = req.headers.get('x-careem-event');
  if (headerType && headerType !== parsed.data.type) {
    console.warn(`[careem/webhook] X-Careem-Event "${headerType}" != body type "${parsed.data.type}"`);
  }

  const { event, duplicate } = careemEventStore.add(parsed.data);
  return NextResponse.json({ ok: true, id: event.id, duplicate }, { status: 202, headers: NO_STORE });
}

/**
 * GET /api/careem/webhook → health (side-effect free).
 * Sample events for dev: POST /api/careem/webhook/test (needs the webhook secret).
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: 'payd-careem-webhook',
      pending: careemEventStore.listPending().length,
      total: careemEventStore.list().length,
      time: new Date().toISOString(),
    },
    { headers: NO_STORE }
  );
}
