'use client';

import React from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits } from '@/lib/ledger';
import { getCategoryIcon } from '@/lib/icons';
import { Transaction } from '@/types/database';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  Plus,
  Receipt,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  CreditCard,
  HandCoins,
  Camera,
  Coffee,
  Zap,
  Cpu,
} from 'lucide-react';
import { CashFlowAnalyticsCard } from '@/components/analytics/CashFlowAnalyticsCard';
import { CategoryBreakdownCard } from '@/components/analytics/CategoryBreakdownCard';
import { RecurringBillsSection } from '@/components/recurring/RecurringBillsSection';
import { DemoTourBanner } from '@/components/home/DemoTourBanner';

interface HomeViewProps {
  onOpenAddExpense: (type?: 'expense' | 'income') => void;
  onOpenRecordSettlement: () => void;
  onOpenCreateGroup: () => void;
  onOpenReceiptScanner: () => void;
  onOpenRoulette?: () => void;
  onOpenCareemPay?: () => void;
  onOpenMcp?: () => void;
  onSelectTransaction: (txn: Transaction) => void;
  onNavigateTab: (tab: string) => void;
}

export function HomeView({
  onOpenAddExpense,
  onOpenRecordSettlement,
  onOpenCreateGroup,
  onOpenReceiptScanner,
  onOpenRoulette,
  onOpenCareemPay,
  onOpenMcp,
  onSelectTransaction,
  onNavigateTab,
}: HomeViewProps) {
  const {
    currentUser,
    users,
    groups,
    categories,
    transactions,
    splits,
    budgets,
    userNetBalance,
    userOwedToMe,
    userIOwe,
    userSpending,
    getGroupBalances,
    getGroupMembers,
  } = usePayd();

  const monthlyBudget = budgets.find((b) => b.user_id === currentUser.id && b.category_id === null);
  const budgetLimit = monthlyBudget ? monthlyBudget.limit_minor : 500000;
  const budgetPercent = Math.min(100, Math.round((userSpending.totalSpentMinor / (budgetLimit || 1)) * 100));

  const recentTransactions = transactions
    .filter((t) => !t.deleted_at)
    .slice(0, 6);

  // Group emojis map helper
  const getGroupEmoji = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('dubai') || lower.includes('trip') || lower.includes('beach')) return '🌴';
    if (lower.includes('apartment') || lower.includes('flat') || lower.includes('home')) return '🏙️';
    if (lower.includes('supper') || lower.includes('food') || lower.includes('dinner')) return '🍷';
    if (lower.includes('coffee') || lower.includes('cafe')) return '☕';
    return '👥';
  };

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
      {/* Careem Hackathon Showcase Banner */}
      <DemoTourBanner
        onOpenReceiptScanner={onOpenReceiptScanner}
        onOpenRoulette={() => (onOpenRoulette ? onOpenRoulette() : {})}
        onOpenMcp={() => (onOpenMcp ? onOpenMcp() : {})}
        onOpenCareemPay={() => (onOpenCareemPay ? onOpenCareemPay() : onOpenRecordSettlement())}
      />

      {/* ─── Hero Balance Card (Matching iOS Prototype) ──────────────────── */}
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#6D28D9] to-[#4C1D95] p-6 text-white shadow-2xl shadow-violet-900/40">
        <div className="balance-label font-heading text-[11px] text-[#C4B5FD] tracking-wider mb-2">
          TOTAL NET BALANCE
        </div>

        <div className="flex items-baseline gap-2 font-body">
          <span className="text-3xl sm:text-4xl font-bold tracking-tight">
            {userNetBalance >= 0 ? '+' : '-'}
            {formatMinorUnits(Math.abs(userNetBalance), currentUser.default_currency).replace(/^[A-Z]{3}\s*/, '')}
          </span>
          <span className="text-sm font-bold text-[#C4B5FD]">{currentUser.default_currency}</span>
        </div>

        <div className="text-xs text-white/80 mt-1 font-body">
          {userNetBalance > 0
            ? `You are owed net across ${groups.length} active groups`
            : userNetBalance < 0
            ? `You have pending liabilities across ${groups.length} active groups`
            : `All active group ledgers are fully balanced`}
        </div>

        {/* Divider */}
        <div className="h-px bg-white/20 my-4" />

        {/* Metrics Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 font-body">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] inline-block shadow-sm shadow-emerald-400/50" />
            <div>
              <div className="text-[10px] text-white/70 uppercase tracking-wider font-semibold">Owed to you</div>
              <div className="text-sm font-bold text-white">
                +{formatMinorUnits(userOwedToMe, currentUser.default_currency)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F43F5E] inline-block shadow-sm shadow-rose-400/50" />
            <div>
              <div className="text-[10px] text-white/70 uppercase tracking-wider font-semibold">You owe</div>
              <div className="text-sm font-bold text-white">
                -{formatMinorUnits(userIOwe, currentUser.default_currency)}
              </div>
            </div>
          </div>

          <div className="px-3 py-1 rounded-full bg-violet-500/30 text-violet-200 border border-violet-400/30 text-xs font-bold font-body">
            Instant Aani &bull; Zero Fee
          </div>
        </div>

        {/* Quick Action CTA Buttons */}
        <div className="flex gap-2.5 mt-5 font-body">
          <button
            onClick={() => onOpenAddExpense('expense')}
            className="flex-1 h-11 rounded-xl bg-white hover:bg-zinc-100 text-[#4C1D95] font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Add Expense</span>
          </button>

          <button
            onClick={() => (onOpenCareemPay ? onOpenCareemPay() : onNavigateTab('settlements'))}
            className="flex-1 h-11 rounded-xl bg-white/15 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-2 border border-white/20 backdrop-blur-sm transition active:scale-95"
          >
            <Zap className="w-4 h-4 fill-current text-[#00ea80]" />
            <span>Careem Settle</span>
          </button>
        </div>
      </div>

      {/* ─── Active Groups Horizontal Carousel ──────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between mb-3 px-1">
          <span className="font-heading text-xs text-zinc-400">ACTIVE GROUPS</span>
          <button
            onClick={() => onNavigateTab('groups')}
            className="font-body text-xs font-bold text-violet-400 hover:text-violet-300 transition"
          >
            See all ({groups.length}) &rarr;
          </button>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none">
          {groups.map((group) => {
            const balances = getGroupBalances(group.id);
            const userBal = balances[currentUser.id] || 0;
            const members = getGroupMembers(group.id);
            const groupSpend = transactions
              .filter((t) => t.group_id === group.id && !t.deleted_at)
              .reduce((sum, t) => sum + t.amount_minor, 0);

            return (
              <div
                key={group.id}
                onClick={() => onNavigateTab('groups')}
                className="flex-none w-[220px] sm:w-[240px] bg-[#18181b] hover:bg-[#202024] border border-white/8 hover:border-violet-500/40 rounded-[20px] p-4 snap-start cursor-pointer transition-all duration-200 active:scale-95 shadow-lg"
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
                    <span className="px-2.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 text-[11px] font-bold">
                      Settled
                    </span>
                  )}
                </div>

                <div className="font-heading text-sm text-white mb-1 truncate">
                  {group.name}
                </div>
                <div className="font-body text-xs text-zinc-400 line-clamp-1">
                  {group.description || `${members.length} members &bull; ${group.currency} Ledger`}
                </div>

                <div className="flex items-baseline justify-between mt-3 pt-2.5 border-t border-white/6 font-body">
                  <span className="text-[11px] text-zinc-400">{members.length} members</span>
                  <span className="text-xs font-bold text-white">
                    {formatMinorUnits(groupSpend, group.currency)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Careem Standout Fast Actions ────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="font-heading text-xs text-zinc-400">STANDOUT FEATURES</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {/* Payd Lens OCR */}
          <button
            onClick={onOpenReceiptScanner}
            className="p-3.5 rounded-2xl bg-[#18181b] hover:bg-[#222227] border border-white/8 hover:border-violet-500/40 transition text-left group active:scale-95 shadow-md"
          >
            <div className="w-8 h-8 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center mb-2 group-hover:scale-110 transition">
              <Camera className="w-4 h-4" />
            </div>
            <div className="text-xs font-heading text-white flex items-center gap-1">
              Payd Lens
              <span className="text-[9px] px-1 py-0.2 rounded bg-violet-600 text-white font-bold">OCR</span>
            </div>
            <div className="text-[10px] text-zinc-400 font-body mt-0.5">Apple + Gemini Vision</div>
          </button>

          {/* Careem Pay Aani */}
          <button
            onClick={() => (onOpenCareemPay ? onOpenCareemPay() : onOpenRecordSettlement())}
            className="p-3.5 rounded-2xl bg-[#18181b] hover:bg-[#222227] border border-white/8 hover:border-emerald-500/40 transition text-left group active:scale-95 shadow-md"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2 group-hover:scale-110 transition font-black">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <div className="text-xs font-heading text-white flex items-center gap-1">
              Careem Pay
              <span className="text-[9px] px-1 py-0.2 rounded bg-[#00ea80] text-black font-black">AANI</span>
            </div>
            <div className="text-[10px] text-emerald-400 font-body mt-0.5">Instant UAE settle</div>
          </button>

          {/* Fair Payer Coffee Roulette */}
          <button
            onClick={onOpenRoulette}
            className="p-3.5 rounded-2xl bg-[#18181b] hover:bg-[#222227] border border-white/8 hover:border-amber-500/40 transition text-left group active:scale-95 shadow-md"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-2 group-hover:scale-110 transition">
              <Coffee className="w-4 h-4" />
            </div>
            <div className="text-xs font-heading text-white flex items-center gap-1">
              Roulette
              <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500 text-black font-bold">GAME</span>
            </div>
            <div className="text-[10px] text-amber-400 font-body mt-0.5">Who pays coffee?</div>
          </button>

          {/* MCP Agent Console */}
          <button
            onClick={onOpenMcp}
            className="p-3.5 rounded-2xl bg-[#18181b] hover:bg-[#222227] border border-white/8 hover:border-cyan-500/40 transition text-left group active:scale-95 shadow-md"
          >
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center mb-2 group-hover:scale-110 transition">
              <Cpu className="w-4 h-4" />
            </div>
            <div className="text-xs font-heading text-white flex items-center gap-1">
              MCP Tools
              <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-600 text-white font-bold">AGENT</span>
            </div>
            <div className="text-[10px] text-cyan-400 font-body mt-0.5">Audit & simulate</div>
          </button>

          {/* Add Expense */}
          <button
            onClick={() => onOpenAddExpense('expense')}
            className="p-3.5 rounded-2xl bg-[#18181b] hover:bg-[#222227] border border-white/8 hover:border-violet-500/40 transition text-left group active:scale-95 shadow-md"
          >
            <div className="w-8 h-8 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center mb-2 group-hover:scale-110 transition">
              <Plus className="w-4 h-4 stroke-[3]" />
            </div>
            <div className="text-xs font-heading text-white">Add Expense</div>
            <div className="text-[10px] text-zinc-400 font-body mt-0.5">Shared or personal</div>
          </button>

          {/* Split Bill */}
          <button
            onClick={() => onOpenAddExpense('expense')}
            className="p-3.5 rounded-2xl bg-[#18181b] hover:bg-[#222227] border border-white/8 hover:border-violet-500/40 transition text-left group active:scale-95 shadow-md"
          >
            <div className="w-8 h-8 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center mb-2 group-hover:scale-110 transition">
              <Users className="w-4 h-4" />
            </div>
            <div className="text-xs font-heading text-white">Split Bill</div>
            <div className="text-[10px] text-zinc-400 font-body mt-0.5">Equal or custom</div>
          </button>

          {/* Record Settlement */}
          <button
            onClick={onOpenRecordSettlement}
            className="p-3.5 rounded-2xl bg-[#18181b] hover:bg-[#222227] border border-white/8 hover:border-violet-500/40 transition text-left group active:scale-95 shadow-md"
          >
            <div className="w-8 h-8 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center mb-2 group-hover:scale-110 transition">
              <HandCoins className="w-4 h-4" />
            </div>
            <div className="text-xs font-heading text-white">Settlement</div>
            <div className="text-[10px] text-zinc-400 font-body mt-0.5">Record repayment</div>
          </button>

          {/* New Group */}
          <button
            onClick={onOpenCreateGroup}
            className="p-3.5 rounded-2xl bg-[#18181b] hover:bg-[#222227] border border-white/8 hover:border-violet-500/40 transition text-left group active:scale-95 shadow-md"
          >
            <div className="w-8 h-8 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center mb-2 group-hover:scale-110 transition">
              <Users className="w-4 h-4" />
            </div>
            <div className="text-xs font-heading text-white">New Group</div>
            <div className="text-[10px] text-zinc-400 font-body mt-0.5">Trip, home, or flat</div>
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
          <span className="font-heading text-xs text-zinc-400">RECENT EXPENSES</span>
          <button
            onClick={() => onNavigateTab('transactions')}
            className="font-body text-xs font-bold text-violet-400 hover:text-violet-300 transition"
          >
            See all &rarr;
          </button>
        </div>

        <div className="space-y-2.5">
          {recentTransactions.length === 0 ? (
            <div className="p-8 text-center bg-[#18181b] border border-white/8 rounded-3xl">
              <Receipt className="w-8 h-8 text-zinc-500 mx-auto mb-2 opacity-50" />
              <p className="font-heading text-sm text-white">No expenses recorded yet</p>
              <p className="text-xs text-zinc-400 mt-1 font-body">Tap the center microphone or Add Expense to start.</p>
            </div>
          ) : (
            recentTransactions.map((t) => {
              const cat = categories.find((c) => c.id === t.category_id);
              const payer = users.find((u) => u.id === t.payer_id);
              const isPayer = payer?.id === currentUser.id;

              // Calculate current user's share if split
              const mySplit = splits.find((s) => s.transaction_id === t.id && s.user_id === currentUser.id);
              const myShareMinor = mySplit ? mySplit.share_minor : t.amount_minor;

              return (
                <div
                  key={t.id}
                  onClick={() => onSelectTransaction(t)}
                  className="flex items-center gap-3 p-3.5 bg-[#18181b] hover:bg-[#202024] border border-white/8 hover:border-violet-500/40 rounded-2xl cursor-pointer transition-all duration-150 active:scale-[0.99] shadow-sm"
                >
                  {/* Category icon box with soft tinted background */}
                  <div className="w-11 h-11 rounded-xl bg-violet-500/10 flex items-center justify-center text-xl shrink-0">
                    {getCategoryEmoji(cat?.name)}
                  </div>

                  <div className="font-body min-w-0 flex-1">
                    <div className="font-bold text-sm text-white truncate">{t.title}</div>
                    <div className="text-xs text-zinc-400 mt-0.5 truncate">
                      {isPayer ? 'Paid by you' : `Paid by ${payer?.name || 'Unknown'}`} &bull;{' '}
                      {new Date(t.occurred_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </div>

                  <div className="text-right font-body shrink-0">
                    <div className="text-sm font-bold text-white">
                      {formatMinorUnits(t.amount_minor, t.currency)}
                    </div>
                    <div
                      className={`text-[11px] font-medium mt-0.5 ${
                        isPayer ? 'text-[#10B981]' : 'text-[#F43F5E]'
                      }`}
                    >
                      {isPayer
                        ? `Your share: ${formatMinorUnits(myShareMinor, t.currency)}`
                        : `You owe: ${formatMinorUnits(myShareMinor, t.currency)}`}
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
