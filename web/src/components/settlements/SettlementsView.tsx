'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits, summarizeDebtSimplification, PairDebtComponent } from '@/lib/ledger';
import { careemPayLink, careemPayTag } from '@/lib/mcp/careemPayLink';
import type { User } from '@/types/database';
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
} from 'lucide-react';
import { getPaymentMethodIcon } from '@/lib/icons';

interface SettleParams {
  senderId?: string;
  recipientId?: string;
  amountMinor?: number;
  groupId?: string | null;
}

interface SettlementsViewProps {
  onOpenRecordSettlement: (params?: SettleParams) => void;
  onOpenCareemPay?: (params?: SettleParams & { reference?: string }) => void;
}

const CURRENCY = 'AED'; // AED-only ledger

interface PersonDebt {
  user: User;
  /** Net amount across all groups (always > 0 in the list it belongs to). */
  amountMinor: number;
  /** Per-group pieces; each can point either way. They net to amountMinor. */
  components: PairDebtComponent[];
}

export function SettlementsView({ onOpenRecordSettlement, onOpenCareemPay }: SettlementsViewProps) {
  const {
    currentUser,
    users,
    groups,
    transactions,
    splits,
    settlements,
    userOwedToMe,
    userIOwe,
    bilateralDebts,
    getPairDebtBreakdown,
  } = usePayd();

  const [activeTab, setActiveTab] = useState<'owed_to_me' | 'i_owe'>('owed_to_me');
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const groupName = (gid: string | null) =>
    gid ? groups.find((g) => g.id === gid)?.name || 'a group' : 'Personal (no group)';

  // Unified, netted debts for currentUser (same model as Home and the Groups tab).
  const peopleWhoOweMe: PersonDebt[] = [];
  const peopleIOwe: PersonDebt[] = [];
  for (const u of users) {
    if (u.id === currentUser.id) continue;
    const theyOwe = bilateralDebts.get(u.id)?.get(currentUser.id) || 0;
    const iOwe = bilateralDebts.get(currentUser.id)?.get(u.id) || 0;
    if (theyOwe <= 0 && iOwe <= 0) continue;
    const components = getPairDebtBreakdown(currentUser.id, u.id);
    if (theyOwe > 0) peopleWhoOweMe.push({ user: u, amountMinor: theyOwe, components });
    if (iOwe > 0) peopleIOwe.push({ user: u, amountMinor: iOwe, components });
  }
  peopleWhoOweMe.sort((a, b) => b.amountMinor - a.amountMinor);
  peopleIOwe.sort((a, b) => b.amountMinor - a.amountMinor);

  const { beforeTransfers, afterTransfers } = useMemo(
    () => summarizeDebtSimplification(transactions, splits, settlements),
    [transactions, splits, settlements]
  );
  const saved = Math.max(0, beforeTransfers - afterTransfers);
  const reductionPct = beforeTransfers > 0 ? Math.round((saved / beforeTransfers) * 1000) / 10 : 0;

  const sortedSettlements = [...settlements].sort(
    (a, b) => new Date(b.settled_at).getTime() - new Date(a.settled_at).getTime()
  );

  const triggerToast = (msg: string) => {
    setNotificationMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotificationMsg(null), 3000);
  };

  const sendReminder = async (person: PersonDebt) => {
    const link = careemPayLink(careemPayTag(currentUser.name), person.amountMinor);
    const firstName = person.user.name.split(' ')[0];
    const text =
      `Hi ${firstName}! Friendly reminder from Payd: you owe me ${formatMinorUnits(person.amountMinor, CURRENCY)}. ` +
      `You can pay me on Careem Pay here: ${link}`;
    try {
      await navigator.clipboard.writeText(text);
      triggerToast(`Reminder for ${firstName} copied. Paste it into WhatsApp or SMS.`);
    } catch {
      // Clipboard blocked: fall back to WhatsApp's share screen with the text pre-filled.
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      triggerToast(`Opened WhatsApp with a reminder for ${firstName}.`);
    }
  };

  const totalVolume = userOwedToMe + userIOwe;

  /** Action buttons for one single-group debt between currentUser and `other`. */
  const renderActions = (other: User, c: PairDebtComponent, compact: boolean) => {
    const theyPayMe = c.toUserId === currentUser.id;
    const params = {
      senderId: c.fromUserId,
      recipientId: c.toUserId,
      amountMinor: c.amountMinor,
      groupId: c.groupId,
    };
    const size = compact ? 'py-1.5 text-[11px]' : 'py-2 text-xs';
    if (theyPayMe) {
      return (
        <>
          {onOpenCareemPay && (
            <button
              onClick={() => onOpenCareemPay({ ...params, reference: `Settlement from ${other.name}` })}
              className={`flex-1 ${size} rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 font-bold flex items-center justify-center gap-1.5 transition active:scale-95`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Careem QR</span>
            </button>
          )}
          <button
            onClick={() => onOpenRecordSettlement(params)}
            className={`flex-1 ${size} rounded-xl bg-silver-600 hover:bg-silver-500 text-white font-bold transition active:scale-95`}
          >
            Mark Received
          </button>
        </>
      );
    }
    return (
      <>
        {onOpenCareemPay && (
          <button
            onClick={() => onOpenCareemPay({ ...params, reference: `Settlement to ${other.name}` })}
            className={`flex-1 ${size} rounded-xl bg-white hover:bg-zinc-100 text-black font-bold flex items-center justify-center gap-2 shadow-lg transition active:scale-95`}
          >
            <Zap className="w-3.5 h-3.5 fill-current text-[#00ea80]" />
            <span>Pay with Careem Pay ({formatMinorUnits(c.amountMinor, CURRENCY)})</span>
          </button>
        )}
        <button
          onClick={() => onOpenRecordSettlement(params)}
          className={`${onOpenCareemPay ? '' : 'flex-1 '}px-3 ${size} rounded-xl bg-silver-600 hover:bg-silver-500 text-white font-bold transition active:scale-95`}
        >
          Record Repayment
        </button>
      </>
    );
  };

  /** Single group -> one action row. Several groups -> one row per group so each group's balance stays right. */
  const renderSettleArea = (person: PersonDebt) => {
    const { user, components } = person;
    if (components.length <= 1) {
      const c = components[0];
      if (!c) return null;
      return (
        <>
          <div className="text-[11px] text-zinc-500 mt-3">{groupName(c.groupId)}</div>
          <div className="flex gap-2 mt-2">{renderActions(user, c, false)}</div>
        </>
      );
    }
    const mixed = new Set(components.map((c) => c.fromUserId)).size > 1;
    return (
      <div className="mt-3 space-y-2">
        <p className="text-[11px] text-zinc-400">
          This balance spans {components.length} groups
          {mixed ? ' and partly cancels out' : ''}. Settle each group separately so every group&apos;s balance stays
          accurate.
        </p>
        {components.map((c) => {
          const label =
            c.fromUserId === currentUser.id
              ? `You owe ${user.name.split(' ')[0]}`
              : `${user.name.split(' ')[0]} owes you`;
          return (
            <div key={c.groupId || 'personal'} className="p-2.5 rounded-xl bg-white/5 border border-white/6 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-300 truncate">
                  {groupName(c.groupId)} &bull; {label}
                </span>
                <span className={`font-bold ${c.fromUserId === currentUser.id ? 'text-[#F43F5E]' : 'text-[#10B981]'}`}>
                  {formatMinorUnits(c.amountMinor, CURRENCY)}
                </span>
              </div>
              <div className="flex gap-2">{renderActions(user, c, true)}</div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-28">
      {/* Toast notification */}
      {notificationMsg && (
        <div className="fixed top-20 right-4 z-50 bg-[#18181b] border border-silver-500/60 text-white px-4 py-2.5 rounded-2xl shadow-2xl text-xs font-body flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-xl sm:text-2xl text-white tracking-wide">Settlements ledger</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-heading border border-emerald-500/30">
              Algorithm Active
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1 font-body">
            Settle up in as few payments as possible, fee-free with Careem Pay
          </p>
        </div>

        <button
          onClick={() => onOpenRecordSettlement()}
          className="px-4 py-2.5 rounded-2xl bg-silver-100 hover:bg-white text-zinc-900 font-semibold text-sm flex items-center gap-2 transition active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Record Settlement</span>
        </button>
      </div>

      {/* ─── Debt Minimization Engine Hero Card (Matching iOS Prototype) ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-silver-hero p-6 text-white">
        <div className="font-heading text-[11px] text-silver-100 tracking-wider mb-2">
          Smart settle-up
        </div>

        <div className="flex items-baseline justify-between mt-3 font-body">
          <div>
            {beforeTransfers === 0 ? (
              <>
                <div className="text-3xl sm:text-4xl font-bold tracking-tight text-white">All square</div>
                <div className="text-xs text-silver-100 mt-0.5">No open debts to settle</div>
              </>
            ) : (
              <>
                <div className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
                  {beforeTransfers} &rarr; {afterTransfers}
                </div>
                <div className="text-xs text-silver-100 mt-0.5">
                  {saved > 0
                    ? `${saved} transfer${saved === 1 ? '' : 's'} eliminated (${reductionPct}% fewer)`
                    : 'Already the fewest transfers possible'}
                </div>
              </>
            )}
          </div>

          <div className="text-right">
            <div className="text-xl sm:text-2xl font-bold text-[#10B981]">
              {formatMinorUnits(totalVolume, CURRENCY)}
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
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
            <ArrowDownLeft className="w-4 h-4" />
            <span>Owed to you</span>
          </div>
          <div className="text-2xl font-bold text-white mt-2 font-body">
            +{formatMinorUnits(userOwedToMe, CURRENCY)}
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
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-400">
            <ArrowUpRight className="w-4 h-4" />
            <span>You owe</span>
          </div>
          <div className="text-2xl font-bold text-white mt-2 font-body">
            -{formatMinorUnits(userIOwe, CURRENCY)}
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
            className={`pb-3 text-sm font-semibold transition border-b-2 mr-6 ${
              activeTab === 'owed_to_me'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            OWED TO YOU ({peopleWhoOweMe.length})
          </button>
          <button
            onClick={() => setActiveTab('i_owe')}
            className={`pb-3 text-sm font-semibold transition border-b-2 ${
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
              <div className="p-10 text-center bg-[#18181b] border border-white/8 rounded-2xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-60" />
                <h4 className="font-heading text-sm text-white">No pending receivables!</h4>
                <p className="text-xs text-zinc-400 mt-1 font-body">None of your friends owe you money right now.</p>
              </div>
            ) : (
              peopleWhoOweMe.map((person) => {
                const { user, amountMinor } = person;
                return (
                <div
                  key={user.id}
                  className="p-5 bg-[#18181b] border border-white/8 hover:border-silver-500/40 rounded-2xl shadow-md transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-sky-700 flex items-center justify-center font-bold text-sm text-white shrink-0">
                      {user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-white truncate">
                        {user.name} <span className="text-zinc-400 font-normal italic">owes</span> You
                      </div>
                      <div className="text-xs text-zinc-400 truncate mt-0.5">{user.email}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-[#10B981]">
                        +{formatMinorUnits(amountMinor, CURRENCY)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/6">
                    <button
                      onClick={() => sendReminder(person)}
                      className="w-full py-2 rounded-xl bg-[#27272a] hover:bg-[#3f3f46] text-zinc-200 text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Copy Reminder</span>
                    </button>
                    {renderSettleArea(person)}
                  </div>
                </div>
                );
              })
            )
          ) : peopleIOwe.length === 0 ? (
            <div className="p-10 text-center bg-[#18181b] border border-white/8 rounded-2xl">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-60" />
              <h4 className="font-heading text-sm text-white">You are completely debt-free!</h4>
              <p className="text-xs text-zinc-400 mt-1 font-body">You don&apos;t owe any group members.</p>
            </div>
          ) : (
            peopleIOwe.map((person) => {
              const { user, amountMinor } = person;
              return (
              <div
                key={user.id}
                className="p-5 bg-[#18181b] border border-white/8 hover:border-silver-500/40 rounded-2xl shadow-md transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-rose-700 flex items-center justify-center font-bold text-sm text-white shrink-0">
                    {user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-white truncate">
                      You <span className="text-zinc-400 font-normal italic">owe</span> {user.name}
                    </div>
                    <div className="text-xs text-zinc-400 truncate mt-0.5">{user.email}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-base font-bold text-[#F43F5E]">
                      -{formatMinorUnits(amountMinor, CURRENCY)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/6">{renderSettleArea(person)}</div>
              </div>
              );
            })
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
            sortedSettlements.map((s) => {
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
                      {s.method} &bull; {s.group_id ? groupName(s.group_id) : 'No group'} &bull;{' '}
                      {s.reference || 'Settlement completed'}
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
