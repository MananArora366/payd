'use client';

import React, { useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits } from '@/lib/ledger';
import { getCategoryIcon } from '@/lib/icons';
import { PieChart, Calendar, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { getMyExpenseShareMinor, isCareemExpense, isSameMonth, monthlyCategoryShares } from './spendMath';

interface CategoryBreakdownCardProps {
  onNavigateTransactions?: () => void;
}

const CATEGORY_COLORS = [
  'bg-emerald-500',
  'bg-sky-500',
  'bg-silver-400',
  'bg-amber-500',
  'bg-rose-500',
  'bg-teal-500',
];

export function CategoryBreakdownCard({ onNavigateTransactions }: CategoryBreakdownCardProps) {
  const { currentUser, categories, transactions, splits, budgets } = usePayd();
  const [isExpanded, setIsExpanded] = useState(true);

  const now = new Date();
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });

  // Category totals use MY share of this month's expenses (same basis as the runway below).
  const { totals, totalMinor: totalExpensesMinor } = monthlyCategoryShares(
    currentUser.id,
    transactions,
    splits,
    now
  );
  const sortedCategories = totals.map((t) => {
    const cat = categories.find((c) => c.id === t.id);
    return {
      id: t.id,
      name: cat ? cat.name : 'Other / Uncategorized',
      icon: cat ? cat.icon : 'Tag',
      totalMinor: t.totalMinor,
    };
  });

  // Daily budget runway calculations (this month's own share vs the monthly budget)
  const monthlyBudget = budgets.find(
    (b) => b.user_id === currentUser.id && !b.category_id
  );
  const budgetLimit = monthlyBudget ? monthlyBudget.limit_minor : 500000;
  const spentThisMonthMinor = totalExpensesMinor;
  const remainingBudgetMinor = Math.max(0, budgetLimit - spentThisMonthMinor);

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const daysRemaining = Math.max(1, daysInMonth - currentDay + 1);

  const dailyAllowanceMinor = Math.round(remainingBudgetMinor / daysRemaining);
  const isPaceHealthy = spentThisMonthMinor <= (budgetLimit / daysInMonth) * currentDay;

  // Careem pulse: my share of this month's Careem-sourced expenses (rides, food, Quik...)
  const careemTotalMinor = transactions
    .filter((t) => isCareemExpense(t) && isSameMonth(t.occurred_at, now))
    .reduce((acc, t) => acc + getMyExpenseShareMinor(t, currentUser.id, splits), 0);

  return (
    <div className="rounded-2xl bg-[#18181b] border border-white/8 p-5 shadow-md space-y-4 font-body">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-silver-500/20 text-silver-400">
            <PieChart className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-heading text-xs text-white flex items-center gap-1.5">
              Spending sectors & daily runway
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-silver-500/20 text-silver-300 font-heading border border-silver-500/30">
                Insights
              </span>
            </h3>
            <p className="text-[11px] text-zinc-400 font-body">
              Your share by category & smart daily burn rate for {monthName}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse spending sectors' : 'Expand spending sectors'}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Daily Runway KPI Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-teal-500/[0.06] border border-teal-500/20">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-teal-500" />
                  Daily Safe Burn Rate
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                    isPaceHealthy
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-500/10 text-amber-500'
                  }`}
                >
                  {isPaceHealthy ? 'On Track' : 'High Burn'}
                </span>
              </div>
              <div className="text-2xl font-semibold text-slate-900 dark:text-white mt-1">
                {formatMinorUnits(dailyAllowanceMinor, currentUser.default_currency)}{' '}
                <span className="text-xs font-normal text-slate-400">/ day</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining in {monthName} • {formatMinorUnits(remainingBudgetMinor, currentUser.default_currency)} unspent budget
              </p>
            </div>

            {/* Careem Super-App Synergy Badge */}
            <div className="p-4 rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/25">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                <span className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                  <Zap className="w-3.5 h-3.5 text-emerald-500" />
                  Careem Super-App Pulse
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold uppercase">
                  Careem Pay Ready
                </span>
              </div>
              <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                {formatMinorUnits(careemTotalMinor, currentUser.default_currency)}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Your share of Careem rides, food & Quik orders this month
              </p>
            </div>
          </div>

          {/* Categorical Breakdown Bars */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              <span>Category Breakdown</span>
              <span className="flex items-center gap-2">
                <span>Total: {formatMinorUnits(totalExpensesMinor, currentUser.default_currency)}</span>
                {onNavigateTransactions && (
                  <button
                    type="button"
                    onClick={onNavigateTransactions}
                    className="normal-case tracking-normal font-bold text-silver-400 hover:text-silver-300 transition"
                  >
                    Activity &rarr;
                  </button>
                )}
              </span>
            </div>

            {sortedCategories.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                No expenses of yours recorded this month yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {sortedCategories.map((cat, idx) => {
                  const percent =
                    totalExpensesMinor > 0
                      ? Math.round((cat.totalMinor / totalExpensesMinor) * 100)
                      : 0;
                  const gradient = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];

                  return (
                    <div
                      key={cat.id}
                      className="p-3 bg-slate-50 dark:bg-slate-850/60 rounded-2xl border border-slate-200/50 dark:border-slate-800 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-xs">
                            {getCategoryIcon(cat.icon, 'w-3.5 h-3.5')}
                          </div>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {cat.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-[11px]">{percent}%</span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {formatMinorUnits(cat.totalMinor, currentUser.default_currency)}
                          </span>
                        </div>
                      </div>

                      {/* Percentage Bar */}
                      <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${gradient} transition-all duration-500`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
