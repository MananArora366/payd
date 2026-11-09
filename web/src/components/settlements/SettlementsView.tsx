'use client';

import React, { useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits, calculateBilateralDebts } from '@/lib/ledger';
import {
  HandCoins,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Plus,
  ShieldCheck,
  Calendar,
  Wallet,
} from 'lucide-react';
import { getPaymentMethodIcon } from '@/lib/icons';

interface SettlementsViewProps {
  onOpenRecordSettlement: (params?: { senderId?: string; recipientId?: string; amountMinor?: number }) => void;
}

export function SettlementsView({ onOpenRecordSettlement }: SettlementsViewProps) {
  const {
    currentUser,
    users,
    transactions,
    splits,
    settlements,
    userOwedToMe,
    userIOwe,
  } = usePayd();

  const [activeTab, setActiveTab] = useState<'owed_to_me' | 'i_owe'>('owed_to_me');

  // Compute bilateral breakdowns for currentUser
  const bilateral = calculateBilateralDebts(transactions, splits, settlements);

  // People who owe currentUser:
  const peopleWhoOweMe: { user: any; amountMinor: number }[] = [];
  for (const [debtorId, credMap] of bilateral.entries()) {
    if (debtorId !== currentUser.id && credMap.has(currentUser.id)) {
      const amt = credMap.get(currentUser.id) || 0;
      if (amt > 0) {
        const u = users.find((user) => user.id === debtorId);
        if (u) peopleWhoOweMe.push({ user: u, amountMinor: amt });
      }
    }
  }

  // People currentUser owes:
  const peopleIOwe: { user: any; amountMinor: number }[] = [];
  const myDebts = bilateral.get(currentUser.id);
  if (myDebts) {
    for (const [creditorId, amt] of myDebts.entries()) {
      if (amt > 0) {
        const u = users.find((user) => user.id === creditorId);
        if (u) peopleIOwe.push({ user: u, amountMinor: amt });
      }
    }
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Owe & Owed</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Repayments and liability tracking (settlements never pollute expense budgets)
          </p>
        </div>

        <button
          onClick={() => onOpenRecordSettlement()}
          className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Record Settlement</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div
          onClick={() => setActiveTab('owed_to_me')}
          className={`p-5 rounded-3xl border cursor-pointer transition shadow-sm ${
            activeTab === 'owed_to_me'
              ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/20'
              : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <ArrowDownLeft className="w-4 h-4" />
            <span>Money Owed To You</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {formatMinorUnits(userOwedToMe, currentUser.default_currency)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {peopleWhoOweMe.length} {peopleWhoOweMe.length === 1 ? 'person owes' : 'people owe'} you
          </p>
        </div>

        <div
          onClick={() => setActiveTab('i_owe')}
          className={`p-5 rounded-3xl border cursor-pointer transition shadow-sm ${
            activeTab === 'i_owe'
              ? 'bg-rose-500/10 border-rose-500 ring-2 ring-rose-500/20'
              : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-500">
            <ArrowUpRight className="w-4 h-4" />
            <span>Money You Owe</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {formatMinorUnits(userIOwe, currentUser.default_currency)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            You owe {peopleIOwe.length} {peopleIOwe.length === 1 ? 'person' : 'people'}
          </p>
        </div>
      </div>

      {/* Tab Switcher & Person Breakdown */}
      <div className="space-y-4">
        <div className="flex border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTab('owed_to_me')}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition border-b-2 mr-6 ${
              activeTab === 'owed_to_me'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Owed to you ({peopleWhoOweMe.length})
          </button>
          <button
            onClick={() => setActiveTab('i_owe')}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition border-b-2 ${
              activeTab === 'i_owe'
                ? 'border-rose-500 text-rose-500'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            You owe ({peopleIOwe.length})
          </button>
        </div>

        {/* List of Persons */}
        <div className="space-y-2.5">
          {activeTab === 'owed_to_me' ? (
            peopleWhoOweMe.length === 0 ? (
              <div className="p-10 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-60" />
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">No pending receivables!</h4>
                <p className="text-xs text-slate-400 mt-1">None of your friends owe you money right now.</p>
              </div>
            ) : (
              peopleWhoOweMe.map(({ user, amountMinor }) => (
                <div
                  key={user.id}
                  className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl flex items-center justify-between shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <img src={user.avatar_url || ''} alt="" className="w-10 h-10 rounded-full object-cover" />
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{user.name}</div>
                      <div className="text-xs text-slate-400">{user.email}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {formatMinorUnits(amountMinor, currentUser.default_currency)}
                      </div>
                      <div className="text-[10px] text-slate-400">owes you</div>
                    </div>

                    <button
                      onClick={() =>
                        onOpenRecordSettlement({
                          senderId: user.id,
                          recipientId: currentUser.id,
                          amountMinor,
                        })
                      }
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition"
                    >
                      Record Received
                    </button>
                  </div>
                </div>
              ))
            )
          ) : peopleIOwe.length === 0 ? (
            <div className="p-10 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-60" />
              <h4 className="font-semibold text-slate-800 dark:text-slate-200">You are completely debt-free!</h4>
              <p className="text-xs text-slate-400 mt-1">You don&apos;t owe any group members.</p>
            </div>
          ) : (
            peopleIOwe.map(({ user, amountMinor }) => (
              <div
                key={user.id}
                className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl flex items-center justify-between shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <img src={user.avatar_url || ''} alt="" className="w-10 h-10 rounded-full object-cover" />
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">{user.name}</div>
                    <div className="text-xs text-slate-400">{user.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-bold text-rose-500">
                      {formatMinorUnits(amountMinor, currentUser.default_currency)}
                    </div>
                    <div className="text-[10px] text-slate-400">you owe</div>
                  </div>

                  <button
                    onClick={() =>
                      onOpenRecordSettlement({
                        senderId: currentUser.id,
                        recipientId: user.id,
                        amountMinor,
                      })
                    }
                    className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 font-semibold text-xs shadow-sm transition"
                  >
                    Pay Back
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Settlement History Feed */}
      <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Settlement History ({settlements.length})
        </h3>

        <div className="space-y-2">
          {settlements.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
              No settlements recorded yet.
            </div>
          ) : (
            settlements.map((s) => {
              const sender = users.find((u) => u.id === s.sender_id);
              const recipient = users.find((u) => u.id === s.recipient_id);

              return (
                <div
                  key={s.id}
                  className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl flex items-center justify-between text-xs shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400">
                      {getPaymentMethodIcon(s.method, 'w-4 h-4')}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        {sender?.name} {sender?.id === currentUser.id ? '(You)' : ''} paid{' '}
                        {recipient?.name} {recipient?.id === currentUser.id ? '(You)' : ''}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {s.method} • {s.reference || 'Settlement'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-black text-slate-900 dark:text-white">
                      {formatMinorUnits(s.amount_minor, s.currency)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {new Date(s.settled_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
