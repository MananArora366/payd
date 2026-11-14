'use client';

import React from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits } from '@/lib/ledger';
import { getGroupIcon, getCategoryIcon } from '@/lib/icons';
import { Transaction } from '@/types/database';
import { Receipt, Coffee, Camera, HandCoins, Split } from 'lucide-react';
import { CashFlowAnalyticsCard } from '@/components/analytics/CashFlowAnalyticsCard';
import { CategoryBreakdownCard } from '@/components/analytics/CategoryBreakdownCard';
import { RecurringBillsSection } from '@/components/recurring/RecurringBillsSection';
import { SettleUpCard } from './SettleUpCard';
import {
  getMyExpenseShareMinor,
  groupSpendMinor,
  isParticipant,
  sortByDateDesc,
} from '@/components/analytics/spendMath';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Activate on Enter/Space so clickable cards work from the keyboard. */
const onActivateKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
};

interface HomeViewProps {
  onOpenAddExpense: (type?: 'expense' | 'income') => void;
  /** Open the New split flow. */
  onOpenNewSplit: () => void;
  onOpenReceiptScanner: () => void;
  onOpenRoulette?: () => void;
  onSelectTransaction: (txn: Transaction) => void;
  onNavigateTab: (tab: string) => void;
  /** Open the Groups tab with this group selected. Falls back to plain tab navigation. */
  onOpenGroup?: (groupId: string) => void;
}

