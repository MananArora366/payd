import { NextRequest, NextResponse } from 'next/server';
import { DecisionSchema, careemEventStore } from '@/lib/careem/events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Next already decodes dynamic params once. Decode again only if the value still
 * looks encoded (callers that double-encode), and never throw on malformed input.
 */
function normalizeId(raw: string): string | null {
  if (!raw.includes('%')) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function badId() {
  return NextResponse.json({ ok: false, error: 'Malformed event id' }, { status: 400, headers: NO_STORE });
}

/**
 * POST /api/careem/events/[id]  body: { decision: 'split' | 'dismiss' }
 * → 200 { ok: true, event } | 400 bad body | 404 unknown id | 409 already decided
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = normalizeId((await params).id);
  if (id === null) return badId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE });
  }

  const parsed = DecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "decision must be 'split' or 'dismiss'", issues: parsed.error.flatten() },
      { status: 400, headers: NO_STORE }
    );
  }

  const result = careemEventStore.decide(id, parsed.data.decision);
  if (!result.ok) {
    if (result.reason === 'already_decided') {
      return NextResponse.json(
        { ok: false, error: `Event already ${result.event.status}`, event: result.event },
        { status: 409, headers: NO_STORE }
      );
    }
    return NextResponse.json({ ok: false, error: `Unknown event id: ${id}` }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, event: result.event }, { headers: NO_STORE });
}

/** GET /api/careem/events/[id] → { event } | 404 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = normalizeId((await params).id);
  if (id === null) return badId();
  const event = careemEventStore.get(id);
  if (!event) {
    return NextResponse.json({ ok: false, error: `Unknown event id: ${id}` }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, event }, { headers: NO_STORE });
}
