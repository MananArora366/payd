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
  Zap,
  Share2,
  Check,
  Sparkles,
} from 'lucide-react';
import { getPaymentMethodIcon } from '@/lib/icons';

interface SettlementsViewProps {
  onOpenRecordSettlement: (params?: { senderId?: string; recipientId?: string; amountMinor?: number }) => void;
  onOpenCareemPay?: (params?: {
    senderId?: string;
    recipientId?: string;
    amountMinor?: number;
    reference?: string;
    groupId?: string | null;
  }) => void;
}

export function SettlementsView({ onOpenRecordSettlement, onOpenCareemPay }: SettlementsViewProps) {
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
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);

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

  const triggerToast = (msg: string) => {
    setNotificationMsg(msg);
    setTimeout(() => setNotificationMsg(null), 3000);
  };

  const totalVolume = userOwedToMe + userIOwe;

  return (
    <div className="space-y-6 pb-28">
      {/* Toast notification */}
      {notificationMsg && (
        <div className="fixed top-20 right-4 z-50 bg-[#18181b] border border-violet-500/60 text-white px-4 py-2.5 rounded-2xl shadow-2xl text-xs font-body flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-xl sm:text-2xl text-white tracking-wide">SETTLEMENTS LEDGER</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-heading border border-emerald-500/30">
              Algorithm Active
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1 font-body">
            Deterministic debt simplification & zero transaction fee Careem Pay settlements
          </p>
        </div>

        <button
          onClick={() => onOpenRecordSettlement()}
          className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white font-heading text-xs tracking-wider flex items-center gap-2 shadow-lg shadow-violet-600/30 transition active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Record Settlement</span>
        </button>
      </div>

      {/* ─── Debt Minimization Engine Hero Card (Matching iOS Prototype) ─── */}
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#4C1D95] to-[#2E1065] p-6 text-white shadow-xl shadow-purple-950/50">
        <div className="font-heading text-[11px] text-[#C4B5FD] tracking-wider mb-2">
          DEBT MINIMIZATION ENGINE
        </div>

        <div className="flex items-baseline justify-between mt-3 font-body">
          <div>
            <div className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              8 &rarr; 3
            </div>
            <div className="text-xs text-[#C4B5FD] mt-0.5">Transfers Eliminated (62.5% reduction)</div>
          </div>

          <div className="text-right">
            <div className="text-xl sm:text-2xl font-bold text-[#10B981]">
              {formatMinorUnits(totalVolume, currentUser.default_currency)}
            </div>
            <div className="text-[11px] text-white/70">Pending Volume</div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div
          onClick={() => setActiveTab('owed_to_me')}
          className={`p-5 rounded-2xl border cursor-pointer transition shadow-md ${
            activeTab === 'owed_to_me'
              ? 'bg-[#202028] border-emerald-500 ring-2 ring-emerald-500/20'
              : 'bg-[#18181b] border-white/8 hover:border-white/20'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-heading tracking-wider text-emerald-400">
            <ArrowDownLeft className="w-4 h-4" />
            <span>OWED TO YOU</span>
          </div>
          <div className="text-2xl font-bold text-white mt-2 font-body">
            +{formatMinorUnits(userOwedToMe, currentUser.default_currency)}
          </div>
          <p className="text-[11px] text-zinc-400 mt-1 font-body">
            {peopleWhoOweMe.length} {peopleWhoOweMe.length === 1 ? 'person owes' : 'people owe'} you
          </p>
        </div>

        <div
          onClick={() => setActiveTab('i_owe')}
          className={`p-5 rounded-2xl border cursor-pointer transition shadow-md ${
            activeTab === 'i_owe'
              ? 'bg-[#202028] border-rose-500 ring-2 ring-rose-500/20'
              : 'bg-[#18181b] border-white/8 hover:border-white/20'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-heading tracking-wider text-rose-400">
            <ArrowUpRight className="w-4 h-4" />
            <span>YOU OWE</span>
          </div>
          <div className="text-2xl font-bold text-white mt-2 font-body">
            -{formatMinorUnits(userIOwe, currentUser.default_currency)}
          </div>
          <p className="text-[11px] text-zinc-400 mt-1 font-body">
            You owe {peopleIOwe.length} {peopleIOwe.length === 1 ? 'person' : 'people'}
          </p>
        </div>
      </div>

      {/* Tab Switcher & Person Breakdown */}
      <div className="space-y-4">
        <div className="flex border-b border-white/8">
          <button
            onClick={() => setActiveTab('owed_to_me')}
            className={`pb-3 text-xs font-heading tracking-wider transition border-b-2 mr-6 ${
              activeTab === 'owed_to_me'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            OWED TO YOU ({peopleWhoOweMe.length})
          </button>
          <button
            onClick={() => setActiveTab('i_owe')}
            className={`pb-3 text-xs font-heading tracking-wider transition border-b-2 ${
              activeTab === 'i_owe'
                ? 'border-rose-500 text-rose-400'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            YOU OWE ({peopleIOwe.length})
          </button>
        </div>

        {/* ─── List of Settle Cards matching iOS Prototype ───────────── */}
        <div className="space-y-3 font-body">
          {activeTab === 'owed_to_me' ? (
            peopleWhoOweMe.length === 0 ? (
              <div className="p-10 text-center bg-[#18181b] border border-white/8 rounded-3xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-60" />
                <h4 className="font-heading text-sm text-white">No pending receivables!</h4>
                <p className="text-xs text-zinc-400 mt-1 font-body">None of your friends owe you money right now.</p>
              </div>
            ) : (
              peopleWhoOweMe.map(({ user, amountMinor }) => (
                <div
                  key={user.id}
                  className="p-5 bg-[#18181b] border border-white/8 hover:border-violet-500/40 rounded-2xl shadow-md transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center font-bold text-sm text-white shrink-0">
                      {user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-white truncate">
                        {user.name} <span className="text-zinc-400 font-normal italic">owes</span> You
                      </div>
                      <div className="text-xs text-zinc-400 truncate mt-0.5">
                        Group settlement &bull; {user.email}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-[#10B981]">
                        +{formatMinorUnits(amountMinor, currentUser.default_currency)}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4 pt-3 border-t border-white/6">
                    <button
                      onClick={() => triggerToast(`Reminder link copied for ${user.name} via WhatsApp!`)}
                      className="flex-1 py-2 rounded-xl bg-[#27272a] hover:bg-[#3f3f46] text-zinc-200 text-xs font-bold transition active:scale-95"
                    >
                      Send Reminder
                    </button>

                    {onOpenCareemPay && (
                      <button
                        onClick={() =>
                          onOpenCareemPay({
                            senderId: user.id,
                            recipientId: currentUser.id,
                            amountMinor,
                            reference: `Settlement from ${user.name}`,
                          })
                        }
                        className="flex-1 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Careem QR</span>
                      </button>
                    )}

                    <button
                      onClick={() =>
                        onOpenRecordSettlement({
                          senderId: user.id,
                          recipientId: currentUser.id,
                          amountMinor,
                        })
                      }
                      className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs shadow-md shadow-violet-600/30 transition active:scale-95"
                    >
                      Mark Received
                    </button>
                  </div>
                </div>
              ))
            )
          ) : peopleIOwe.length === 0 ? (
            <div className="p-10 text-center bg-[#18181b] border border-white/8 rounded-3xl">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-60" />
              <h4 className="font-heading text-sm text-white">You are completely debt-free!</h4>
              <p className="text-xs text-zinc-400 mt-1 font-body">You don&apos;t owe any group members.</p>
            </div>
          ) : (
            peopleIOwe.map(({ user, amountMinor }) => (
              <div
                key={user.id}
                className="p-5 bg-[#18181b] border border-white/8 hover:border-violet-500/40 rounded-2xl shadow-md transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-rose-600 to-amber-600 flex items-center justify-center font-bold text-sm text-white shrink-0">
                    {user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-white truncate">
                      You <span className="text-zinc-400 font-normal italic">owe</span> {user.name}
                    </div>
                    <div className="text-xs text-zinc-400 truncate mt-0.5">
                      Group settlement &bull; {user.email}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-base font-bold text-[#F43F5E]">
                      -{formatMinorUnits(amountMinor, currentUser.default_currency)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/6 flex gap-2">
                  {onOpenCareemPay ? (
                    <button
                      onClick={() =>
                        onOpenCareemPay({
                          senderId: currentUser.id,
                          recipientId: user.id,
                          amountMinor,
                          reference: `Settlement to ${user.name}`,
                        })
                      }
                      className="flex-1 py-2.5 rounded-xl bg-white hover:bg-zinc-100 text-black font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
                    >
                      <Zap className="w-3.5 h-3.5 fill-current text-[#00ea80]" />
                      <span>Pay with Careem Pay ({formatMinorUnits(amountMinor, currentUser.default_currency)})</span>
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        onOpenRecordSettlement({
                          senderId: currentUser.id,
                          recipientId: user.id,
                          amountMinor,
                        })
                      }
                      className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs transition active:scale-95"
                    >
                      Record Repayment
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Completed Transfers Feed matching iOS Prototype */}
      <div className="space-y-3 pt-4 border-t border-white/8 font-body">
        <h3 className="font-heading text-xs text-zinc-400">
          COMPLETED TRANSFERS ({settlements.length})
        </h3>

        <div className="space-y-2">
          {settlements.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-400 bg-[#18181b] border border-white/8 rounded-2xl">
              No settlements recorded yet.
            </div>
          ) : (
            settlements.map((s) => {
              const sender = users.find((u) => u.id === s.sender_id);
              const recipient = users.find((u) => u.id === s.recipient_id);

              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 p-3.5 bg-[#18181b] border border-white/8 rounded-2xl text-xs shadow-sm"
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-white truncate">
                      {sender?.name} {sender?.id === currentUser.id ? '(You)' : ''} paid{' '}
                      {recipient?.name} {recipient?.id === currentUser.id ? '(You)' : ''}
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
                      {s.method} &bull; {s.reference || 'Settlement completed'}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-bold text-zinc-300">
                      {formatMinorUnits(s.amount_minor, s.currency)}
                    </div>
                    <div className="text-[10px] text-zinc-500">
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