export function HomeView({
  onOpenAddExpense,
  onOpenNewSplit,
  onOpenReceiptScanner,
  onOpenRoulette,
  onSelectTransaction,
  onNavigateTab,
  onOpenGroup,
}: HomeViewProps) {
  const {
    currentUser,
    users,
    groups,
    categories,
    transactions,
    splits,
    userNetBalance,
    userOwedToMe,
    userIOwe,
    getGroupBalances,
    getGroupMembers,
  } = usePayd();

  const recentTransactions = sortByDateDesc(transactions.filter((t) => !t.deleted_at)).slice(0, 6);

  const openGroup = (groupId: string) => (onOpenGroup ? onOpenGroup(groupId) : onNavigateTab('groups'));

  const groupsLabel = plural(groups.length, 'active group', 'active groups');
  const heroSubtitle =
    userOwedToMe === 0 && userIOwe === 0 && userNetBalance === 0
      ? 'You are all settled up'
      : userNetBalance > 0
      ? `You are owed net across ${groupsLabel}`
      : userNetBalance < 0
      ? `You have pending liabilities across ${groupsLabel}`
      : `Your balances net out to zero across ${groupsLabel}`;


  return (
    <div className="space-y-6 pb-28">
      {/* ─── Net balance: the one figure that matters, with owed vs owe as a single bar ─── */}
      <div className="rounded-2xl bg-[#18181b] border border-white/8 p-6 text-white">
        <div className="font-body text-[13px] text-zinc-400 mb-2">Total net balance</div>

        <div className="flex items-baseline gap-2">
          <span
            className={`font-heading text-4xl font-medium tabular-nums ${
              userNetBalance > 0 ? 'text-brand-400' : userNetBalance < 0 ? 'text-rose-400' : 'text-white'
            }`}
          >
            {userNetBalance > 0 ? '+' : userNetBalance < 0 ? '-' : ''}
            {formatMinorUnits(Math.abs(userNetBalance), currentUser.default_currency).replace(/^[A-Z]{3}\s*/, '')}
          </span>
          <span className="font-body text-sm text-zinc-400">{currentUser.default_currency}</span>
        </div>

        <div className="font-body text-[13px] text-zinc-400 mt-1">{heroSubtitle}</div>

        {/* Owed vs owe, in proportion */}
        {(userOwedToMe > 0 || userIOwe > 0) && (
          <div className="flex h-1.5 gap-1 mt-5" aria-hidden="true">
            {userOwedToMe > 0 && <div className="rounded-full bg-brand-400" style={{ flexGrow: userOwedToMe }} />}
            {userIOwe > 0 && <div className="rounded-full bg-rose-400/70" style={{ flexGrow: userIOwe }} />}
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-3 mt-3 font-body">
          <div>
            <div className="text-xs text-zinc-400">Owed to you</div>
            <div className="text-sm text-white tabular-nums mt-0.5">
              +{formatMinorUnits(userOwedToMe, currentUser.default_currency)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-zinc-400">You owe</div>
            <div className="text-sm text-white tabular-nums mt-0.5">
              -{formatMinorUnits(userIOwe, currentUser.default_currency)}
            </div>
          </div>
        </div>

        {/* Primary action: settle up. Adding expenses is secondary. */}
        <div className="flex gap-2.5 mt-5 font-body">
          <button
            onClick={() => onNavigateTab('settlements')}
            className="flex-[3] h-12 rounded-xl bg-brand-400 hover:bg-brand-300 text-zinc-950 font-heading font-medium text-sm flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
          >
            <HandCoins className="w-4 h-4" />
            <span>Settle up</span>
          </button>

          <button
            onClick={onOpenNewSplit}
            className="flex-[2] h-12 rounded-xl bg-[#27272a] hover:bg-[#3f3f46] text-white font-heading font-medium text-sm flex items-center justify-center gap-2 border border-white/8 transition-colors active:scale-[0.98]"
          >
            <Split className="w-4 h-4" />
            <span>New split</span>
          </button>
        </div>
      </div>

      {/* ─── Settle up: the core flow ──────────────────────────────────── */}
      <SettleUpCard onOpenSettleUp={() => onNavigateTab('settlements')} />

      {/* ─── Active Groups Horizontal Carousel ──────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between mb-3 px-1">
          <span className="font-heading text-xs text-zinc-400">Active groups</span>
          <button
            onClick={() => onNavigateTab('groups')}
            className="font-body text-xs font-semibold text-brand-400 hover:text-brand-300 transition"
          >
            See all ({groups.length}) &rarr;
          </button>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none">
          {groups.map((group) => {
            const balances = getGroupBalances(group.id);
            const userBal = balances[currentUser.id] || 0;
            const members = getGroupMembers(group.id);
            const groupSpend = groupSpendMinor(group.id, transactions);
            const membersLabel = plural(members.length, 'member', 'members');

            return (
              <div
                key={group.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${group.name}`}
                onClick={() => openGroup(group.id)}
                onKeyDown={onActivateKey(() => openGroup(group.id))}
                className="flex-none w-[220px] sm:w-[240px] bg-[#18181b] hover:bg-[#202024] border border-white/8 hover:border-brand-500/40 rounded-2xl p-4 snap-start cursor-pointer transition duration-200 active:scale-95 shadow-lg"
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span className="w-9 h-9 shrink-0 rounded-xl bg-[#27272a] text-zinc-300 flex items-center justify-center">{getGroupIcon(group.name, 'w-[18px] h-[18px]')}</span>
                  {userBal > 0 ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-semibold">
                      +{formatMinorUnits(userBal, group.currency)}
                    </span>
                  ) : userBal < 0 ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-[11px] font-semibold">
                      -{formatMinorUnits(Math.abs(userBal), group.currency)}
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-brand-500/15 text-brand-400 text-[11px] font-semibold">
                      Settled
                    </span>
                  )}
                </div>

                <div className="font-heading text-sm text-white mb-1 truncate">
                  {group.name}
                </div>
                <div className="font-body text-xs text-zinc-400 line-clamp-1">
                  {group.description || `${membersLabel} • ${group.currency} ledger`}
                </div>

                <div className="flex items-baseline justify-between mt-3 pt-2.5 border-t border-white/6 font-body">
                  <span className="text-[11px] text-zinc-400">{membersLabel}</span>
                  <span className="text-xs font-semibold text-white">
                    {formatMinorUnits(groupSpend, group.currency)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Quick Actions ────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="font-heading text-xs text-zinc-400">Quick actions</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {/* Fair Payer Coffee Roulette */}
          <button
            onClick={onOpenRoulette}
            className="p-3.5 sm:p-4 rounded-2xl bg-[#18181b] hover:bg-[#222227] border border-white/8 hover:border-amber-500/40 transition text-left group active:scale-95 shadow-md"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-2 transition">
              <Coffee className="w-4 h-4" />
            </div>
            <div className="text-xs font-heading text-white flex items-center gap-1">
              Roulette
            </div>
            <div className="text-[11px] sm:text-[11px] text-amber-400 font-body mt-0.5">Who pays coffee?</div>
          </button>

          {/* Payd Lens receipt scanner */}
          <button
            onClick={onOpenReceiptScanner}
            className="p-3.5 sm:p-4 rounded-2xl bg-[#18181b] hover:bg-[#222227] border border-white/8 hover:border-emerald-500/40 transition text-left group active:scale-95 shadow-md"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2 transition">
              <Camera className="w-4 h-4" />
            </div>
            <div className="text-xs font-heading text-white flex items-center gap-1">
              Payd Lens
            </div>
            <div className="text-[11px] sm:text-[11px] text-emerald-400 font-body mt-0.5">Split a receipt</div>
          </button>
        </div>
      </div>

      {/* ─── Cash Flow Health & Reimbursement Lag Analytics ─────────────── */}
      <CashFlowAnalyticsCard onNavigateSettlements={() => onNavigateTab('settlements')} />

      {/* ─── Spending Sectors & Daily Runway ─────────────────────────────── */}
      <CategoryBreakdownCard onNavigateTransactions={() => onNavigateTab('transactions')} />

      {/* ─── Shared Subscriptions & Recurring Bills ──────────────────────── */}
      <RecurringBillsSection />

      {/* ─── Recent Expenses (Matching iOS Prototype) ───────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="font-heading text-xs text-zinc-400">Recent activity</span>
          <button
            onClick={() => onNavigateTab('transactions')}
            className="font-body text-xs font-semibold text-brand-400 hover:text-brand-300 transition"
          >
            See all &rarr;
          </button>
        </div>

        <div className="space-y-2.5">
          {recentTransactions.length === 0 ? (
            <div className="p-8 text-center bg-[#18181b] border border-white/8 rounded-2xl">
              <Receipt className="w-8 h-8 text-zinc-500 mx-auto mb-2 opacity-50" />
              <p className="font-heading text-sm text-white">No expenses recorded yet</p>
              <p className="text-xs text-zinc-400 mt-1 font-body">Tap the center microphone or New split to start.</p>
            </div>
          ) : (
            recentTransactions.map((t) => {
              const cat = categories.find((c) => c.id === t.category_id);
              const payer = users.find((u) => u.id === t.payer_id);
              const isPayer = t.payer_id === currentUser.id;
              const isIncome = t.type === 'income';
              const myShareMinor = getMyExpenseShareMinor(t, currentUser.id, splits);
              const amIInSplit = isParticipant(t, currentUser.id, splits);

              // What this entry means for me, in one short line.
              let shareText: string;
              let shareClass: string;
              if (isIncome) {
                shareText = isPayer ? 'Income' : `Income · ${payer?.name || 'someone else'}`;
                shareClass = 'text-[#10B981]';
              } else if (t.type !== 'expense') {
                shareText = t.type.charAt(0).toUpperCase() + t.type.slice(1);
                shareClass = 'text-zinc-400';
              } else if (isPayer) {
                shareText =
                  myShareMinor > 0
                    ? `Your share: ${formatMinorUnits(myShareMinor, t.currency)}`
                    : 'You paid for others';
                shareClass = 'text-[#10B981]';
              } else if (amIInSplit && myShareMinor > 0) {
                shareText = `You owe: ${formatMinorUnits(myShareMinor, t.currency)}`;
                shareClass = 'text-[#F43F5E]';
              } else {
                shareText = 'Not in your split';
                shareClass = 'text-zinc-500';
              }

              return (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectTransaction(t)}
                  onKeyDown={onActivateKey(() => onSelectTransaction(t))}
                  className="flex items-center gap-3 p-3.5 bg-[#18181b] hover:bg-[#202024] border border-white/8 hover:border-brand-500/40 rounded-2xl cursor-pointer transition duration-150 active:scale-[0.99] shadow-sm"
                >
                  {/* Category icon box with soft tinted background */}
                  <div className="w-11 h-11 rounded-xl bg-[#27272a] text-zinc-300 flex items-center justify-center shrink-0">
                    {getCategoryIcon(cat?.icon, 'w-[18px] h-[18px]')}
                  </div>

                  <div className="font-body min-w-0 flex-1">
                    <div className="font-semibold text-sm text-white truncate">{t.title}</div>
                    <div className="text-xs text-zinc-400 mt-0.5 truncate">
                      {isIncome
                        ? isPayer
                          ? 'Received by you'
                          : `Received by ${payer?.name || 'Unknown'}`
                        : isPayer
                        ? 'Paid by you'
                        : `Paid by ${payer?.name || 'Unknown'}`}{' '}
                      &bull;{' '}
                      {new Date(t.occurred_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </div>

                  <div className="text-right font-body shrink-0">
                    <div className={`text-sm font-semibold ${isIncome ? 'text-[#10B981]' : 'text-white'}`}>
                      {isIncome ? '+' : ''}
                      {formatMinorUnits(t.amount_minor, t.currency)}
                    </div>
                    <div className={`text-[11px] font-medium mt-0.5 ${shareClass}`}>{shareText}</div>
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
