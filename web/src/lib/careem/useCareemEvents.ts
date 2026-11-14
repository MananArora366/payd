'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Client-side shape of a pending Careem order/ride event (GET /api/careem/events). */
export type CareemService = 'food' | 'groceries' | 'ride' | 'box';
export type CareemDecision = 'split' | 'dismiss';

export interface CareemEventItem {
  name: string;
  quantity: number;
  amount_minor: number;
}

export interface CareemEvent {
  id: string;
  type: 'order.placed' | 'ride.booked';
  service: CareemService;
  source_tool: string;
  occurred_at: string;
  title: string;
  merchant: string | null;
  amount_minor: number;
  currency: 'AED';
  reference: string | null;
  items: CareemEventItem[];
  status: 'pending';
}

const POLL_INTERVAL_MS = 2000;

/**
 * Outcome of decide(). `already_decided` (HTTP 409) means another tab or client decided
 * this event first; the event is gone from the queue either way, so callers can ignore it.
 */
export type CareemDecideResult =
  | { ok: true }
  | { ok: false; reason: 'already_decided' | 'not_found' | 'network' | 'server' };

function occurredMs(e: CareemEvent): number {
  const t = Date.parse(e.occurred_at);
  return Number.isNaN(t) ? 0 : t;
}

/** Newest-by-occurrence first (stable, so server order breaks ties). Defensive: the server already sorts. */
export function sortNewestFirst(events: CareemEvent[]): CareemEvent[] {
  return [...events].sort((a, b) => occurredMs(b) - occurredMs(a));
}

/**
 * Polls pending Careem events every 2s (paused while the tab is hidden).
 * Returns the oldest pending event as `current` and `decide()` which removes
 * the event locally (optimistically) and POSTs the decision to the backend.
 */
export function useCareemEvents(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [events, setEvents] = useState<CareemEvent[]>([]);
  // Ids decided locally; filtered out of poll results until the server stops returning them.
  const decidedRef = useRef<Set<string>>(new Set());

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/careem/events', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { events?: CareemEvent[] };
      if (!Array.isArray(data?.events)) return;
      const serverIds = new Set(data.events.map((e) => e.id));
      // Forget decided ids the server no longer reports as pending.
      for (const id of decidedRef.current) {
        if (!serverIds.has(id)) decidedRef.current.delete(id);
      }
      // Server sends newest first (by occurred_at); we keep that order and present the oldest.
      const pending = data.events.filter((e) => e && e.status === 'pending' && !decidedRef.current.has(e.id));
      setEvents(sortNewestFirst(pending));
    } catch {
      // Ignore network/parse errors silently; next tick will retry.
    }
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      void poll();
      timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop();
      else start();
    };

    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, poll]);

  const decide = useCallback(async (id: string, decision: CareemDecision): Promise<CareemDecideResult> => {
    decidedRef.current.add(id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
    try {
      const res = await fetch(`/api/careem/events/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) return { ok: true };
      // 409: already decided elsewhere (another tab). 404: the server restarted and forgot it.
      // Either way it is no longer pending, so keeping it hidden is the right outcome.
      if (res.status === 409) return { ok: false, reason: 'already_decided' };
      if (res.status === 404) return { ok: false, reason: 'not_found' };
      return { ok: false, reason: 'server' };
    } catch {
      // The event stays hidden locally for this session.
      return { ok: false, reason: 'network' };
    }
  }, []);

  const current = events.length > 0 ? events[events.length - 1] : null;

  return { current, events, pendingCount: events.length, decide };
}
