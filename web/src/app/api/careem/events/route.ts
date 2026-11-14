import { NextResponse } from 'next/server';
import { careemEventStore } from '@/lib/careem/events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/careem/events → { events: StoredCareemEvent[] } (pending only, newest first)
 */
export async function GET() {
  return NextResponse.json(
    { events: careemEventStore.listPending() },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' } }
  );
}
