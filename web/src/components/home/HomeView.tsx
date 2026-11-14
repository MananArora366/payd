'use client';

import React from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits } from '@/lib/ledger';
import { getGroupEmoji } from '@/lib/icons';
import { Transaction } from '@/types/database';
import { Plus, Receipt, Coffee, Zap, Camera } from 'lucide-react';
import { CashFlowAnalyticsCard } from '@/components/analytics/CashFlowAnalyticsCard';
import { CategoryBreakdownCard } from '@/components/analytics/CategoryBreakdownCard';
import { RecurringBillsSection } from '@/components/recurring/RecurringBillsSection';
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
  onOpenReceiptScanner: () => void;
  onOpenRoulette?: () => void;
  onOpenCareemPay?: () => void;
  onSelectTransaction: (txn: Transaction) => void;
  onNavigateTab: (tab: string) => void;
  /** Open the Groups tab with this group selected. Falls back to plain tab navigation. */
  onOpenGroup?: (groupId: string) => void;
}

export function HomeView({
  onOpenAddExpense,
  onOpenReceiptScanner,
  onOpenRoulette,
  onOpenCareemPay,
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

  // Category emoji map helper
  const getCategoryEmoji = (catName?: string) => {
    const lower = (catName || '').toLowerCase();
    if (lower.includes('food') || lower.includes('dining') || lower.includes('restaurant')) return '🍣';
    if (lower.includes('grocer')) return '🛒';
    if (lower.includes('utility') || lower.includes('bill') || lower.includes('electricity') || lower.includes('wifi')) return '⚡';
    if (lower.includes('transport') || lower.includes('careem') || lower.includes('taxi')) return '🚗';
    if (lower.includes('coffee')) return '☕';
    if (lower.includes('travel') || lower.includes('flight')) return '✈️';
    if (lower.includes('entertainment') || lower.includes('movie')) return '🎬';
    return '💳';
  };

  return (
    <div className="space-y-6 pb-28">
      {/* ─── Hero Balance Card (Matching iOS Prototype) ──────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-silver-hero p-6 text-white">
        <div className="balance-label font-heading text-[11px] text-silver-100 tracking-wider mb-2">
          Total net balance
        </div>

        <div className="flex items-baseline gap-2 font-body">
          <span className="text-3xl sm:text-4xl font-bold tracking-tight">
            {userNetBalance > 0 ? '+' : userNetBalance < 0 ? '-' : ''}
            {formatMinorUnits(Math.abs(userNetBalance), currentUser.default_currency).replace(/^[A-Z]{3}\s*/, '')}
          </span>
          <span className="text-sm font-bold text-silver-100">{currentUser.default_currency}</span>
        </div>

        <div className="text-xs text-white/80 mt-1 font-body">
          {heroSubtitle}
        </div>

        {/* Divider */}
        <div className="h-px bg-white/20 my-4" />

        {/* Metrics Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 font-body">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] inline-block" />
            <div>
              <div className="text-[10px] text-white/70 uppercase tracking-wider font-semibold">Owed to you</div>
              <div className="text-sm font-bold text-white">
                +{formatMinorUnits(userOwedToMe, currentUser.default_currency)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F43F5E] inline-block" />
            <div>
              <div className="text-[10px] text-white/70 uppercase tracking-wider font-semibold">You owe</div>
              <div className="text-sm font-bold text-white">
                -{formatMinorUnits(userIOwe, currentUser.default_currency)}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Action CTA Buttons */}
        <div className="flex gap-2.5 mt-5 font-body">
          <button
            onClick={() => onOpenAddExpense('expense')}
            className="flex-1 h-11 rounded-xl bg-white hover:bg-zinc-100 text-silver-800 font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Add Expense</span>
          </button>

          <button
            onClick={() => (onOpenCareemPay ? onOpenCareemPay() : onNavigateTab('settlements'))}
            className="flex-1 h-11 rounded-xl bg-white/15 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-2 border border-white/20 transition active:scale-95"
          >
            <Zap className="w-4 h-4 fill-current text-[#00ea80]" />
            <span>Careem Settle</span>
          </button>
        </div>
      </div>

      {/* ─── Active Groups Horizontal Carousel ──────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between mb-3 px-1">
          <span className="font-heading text-xs text-zinc-400">Active groups</span>
          <button
            onClick={() => onNavigateTab('groups')}
            className="font-body text-xs font-bold text-silver-400 hover:text-silver-300 transition"
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
                className="flex-none w-[220px] sm:w-[240px] bg-[#18181b] hover:bg-[#202024] border border-white/8 hover:border-silver-500/40 rounded-2xl p-4 snap-start cursor-pointer transition-all duration-200 active:scale-95 shadow-lg"
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-2xl">{getGroupEmoji(group.name)}</span>
                  {userBal > 0 ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-bold">
                      +{formatMinorUnits(userBal, group.currency)}
                    </span>
                  ) : userBal < 0 ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-[11px] font-bold">
                      -{formatMinorUnits(Math.abs(userBal), group.currency)}
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-silver-500/15 text-silver-400 text-[11px] font-bold">
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
                  <span className="text-xs font-bold text-white">
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
            <div className="text-[10px] sm:text-[11px] text-amber-400 font-body mt-0.5">Who pays coffee?</div>
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
            <div className="text-[10px] sm:text-[11px] text-emerald-400 font-body mt-0.5">Split a receipt</div>
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
            className="font-body text-xs font-bold text-silver-400 hover:text-silver-300 transition"
          >
            See all &rarr;
          </button>
        </div>

        <div className="space-y-2.5">
          {recentTransactions.length === 0 ? (
            <div className="p-8 text-center bg-[#18181b] border border-white/8 rounded-2xl">
              <Receipt className="w-8 h-8 text-zinc-500 mx-auto mb-2 opacity-50" />
              <p className="font-heading text-sm text-white">No expenses recorded yet</p>
              <p className="text-xs text-zinc-400 mt-1 font-body">Tap the center microphone or Add Expense to start.</p>
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
                  className="flex items-center gap-3 p-3.5 bg-[#18181b] hover:bg-[#202024] border border-white/8 hover:border-silver-500/40 rounded-2xl cursor-pointer transition-all duration-150 active:scale-[0.99] shadow-sm"
                >
                  {/* Category icon box with soft tinted background */}
                  <div className="w-11 h-11 rounded-xl bg-silver-500/10 flex items-center justify-center text-xl shrink-0">
                    {getCategoryEmoji(cat?.name)}
                  </div>

                  <div className="font-body min-w-0 flex-1">
                    <div className="font-bold text-sm text-white truncate">{t.title}</div>
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
                    <div className={`text-sm font-bold ${isIncome ? 'text-[#10B981]' : 'text-white'}`}>
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
