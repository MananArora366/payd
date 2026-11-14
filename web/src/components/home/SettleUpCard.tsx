'use client';

import React, { useMemo } from 'react';
import { ArrowRight, CheckCircle2, HandCoins } from 'lucide-react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits, summarizeDebtSimplification } from '@/lib/ledger';

const CURRENCY = 'AED'; // AED-only ledger
const MAX_ROWS = 4;

interface SettleUpCardProps {
  onOpenSettleUp: () => void;
}

/**
 * Home's main card: who you still need to settle with, largest first, and how
 * few payments it takes. Uses the same netted debts as the Settle up tab.
 */
export function SettleUpCard({ onOpenSettleUp }: SettleUpCardProps) {
  const { currentUser, users, bilateralDebts, transactions, splits, settlements } = usePayd();

  const rows = users
    .filter((u) => u.id !== currentUser.id)
    .map((u) => {
      const theyOwe = bilateralDebts.get(u.id)?.get(currentUser.id) || 0;
      const iOwe = bilateralDebts.get(currentUser.id)?.get(u.id) || 0;
      return { user: u, netMinor: theyOwe - iOwe };
    })
    .filter((r) => r.netMinor !== 0)
    .sort((a, b) => Math.abs(b.netMinor) - Math.abs(a.netMinor));

  const { beforeTransfers, afterTransfers } = useMemo(
    () => summarizeDebtSimplification(transactions, splits, settlements),
    [transactions, splits, settlements]
  );

  const initials = (name: string) => name.split(' ').map((n) => n[0]).join('').slice(0, 2);

  return (
    <section aria-labelledby="settle-up-heading" className="p-5 bg-[#18181b] border border-brand-500/30 rounded-2xl space-y-4 font-body">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="p-2 rounded-xl bg-brand-500/15 text-brand-400 shrink-0">
            <HandCoins className="w-5 h-5" />
          </span>
          <div>
            <h3 id="settle-up-heading" className="font-heading text-base text-white">Settle up</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              {rows.length === 0
                ? 'Everyone is square. New shared expenses will show up here.'
                : afterTransfers < beforeTransfers
                  ? `Payd clears every balance in ${afterTransfers} payment${afterTransfers === 1 ? '' : 's'} instead of ${beforeTransfers}, fee-free with Careem Pay.`
                  : 'Clear balances in one tap, fee-free with Careem Pay.'}
            </p>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-brand-300">
          <CheckCircle2 className="w-4 h-4" /> All settled up
        </div>
      ) : (
        <ul className="divide-y divide-white/6">
          {rows.slice(0, MAX_ROWS).map(({ user, netMinor }) => {
            const owesYou = netMinor > 0;
            const first = user.name.split(' ')[0];
            return (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={onOpenSettleUp}
                  className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-white/[0.03] rounded-lg transition"
                >
                  <span className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {initials(user.name)}
                  </span>
                  <span className="flex-1 min-w-0 text-sm text-white truncate">
                    {owesYou ? `${first} owes you` : `You owe ${first}`}
                  </span>
                  <span className={`text-sm font-bold shrink-0 ${owesYou ? 'text-[#10B981]' : 'text-[#F43F5E]'}`}>
                    {owesYou ? '+' : '-'}
                    {formatMinorUnits(Math.abs(netMinor), CURRENCY)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > 0 && (
        <button
          type="button"
          onClick={onOpenSettleUp}
          className="w-full h-11 rounded-xl bg-brand-400 hover:bg-brand-300 text-zinc-950 font-semibold text-sm flex items-center justify-center gap-2 transition active:scale-95"
        >
          <span>{rows.length > MAX_ROWS ? `Settle up with all ${rows.length} people` : 'Settle up now'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </section>
  );
}
