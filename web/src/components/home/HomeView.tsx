'use client';

import React, { useState } from 'react';
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
  PlusCircle,
  Receipt,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  CreditCard,
  HandCoins,
  CheckCircle2,
  Calendar,
  Camera,
} from 'lucide-react';

interface HomeViewProps {
  onOpenAddExpense: (type?: 'expense' | 'income') => void;
  onOpenRecordSettlement: () => void;
  onOpenCreateGroup: () => void;
  onOpenReceiptScanner: () => void;
  onSelectTransaction: (txn: Transaction) => void;
  onNavigateTab: (tab: string) => void;
}

export function HomeView({
  onOpenAddExpense,
  onOpenRecordSettlement,
  onOpenCreateGroup,
  onOpenReceiptScanner,
  onSelectTransaction,
  onNavigateTab,
}: HomeViewProps) {
  const {
    currentUser,
    users,
    categories,
    transactions,
    splits,
    budgets,
    userNetBalance,
    userOwedToMe,
    userIOwe,
    userSpending,
  } = usePayd();

  const monthlyBudget = budgets.find((b) => b.user_id === currentUser.id && b.category_id === null);
  const budgetLimit = monthlyBudget ? monthlyBudget.limit_minor : 500000;
  const budgetPercent = Math.min(100, Math.round((userSpending.totalSpentMinor / (budgetLimit || 1)) * 100));

  const recentTransactions = transactions
    .filter((t) => !t.deleted_at)
    .slice(0, 5);

  // Deterministic AI Insights engine
  const insights: string[] = [];
  if (budgetPercent > 80) {
    insights.push(`High budget utilization: You have spent ${budgetPercent}% of your monthly limit.`);
  } else {
    insights.push(`Healthy spending: You have utilized ${budgetPercent}% of your monthly ${formatMinorUnits(budgetLimit, currentUser.default_currency)} budget.`);
  }

  if (userOwedToMe > 0) {
    insights.push(`Pending receivables: Friends owe you ${formatMinorUnits(userOwedToMe, currentUser.default_currency)}. Check the Settlements tab to request or record settlements.`);
  } else if (userIOwe > 0) {
    insights.push(`Outstanding debt: You owe ${formatMinorUnits(userIOwe, currentUser.default_currency)} to group members.`);
  } else {
    insights.push(`All shared debts are completely balanced and settled.`);
  }

  // Top spending category
  const categorySpend: Record<string, number> = {};
  for (const t of transactions) {
    if (!t.deleted_at && t.type === 'expense') {
      const cat = categories.find((c) => c.id === t.category_id)?.name || 'Other';
      categorySpend[cat] = (categorySpend[cat] || 0) + t.amount_minor;
    }
  }
  const topCat = Object.entries(categorySpend).sort((a, b) => b[1] - a[1])[0];
  if (topCat) {
    insights.push(`Top spending sector: ${topCat[0]} accounts for ${formatMinorUnits(topCat[1], currentUser.default_currency)}.`);
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Top Welcome & Net Balance Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 border border-slate-800 p-6 text-white shadow-2xl">
        <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">
              <span>Personal Financial Pulse</span>
              <span>•</span>
              <span>{currentUser.name}&apos;s Workspace</span>
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              {formatMinorUnits(userSpending.netSavingsMinor, currentUser.default_currency)}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Net Savings this period ({formatMinorUnits(userSpending.totalIncomeMinor, currentUser.default_currency)} income - {formatMinorUnits(userSpending.totalSpentMinor, currentUser.default_currency)} personal spend)
            </p>
          </div>

          {/* Owed vs Owe pills & Scan button */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onOpenReceiptScanner}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-extrabold text-xs shadow-lg shadow-emerald-500/20 transition hover:scale-105 active:scale-95"
              title="Scan UAE receipt with Payd Lens"
            >
              <Camera className="w-4 h-4" />
              <span>Scan Receipt</span>
            </button>

            <div
              onClick={() => onNavigateTab('settlements')}
              className="cursor-pointer p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition backdrop-blur-md"
            >
              <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <ArrowDownLeft className="w-3.5 h-3.5" /> Owed to you
              </div>
              <div className="text-lg font-bold text-white mt-0.5">
                {formatMinorUnits(userOwedToMe, currentUser.default_currency)}
              </div>
            </div>

            <div
              onClick={() => onNavigateTab('settlements')}
              className="cursor-pointer p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition backdrop-blur-md"
            >
              <div className="text-[10px] font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" /> You owe
              </div>
              <div className="text-lg font-bold text-white mt-0.5">
                {formatMinorUnits(userIOwe, currentUser.default_currency)}
              </div>
            </div>
          </div>
        </div>

        {/* Monthly Budget Progress Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium">
              Monthly Budget Progress ({budgetPercent}%)
            </span>
            <span className="font-semibold text-slate-200">
              {formatMinorUnits(userSpending.totalSpentMinor, currentUser.default_currency)} / {formatMinorUnits(budgetLimit, currentUser.default_currency)}
            </span>
          </div>

          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                budgetPercent > 90
                  ? 'bg-rose-500'
                  : budgetPercent > 75
                  ? 'bg-amber-500'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-400'
              }`}
              style={{ width: `${budgetPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Deterministic AI Insights Card */}
      <div className="rounded-3xl bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
          <Sparkles className="w-4 h-4" />
          <span>Payd Financial Intelligence</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-normal">
            Deterministic Insights
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {insights.map((insight, idx) => (
            <div
              key={idx}
              className="p-3 bg-white dark:bg-slate-900/80 rounded-2xl border border-slate-200/60 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-start gap-2.5"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span>{insight}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Action Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Quick Actions</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <button
            onClick={onOpenReceiptScanner}
            className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-slate-900 border border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-500/15 transition text-left group relative overflow-hidden"
          >
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white w-fit mb-2 group-hover:scale-110 transition shadow-md shadow-emerald-500/20">
              <Camera className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
              Payd Lens
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500 text-white font-extrabold uppercase">
                AI
              </span>
            </div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Scan receipt OCR</div>
          </button>

          <button
            onClick={() => onOpenAddExpense('expense')}
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition text-left group"
          >
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 w-fit mb-2 group-hover:scale-105 transition">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Add Expense</div>
            <div className="text-[11px] text-slate-400">Personal or shared</div>
          </button>

          <button
            onClick={() => onOpenAddExpense('income')}
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-teal-500/50 hover:bg-teal-500/5 transition text-left group"
          >
            <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 w-fit mb-2 group-hover:scale-105 transition">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Add Income</div>
            <div className="text-[11px] text-slate-400">Salary & payouts</div>
          </button>

          <button
            onClick={() => onOpenAddExpense('expense')}
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 hover:bg-blue-500/5 transition text-left group"
          >
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 w-fit mb-2 group-hover:scale-105 transition">
              <Users className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Split Bill</div>
            <div className="text-[11px] text-slate-400">Equal or custom</div>
          </button>

          <button
            onClick={onOpenRecordSettlement}
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition text-left group"
          >
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 w-fit mb-2 group-hover:scale-105 transition">
              <HandCoins className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Record Settlement</div>
            <div className="text-[11px] text-slate-400">Repay or collect</div>
          </button>

          <button
            onClick={onOpenCreateGroup}
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition text-left group"
          >
            <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 w-fit mb-2 group-hover:scale-105 transition">
              <Users className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Create Group</div>
            <div className="text-[11px] text-slate-400">Trip, flat, or team</div>
          </button>
        </div>
      </div>

      {/* Recent Transactions Feed */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Recent Transactions</h3>
          <button
            onClick={() => onNavigateTab('transactions')}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
          >
            <span>View all</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-2">
          {recentTransactions.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
              <Receipt className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">No transactions recorded yet</p>
              <p className="text-xs text-slate-400 mt-1">Use voice or tap Add Expense to start tracking.</p>
            </div>
          ) : (
            recentTransactions.map((t) => {
              const cat = categories.find((c) => c.id === t.category_id);
              const payer = users.find((u) => u.id === t.payer_id);
              const isIncome = t.type === 'income';

              return (
                <div
                  key={t.id}
                  onClick={() => onSelectTransaction(t)}
                  className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 rounded-2xl flex items-center justify-between cursor-pointer transition shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {getCategoryIcon(cat?.icon, 'w-4 h-4')}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                        {t.title}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>{cat?.name}</span>
                        <span>•</span>
                        <span>Paid by {payer?.id === currentUser.id ? 'You' : payer?.name}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={`text-sm font-bold ${
                        isIncome ? 'text-teal-600 dark:text-teal-400' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {isIncome ? '+' : ''}
                      {formatMinorUnits(t.amount_minor, t.currency)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {new Date(t.occurred_at).toLocaleDateString('en-US', {
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
