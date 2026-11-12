'use client';

import React, { useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits } from '@/lib/ledger';
import { getCategoryIcon } from '@/lib/icons';
import {
  PieChart,
  Calendar,
  Sparkles,
  TrendingDown,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Compass,
  Zap,
} from 'lucide-react';

interface CategoryBreakdownCardProps {
  onNavigateTransactions?: () => void;
}

const CATEGORY_COLORS = [
  'from-emerald-500 to-teal-500',
  'from-blue-500 to-cyan-500',
  'from-purple-500 to-indigo-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-teal-500 to-emerald-400',
];

export function CategoryBreakdownCard({ onNavigateTransactions }: CategoryBreakdownCardProps) {
  const { currentUser, categories, transactions, budgets, userSpending } = usePayd();
  const [isExpanded, setIsExpanded] = useState(true);

  // Compute category totals for non-deleted expenses
  const categoryMap: Record<string, { id: string; name: string; icon: string; totalMinor: number }> = {};

  let totalExpensesMinor = 0;
  for (const t of transactions) {
    if (!t.deleted_at && t.type === 'expense') {
      totalExpensesMinor += t.amount_minor;
      const cat = categories.find((c) => c.id === t.category_id);
      const catId = cat ? cat.id : 'other';
      const catName = cat ? cat.name : 'Other / Uncategorized';
      const catIcon = cat ? cat.icon : 'Tag';

      if (!categoryMap[catId]) {
        categoryMap[catId] = { id: catId, name: catName, icon: catIcon, totalMinor: 0 };
      }
      categoryMap[catId].totalMinor += t.amount_minor;
    }
  }

  const sortedCategories = Object.values(categoryMap).sort(
    (a, b) => b.totalMinor - a.totalMinor
  );

  // Daily budget runway calculations
  const monthlyBudget = budgets.find(
    (b) => b.user_id === currentUser.id && b.category_id === null
  );
  const budgetLimit = monthlyBudget ? monthlyBudget.limit_minor : 500000;
  const remainingBudgetMinor = Math.max(0, budgetLimit - userSpending.totalSpentMinor);

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const daysRemaining = Math.max(1, daysInMonth - currentDay + 1);

  const dailyAllowanceMinor = Math.round(remainingBudgetMinor / daysRemaining);
  const isPaceHealthy = userSpending.totalSpentMinor <= (budgetLimit / daysInMonth) * currentDay;

  // Careem specific count
  const careemRidesOrFood = transactions.filter(
    (t) =>
      !t.deleted_at &&
      (t.title.toLowerCase().includes('careem') ||
        t.title.toLowerCase().includes('ride') ||
        (t.payment_method || '').toLowerCase().includes('careem'))
  );
  const careemTotalMinor = careemRidesOrFood.reduce((acc, t) => acc + t.amount_minor, 0);

  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <PieChart className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              Spending Sectors & Daily Runway
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 font-bold uppercase">
                Insights
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Categorical distribution & smart daily burn rate for November
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Daily Runway KPI Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-slate-900/30 border border-teal-500/20">
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
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {formatMinorUnits(dailyAllowanceMinor, currentUser.default_currency)}{' '}
                <span className="text-xs font-normal text-slate-400">/ day</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {daysRemaining} days remaining in November • {formatMinorUnits(remainingBudgetMinor, currentUser.default_currency)} unspent budget
              </p>
            </div>

            {/* Careem Super-App Synergy Badge */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-[#00ea80]/15 via-emerald-500/5 to-slate-900/30 border border-emerald-500/25">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                <span className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                  <Zap className="w-3.5 h-3.5 text-emerald-500" />
                  Careem Super-App Pulse
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold uppercase">
                  Careem Pay Ready
                </span>
              </div>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {careemRidesOrFood.length > 0
                  ? formatMinorUnits(careemTotalMinor, currentUser.default_currency)
                  : 'AED 0.00'}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Rides, food deliveries & Careem Pay settlements tracked in ledger
              </p>
            </div>
          </div>

          {/* Categorical Breakdown Bars */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              <span>Category Breakdown</span>
              <span>Total: {formatMinorUnits(totalExpensesMinor, currentUser.default_currency)}</span>
            </div>

            {sortedCategories.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                No expense transactions recorded yet.
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
                          className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-500`}
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
