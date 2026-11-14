'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Car, Utensils, ShoppingBasket, Package, Users, X } from 'lucide-react';
import { formatMinorUnits } from '@/lib/ledger';
import type { CareemEvent, CareemService } from '@/lib/careem/useCareemEvents';

const SERVICE_META: Record<CareemService, { icon: React.ElementType; label: string }> = {
  ride: { icon: Car, label: 'Careem Ride' },
  food: { icon: Utensils, label: 'Careem Food' },
  groceries: { icon: ShoppingBasket, label: 'Careem Quik' },
  box: { icon: Package, label: 'Careem Box' },
};

function relativeTime(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'Just now';
  const secs = Math.max(0, Math.round((now - t) / 1000));
  if (secs < 60) return 'Just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(t).toLocaleDateString();
}

interface CareemSplitPromptProps {
  event: CareemEvent | null;
  /** Number of pending events (including this one), shown as a "+N more" hint. */
  pendingCount?: number;
  onSplit: (event: CareemEvent) => void;
  onDismiss: (event: CareemEvent) => void;
}

/**
 * "Split this with others?" prompt shown when a Careem order/ride is detected.
 * Bottom sheet on mobile, floating card on larger screens. Esc = No.
 */
export function CareemSplitPrompt({ event, pendingCount = 0, onSplit, onDismiss }: CareemSplitPromptProps) {
  const [visible, setVisible] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const primaryRef = useRef<HTMLButtonElement>(null);
  const eventId = event?.id ?? null;
  // Id of the event already answered, so a double click or Esc+click can't decide it twice
  // (the server would answer 409 for the second decision).
  const answeredRef = useRef<string | null>(null);
  const answer = (ev: CareemEvent, choice: 'split' | 'dismiss') => {
    if (answeredRef.current === ev.id) return;
    answeredRef.current = ev.id;
    if (choice === 'split') onSplit(ev);
    else onDismiss(ev);
  };

  // Enter animation, re-run per event.
  useEffect(() => {
    if (!eventId) {
      setVisible(false);
      return;
    }
    setVisible(false);
    const raf = requestAnimationFrame(() => setVisible(true));
    // Only take focus when the user isn't typing somewhere else.
    const focusTimer = setTimeout(() => {
      const active = document.activeElement;
      if (!active || active === document.body) primaryRef.current?.focus({ preventScroll: true });
    }, 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(focusTimer);
    };
  }, [eventId]);

  // Keep relative time fresh.
  useEffect(() => {
    if (!eventId) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [eventId]);

  // Esc = No.
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (answeredRef.current === event.id) return;
        answeredRef.current = event.id;
        onDismiss(event);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [event, onDismiss]);

  if (!event) return null;

  const meta = SERVICE_META[event.service] ?? SERVICE_META.food;
  const Icon = meta.icon;
  const itemCount = event.items?.reduce((acc, i) => acc + (i.quantity || 1), 0) ?? 0;
  const amount = formatMinorUnits(event.amount_minor, event.currency || 'AED');
  const subtitle = [event.merchant, event.reference ? `Ref ${event.reference}` : null].filter(Boolean).join(' · ');
  const titleId = `careem-split-title-${event.id}`;
  const descId = `careem-split-desc-${event.id}`;
  const extra = Math.max(0, pendingCount - 1);

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3 pb-24 sm:pb-6 sm:justify-end sm:pr-6 pointer-events-none">
      <div
        role="alertdialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className={`pointer-events-auto w-full max-w-md bg-[#18181b] border border-[#00ea80]/25 rounded-2xl shadow-2xl shadow-black/60 p-5 text-white font-body space-y-4 transition-all duration-300 ease-out ${
          visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-[0.98]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-[#00ea80] text-black font-semibold text-[10px] flex items-center justify-center">
              C
            </span>
            <span className="text-[10px] font-heading tracking-wider text-[#00ea80]">
              {meta.label.toUpperCase()}
            </span>
            <span className="text-[10px] text-zinc-500">· {relativeTime(event.occurred_at, now)}</span>
          </div>
          <button
            type="button"
            onClick={() => answer(event, 'dismiss')}
            aria-label="Dismiss, don't split"
            className="p-1.5 rounded-full text-zinc-500 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Order summary */}
        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/20">
          <div className="w-11 h-11 shrink-0 rounded-2xl bg-[#00ea80]/20 text-[#00ea80] flex items-center justify-center">
            <Icon className="w-5 h-5 stroke-[2.25]" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-white truncate">{event.title}</div>
            {subtitle && <div className="text-[11px] text-zinc-400 truncate">{subtitle}</div>}
            {itemCount > 0 && (
              <div className="text-[10px] text-zinc-500 mt-0.5">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-base font-bold tracking-tight text-white">{amount}</div>
          </div>
        </div>

        {/* Question */}
        <div>
          <h2 id={titleId} className="font-heading text-sm text-white tracking-wide flex items-center gap-1.5">
            <Users className="w-4 h-4 text-[#00ea80]" aria-hidden="true" />
            Split this with others?
          </h2>
          <p id={descId} className="text-xs text-zinc-400 mt-1">
            Add it to Payd and choose who to split {amount} with.
            {extra > 0 && <span className="text-zinc-500"> · {extra} more pending</span>}
          </p>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => answer(event, 'dismiss')}
            aria-label="No, don't split this"
            className="py-3 rounded-2xl border border-white/10 text-zinc-300 hover:bg-[#27272a] text-sm font-semibold transition active:scale-95"
          >
            No
          </button>
          <button
            ref={primaryRef}
            type="button"
            onClick={() => answer(event, 'split')}
            aria-label="Yes, split this with others"
            className="py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00ea80]/60"
          >
            Yes, split
          </button>
        </div>
      </div>
    </div>
  );
}
