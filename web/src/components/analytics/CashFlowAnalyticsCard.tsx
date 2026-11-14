'use client';

import React, { useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits } from '@/lib/ledger';
import { Activity, Zap, Clock, AlertTriangle, Send, ChevronDown, ChevronUp } from 'lucide-react';

interface CashFlowAnalyticsCardProps {
  onNavigateSettlements?: () => void;
}

export function CashFlowAnalyticsCard({ onNavigateSettlements }: CashFlowAnalyticsCardProps) {
  const { currentUser, cashFlowExposure, reimbursementVelocities, budgets } = usePayd();
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    total_fronted_minor,
    total_recovered_minor,
    outstanding_exposure_minor,
    personal_consumption_minor,
    top_lagging_user,
  } = cashFlowExposure;

  // Percentage recovered
  const recoveryPercent =
    total_fronted_minor - personal_consumption_minor > 0
      ? Math.min(
          100,
          Math.round(
            (total_recovered_minor / (total_fronted_minor - personal_consumption_minor)) * 100
          )
        )
      : 100;

  // Exposure as a share of the user's monthly budget (AED 5,000 default when none is set)
  const monthlyBudget = budgets.find((b) => b.user_id === currentUser.id && !b.category_id);
  const budgetLimitMinor = monthlyBudget && monthlyBudget.limit_minor > 0 ? monthlyBudget.limit_minor : 500000;
  const exposurePercent = Math.min(100, Math.round((outstanding_exposure_minor / budgetLimitMinor) * 100));

  const handleWhatsAppNudge = (name: string, owedMinor: number) => {
    const amountFormatted = formatMinorUnits(owedMinor, currentUser.default_currency);
    const text = encodeURIComponent(
      `Hi ${name.split(' ')[0]}, just checking in on our Payd balance (${amountFormatted}) whenever you get a chance to settle up. Thanks!`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div className="rounded-2xl bg-[#18181b] border border-white/8 p-5 shadow-md space-y-4 font-body">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-silver-500/20 text-silver-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-heading text-xs text-white flex items-center gap-1.5">
              Cash flow health & reimbursement lag
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-silver-500/20 text-silver-300 font-heading border border-silver-500/30">
                Analytics
              </span>
            </h3>
            <p className="text-[11px] text-zinc-400 font-body">
              Personal out-of-pocket exposure & friend settlement turnaround
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Hide friend reimbursement details' : 'Show friend reimbursement details'}
          className="p-1 rounded-lg text-zinc-400 hover:text-white transition"
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Outstanding Exposure */}
        <div className="p-3.5 rounded-2xl bg-[#202025] border border-white/6">
          <div className="text-[10px] font-heading text-zinc-400">
            Out-of-pocket exposure
          </div>
          <div className="text-xl font-bold text-[#F43F5E] mt-1">
            {formatMinorUnits(outstanding_exposure_minor, currentUser.default_currency)}
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">
            Fronted for others & awaiting repayment
          </div>
        </div>

        {/* Repayment Velocity Rate */}
        <div className="p-3.5 rounded-2xl bg-[#202025] border border-white/6">
          <div className="text-[10px] font-heading text-zinc-400">
            Settlement recovery rate
          </div>
          <div className="text-xl font-bold text-[#10B981] mt-1">
            {recoveryPercent}%
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">
            {formatMinorUnits(total_recovered_minor, currentUser.default_currency)} recovered of fronted share
          </div>
        </div>

        {/* Personal vs Group Fronted Ratio */}
        <div className="p-3.5 rounded-2xl bg-[#202025] border border-white/6">
          <div className="text-[10px] font-heading text-zinc-400">
            Fair share consumption
          </div>
          <div className="text-xl font-semibold text-slate-800 dark:text-slate-200 mt-1">
            {formatMinorUnits(personal_consumption_minor, currentUser.default_currency)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            True personal spend (excluding friends&apos; splits)
          </div>
        </div>
      </div>

      {/* Progress Bar of Fronted vs Recovered */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px] font-medium text-slate-400">
          <span>Capital Float: {exposurePercent}% of monthly budget</span>
          <span className="text-slate-600 dark:text-slate-300">
            {formatMinorUnits(total_recovered_minor, currentUser.default_currency)} paid back / {formatMinorUnits(total_fronted_minor, currentUser.default_currency)} total fronted
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
          <div
            className="h-full bg-emerald-500 rounded-l-full transition-all duration-500"
            style={{ width: `${recoveryPercent}%` }}
            title="Recovered"
          />
          <div
            className="h-full bg-rose-500 rounded-r-full transition-all duration-500"
            style={{ width: `${100 - recoveryPercent}%` }}
            title="Outstanding"
          />
        </div>
      </div>

      {/* Top Proactive Alert if there is a lagging user */}
      {top_lagging_user && top_lagging_user.current_owed_minor > 0 && (
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-slate-700 dark:text-slate-300">
              <strong className="font-semibold text-slate-900 dark:text-white">
                {top_lagging_user.name}
              </strong>{' '}
              owes you {formatMinorUnits(top_lagging_user.current_owed_minor, currentUser.default_currency)} {top_lagging_user.avg_lag_days === null ? '(no repayment history yet).' : `(avg ${top_lagging_user.avg_lag_label} lag).`}
            </span>
          </div>

          <button
            type="button"
            onClick={() => handleWhatsAppNudge(top_lagging_user.name, top_lagging_user.current_owed_minor)}
            className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-[11px] flex items-center gap-1 shrink-0 transition"
          >
            <Send className="w-3 h-3" />
            <span>Nudge</span>
          </button>
        </div>
      )}

      {/* Expanded Roster of Reimbursement Velocity */}
      {isExpanded && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5 animate-in fade-in duration-200">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
            Friend Reimbursement Turnaround (Lag Index)
          </span>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/60 dark:border-slate-800 rounded-2xl overflow-hidden">
            {reimbursementVelocities.map((item) => (
              <div
                key={item.user_id}
                className="p-3 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <img
                    src={item.avatar_url || ''}
                    alt={item.name}
                    className="w-7 h-7 rounded-full object-cover"
                  />
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">{item.name}</div>
                    <div className="text-[10px] text-slate-400">
                      Avg turnaround: <strong className="text-slate-600 dark:text-slate-300">{item.avg_lag_label}</strong>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Status Badge */}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                      item.tier === 'speedy'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : item.tier === 'average'
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : item.tier === 'unknown'
                        ? 'bg-slate-500/10 text-slate-500 dark:text-slate-400'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {item.tier === 'speedy' && <Zap className="w-3 h-3" />}
                    {item.tier === 'average' && <Clock className="w-3 h-3" />}
                    {item.tier === 'lagging' && <AlertTriangle className="w-3 h-3" />}
                    {item.tier === 'speedy'
                      ? 'Speedy ⚡'
                      : item.tier === 'average'
                      ? 'Average ⏱️'
                      : item.tier === 'unknown'
                      ? 'No history'
                      : 'Lagging 🐢'}
                  </span>

                  {/* Owed amount + Nudge */}
                  {item.current_owed_minor > 0 ? (
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-rose-500">
                        {formatMinorUnits(item.current_owed_minor, currentUser.default_currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleWhatsAppNudge(item.name, item.current_owed_minor)}
                        title="Send friendly WhatsApp reminder"
                        aria-label={`Send ${item.name} a friendly WhatsApp reminder`}
                        className="p-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 hover:text-white transition"
                      >
                        <Send className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400 font-medium">All settled</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {onNavigateSettlements && (
            <button
              type="button"
              onClick={onNavigateSettlements}
              className="text-xs font-bold text-silver-400 hover:text-silver-300 transition"
            >
              Open settlements &rarr;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
