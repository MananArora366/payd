// Careem → Payd event intake.
// The local careem-mcp server POSTs order/ride events to /api/careem/webhook.
// Events are held in an in-memory store pinned on globalThis so they survive
// Next dev HMR and are shared across route bundles.
// Invariant: all money is integer minor units (fils), currency AED.

import { z } from 'zod';

export const CareemEventItemSchema = z.object({
  name: z.string(),
  quantity: z.number().int().nonnegative().default(1),
  amount_minor: z.number().int().nonnegative(),
});

export const CareemEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['order.placed', 'ride.booked']),
  service: z.enum(['food', 'groceries', 'ride', 'box']),
  source_tool: z.string().default('unknown'),
  occurred_at: z.string().default(() => new Date().toISOString()),
  title: z.string().default(''),
  merchant: z.string().nullable().optional().transform((v) => v ?? null),
  amount_minor: z.number().int().nonnegative(),
  currency: z.string().default('AED').transform((c) => c.toUpperCase()),
  reference: z.string().nullable().optional().transform((v) => v ?? null),
  items: z.array(CareemEventItemSchema).nullable().optional().transform((v) => v ?? []),
  raw: z.record(z.unknown()).optional(),
});

export type CareemEventItem = z.infer<typeof CareemEventItemSchema>;
export type CareemEvent = z.infer<typeof CareemEventSchema>;
export type CareemEventStatus = 'pending' | 'split' | 'dismissed';
export type CareemDecision = 'split' | 'dismiss';

export interface StoredCareemEvent extends CareemEvent {
  status: CareemEventStatus;
  received_at: string;
  decided_at: string | null;
}

export const DecisionSchema = z.object({
  decision: z.enum(['split', 'dismiss']),
});

export const MAX_EVENTS = 100;

export type DecideResult =
  | { ok: true; event: StoredCareemEvent }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'already_decided'; event: StoredCareemEvent };

/** Sort key: occurred_at when it parses, else received_at. */
function occurredMs(e: StoredCareemEvent): number {
  const t = Date.parse(e.occurred_at);
  return Number.isNaN(t) ? Date.parse(e.received_at) : t;
}

/** Oldest-by-occurrence first; ties broken by received_at (Array#sort is stable, so then by arrival). */
function compareOldestFirst(a: StoredCareemEvent, b: StoredCareemEvent): number {
  return occurredMs(a) - occurredMs(b) || Date.parse(a.received_at) - Date.parse(b.received_at);
}

interface CareemEventStoreState {
  events: StoredCareemEvent[]; // oldest first, newest last
}

const GLOBAL_KEY = '__paydCareemEventStore__';

function state(): CareemEventStoreState {
  const g = globalThis as unknown as Record<string, CareemEventStoreState | undefined>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = { events: [] };
  return g[GLOBAL_KEY]!;
}

export const careemEventStore = {
  /** Adds an event. Dedupes by id (returns existing, duplicate=true). Caps at MAX_EVENTS. */
  add(event: CareemEvent): { event: StoredCareemEvent; duplicate: boolean } {
    const s = state();
    const existing = s.events.find((e) => e.id === event.id);
    if (existing) return { event: existing, duplicate: true };
    const stored: StoredCareemEvent = {
      ...event,
      status: 'pending',
      received_at: new Date().toISOString(),
      decided_at: null,
    };
    s.events.push(stored);
    if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
    return { event: stored, duplicate: false };
  },

  /**
   * Pending events, newest first by occurred_at (then received_at). The client
   * presents the last element, i.e. the oldest by occurrence.
   */
  listPending(): StoredCareemEvent[] {
    return state()
      .events.filter((e) => e.status === 'pending')
      .sort(compareOldestFirst)
      .reverse();
  },

  /** All events, oldest first. */
  list(): StoredCareemEvent[] {
    return [...state().events];
  },

  get(id: string): StoredCareemEvent | undefined {
    return state().events.find((e) => e.id === id);
  },

  /** Decides a pending event. An event can be decided once; deciding again is 'already_decided'. */
  decide(id: string, decision: CareemDecision): DecideResult {
    const ev = state().events.find((e) => e.id === id);
    if (!ev) return { ok: false, reason: 'not_found' };
    if (ev.status !== 'pending') return { ok: false, reason: 'already_decided', event: ev };
    ev.status = decision === 'split' ? 'split' : 'dismissed';
    ev.decided_at = new Date().toISOString();
    return { ok: true, event: ev };
  },

  clear(): void {
    state().events = [];
  },
};

/** Sample events for UI development. */
export function makeDemoEvent(kind: 'ride' | 'food' | 'groceries' = 'food'): CareemEvent {
  const id = `evt_${globalThis.crypto.randomUUID()}`;
  const occurred_at = new Date().toISOString();
  if (kind === 'ride') {
    return {
      id,
      type: 'ride.booked',
      service: 'ride',
      source_tool: 'create_ride',
      occurred_at,
      title: 'Careem ride to Dubai Marina',
      merchant: 'Careem Ride',
      amount_minor: 4850,
      currency: 'AED',
      reference: 'RIDE-DEMO-1',
      items: [],
      raw: { demo: true },
    };
  }
  if (kind === 'groceries') {
    return {
      id,
      type: 'order.placed',
      service: 'groceries',
      source_tool: 'cart_grocery_checkout',
      occurred_at,
      title: 'Quik groceries order',
      merchant: 'Careem Quik',
      amount_minor: 12675,
      currency: 'AED',
      reference: 'QUIK-DEMO-1',
      items: [
        { name: 'Milk 1L', quantity: 2, amount_minor: 1450 },
        { name: 'Eggs x12', quantity: 1, amount_minor: 1825 },
        { name: 'Bananas 1kg', quantity: 1, amount_minor: 950 },
      ],
      raw: { demo: true },
    };
  }
  return {
    id,
    type: 'order.placed',
    service: 'food',
    source_tool: 'cart_checkout',
    occurred_at,
    title: 'Dinner from Operation Falafel',
    merchant: 'Operation Falafel',
    amount_minor: 9600,
    currency: 'AED',
    reference: 'FOOD-DEMO-1',
    items: [
      { name: 'Falafel Wrap', quantity: 2, amount_minor: 3200 },
      { name: 'Hummus', quantity: 1, amount_minor: 1800 },
      { name: 'Delivery fee', quantity: 1, amount_minor: 1400 },
    ],
    raw: { demo: true },
  };
}
