import { describe, it, expect, beforeEach } from 'vitest';
import {
  CareemEventSchema,
  DecisionSchema,
  careemEventStore,
  makeDemoEvent,
  MAX_EVENTS,
  type CareemEvent,
} from '../events';

function ev(id: string, overrides: Partial<CareemEvent> = {}): CareemEvent {
  return CareemEventSchema.parse({
    id,
    type: 'order.placed',
    service: 'food',
    source_tool: 'cart_checkout',
    occurred_at: '2026-11-14T10:00:00.000Z',
    title: 'Lunch',
    merchant: 'Shake Shack',
    amount_minor: 5000,
    currency: 'AED',
    reference: 'ORD-1',
    items: [{ name: 'Burger', quantity: 1, amount_minor: 5000 }],
    ...overrides,
  });
}

describe('CareemEventSchema', () => {
  it('parses a full payload', () => {
    const e = ev('evt_1');
    expect(e.amount_minor).toBe(5000);
    expect(e.items).toHaveLength(1);
    expect(e.raw).toBeUndefined();
  });

  it('is lenient: items default to [], merchant/reference null, raw optional', () => {
    const e = CareemEventSchema.parse({
      id: 'evt_2',
      type: 'ride.booked',
      service: 'ride',
      source_tool: 'create_ride',
      occurred_at: '2026-11-14T10:00:00.000Z',
      title: 'Ride',
      amount_minor: 3200,
      currency: 'aed',
    });
    expect(e.items).toEqual([]);
    expect(e.merchant).toBeNull();
    expect(e.reference).toBeNull();
    expect(e.currency).toBe('AED');
  });

  it('accepts explicit nulls and raw object', () => {
    const e = ev('evt_3', { merchant: null, reference: null, raw: { foo: 1 } });
    expect(e.merchant).toBeNull();
    expect(e.raw).toEqual({ foo: 1 });
  });

  it('rejects non-integer amounts (fils only)', () => {
    expect(CareemEventSchema.safeParse({ ...ev('x'), amount_minor: 12.5 }).success).toBe(false);
  });

  it('rejects negative item amounts but allows 0 (e.g. free delivery)', () => {
    const neg = { ...ev('x'), items: [{ name: 'Discount', quantity: 1, amount_minor: -500 }] };
    expect(CareemEventSchema.safeParse(neg).success).toBe(false);
    const zero = { ...ev('x'), items: [{ name: 'Delivery', quantity: 1, amount_minor: 0 }] };
    expect(CareemEventSchema.safeParse(zero).success).toBe(true);
  });

  it('rejects unknown type/service and missing id', () => {
    expect(CareemEventSchema.safeParse({ ...ev('x'), type: 'order.cancelled' }).success).toBe(false);
    expect(CareemEventSchema.safeParse({ ...ev('x'), service: 'bike' }).success).toBe(false);
    const { id: _id, ...noId } = ev('x');
    expect(CareemEventSchema.safeParse(noId).success).toBe(false);
  });

  it('DecisionSchema accepts only split/dismiss', () => {
    expect(DecisionSchema.safeParse({ decision: 'split' }).success).toBe(true);
    expect(DecisionSchema.safeParse({ decision: 'dismiss' }).success).toBe(true);
    expect(DecisionSchema.safeParse({ decision: 'maybe' }).success).toBe(false);
  });

  it('demo events are schema-valid', () => {
    for (const k of ['ride', 'food', 'groceries'] as const) {
      expect(CareemEventSchema.safeParse(makeDemoEvent(k)).success).toBe(true);
    }
  });
});

describe('careemEventStore', () => {
  beforeEach(() => careemEventStore.clear());

  it('adds events as pending and lists newest first', () => {
    careemEventStore.add(ev('a'));
    careemEventStore.add(ev('b'));
    const pending = careemEventStore.listPending();
    expect(pending.map((e) => e.id)).toEqual(['b', 'a']);
    expect(pending.every((e) => e.status === 'pending')).toBe(true);
  });

  it('dedupes by id', () => {
    expect(careemEventStore.add(ev('a')).duplicate).toBe(false);
    const second = careemEventStore.add(ev('a', { amount_minor: 1 }));
    expect(second.duplicate).toBe(true);
    expect(second.event.amount_minor).toBe(5000);
    expect(careemEventStore.list()).toHaveLength(1);
  });

  it('caps at MAX_EVENTS, dropping the oldest', () => {
    for (let i = 0; i < MAX_EVENTS + 5; i++) careemEventStore.add(ev(`e${i}`));
    const all = careemEventStore.list();
    expect(all).toHaveLength(MAX_EVENTS);
    expect(all[0].id).toBe('e5');
    expect(all[all.length - 1].id).toBe(`e${MAX_EVENTS + 4}`);
  });

  it('decide removes from pending and sets status', () => {
    careemEventStore.add(ev('a'));
    careemEventStore.add(ev('b'));
    const a = careemEventStore.decide('a', 'split');
    const b = careemEventStore.decide('b', 'dismiss');
    expect(a.ok && a.event.status).toBe('split');
    expect(b.ok && b.event.status).toBe('dismissed');
    expect(careemEventStore.listPending()).toEqual([]);
    expect(careemEventStore.get('a')?.decided_at).toBeTruthy();
  });

  it('decide only works on pending events; a second decision is already_decided', () => {
    careemEventStore.add(ev('a'));
    expect(careemEventStore.decide('a', 'dismiss').ok).toBe(true);
    const decidedAt = careemEventStore.get('a')?.decided_at;
    const again = careemEventStore.decide('a', 'split');
    expect(again).toMatchObject({ ok: false, reason: 'already_decided' });
    // The first decision stands.
    expect(careemEventStore.get('a')?.status).toBe('dismissed');
    expect(careemEventStore.get('a')?.decided_at).toBe(decidedAt);
  });

  it('decide reports not_found and get returns undefined for unknown ids', () => {
    expect(careemEventStore.decide('nope', 'split')).toEqual({ ok: false, reason: 'not_found' });
    expect(careemEventStore.get('nope')).toBeUndefined();
  });

  it('orders pending by occurred_at, not arrival (newest first; client shows the last = oldest)', () => {
    careemEventStore.add(ev('late', { occurred_at: '2026-11-14T10:05:00.000Z' }));
    careemEventStore.add(ev('early', { occurred_at: '2026-11-14T10:01:00.000Z' }));
    careemEventStore.add(ev('mid', { occurred_at: '2026-11-14T10:03:00.000Z' }));
    const ids = careemEventStore.listPending().map((e) => e.id);
    expect(ids).toEqual(['late', 'mid', 'early']);
    expect(ids[ids.length - 1]).toBe('early');
  });

  it('breaks occurred_at ties by arrival, and falls back to received_at for unparseable dates', () => {
    careemEventStore.add(ev('first', { occurred_at: '2026-11-14T10:00:00.000Z' }));
    careemEventStore.add(ev('second', { occurred_at: '2026-11-14T10:00:00.000Z' }));
    careemEventStore.add(ev('garbage', { occurred_at: 'not-a-date' })); // received now, i.e. newest
    expect(careemEventStore.listPending().map((e) => e.id)).toEqual(['garbage', 'second', 'first']);
  });

  it('is shared via globalThis', () => {
    careemEventStore.add(ev('g'));
    const g = (globalThis as Record<string, unknown>).__paydCareemEventStore__ as { events: { id: string }[] };
    expect(g.events.map((e) => e.id)).toContain('g');
  });
});
