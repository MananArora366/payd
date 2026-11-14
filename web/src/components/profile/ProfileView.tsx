'use client';

import React, { useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { CheckCircle2, Lock, AlertCircle, Bot } from 'lucide-react';

import { LEDGER_CURRENCY, validateProfileForm } from './profileForm';

export function ProfileView() {
  const { currentUser, updateBudget, updateUserProfile, budgets, aiEnabled, setAiEnabled } = usePayd();

  const currentBudget = budgets.find((b) => b.user_id === currentUser.id && !b.category_id);
  const [budgetMajor, setBudgetMajor] = useState(
    currentBudget ? (currentBudget.limit_minor / 100).toString() : '5000'
  );
  const [name, setName] = useState(currentUser.name);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ name?: string; budget?: string }>({});

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateProfileForm(name, budgetMajor);
    setErrors(result.errors);
    if (result.errors.name || result.errors.budget) {
      setSaveMessage(null);
      return;
    }
    updateBudget(result.budgetMinor, null);
    updateUserProfile({ name: name.trim(), default_currency: LEDGER_CURRENCY });
    setName(name.trim());
    setSaveMessage('Profile settings saved.');
    setTimeout(() => setSaveMessage(null), 2500);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-28 font-body">
      {/* Title */}
      <div>
        <h2 className="font-heading text-xl sm:text-2xl text-white tracking-wide">User profile & settings</h2>
        <p className="text-xs text-zinc-400 mt-1 font-body">
          Manage your budget, currency and privacy
        </p>
      </div>

      {saveMessage && (
        <div role="status" className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-xs font-semibold text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{saveMessage}</span>
        </div>
      )}

      {/* Profile Card */}
      <div className="p-6 bg-[#18181b] border border-white/8 rounded-2xl shadow-md space-y-5 text-white font-body">
        <div className="flex items-center gap-4">
          <img
            src={currentUser.avatar_url || ''}
            alt={currentUser.name}
            className="w-16 h-16 rounded-2xl object-cover ring-2 ring-silver-500"
          />
          <div>
            <h3 className="font-heading text-base text-white">{currentUser.name}</h3>
            <p className="text-xs text-zinc-400 font-body">{currentUser.email}</p>
            <span className="inline-block mt-1 text-[10px] font-heading px-2 py-0.5 rounded-full bg-silver-500/20 text-silver-300 border border-silver-500/30">
              Verified Ledger Account
            </span>
          </div>
        </div>

        <form onSubmit={handleSaveSettings} noValidate className="space-y-4 pt-4 border-t border-white/8">
          <div>
            <label htmlFor="profile-name" className="text-[11px] font-heading text-zinc-400">
              Display name
            </label>
            <input
              id="profile-name"
              type="text"
              autoComplete="name"
              maxLength={60}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'profile-name-error' : undefined}
              className={`w-full mt-1 px-3.5 py-2.5 text-sm bg-[#09090b] border rounded-xl focus:outline-none focus:border-silver-500 text-white font-body ${
                errors.name ? 'border-rose-500/70' : 'border-white/10'
              }`}
            />
            {errors.name && (
              <p id="profile-name-error" className="mt-1 text-[11px] text-rose-400 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> {errors.name}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="profile-currency" className="text-[11px] font-heading text-zinc-400">
                Default currency
              </label>
              <select
                id="profile-currency"
                value={LEDGER_CURRENCY}
                disabled
                aria-describedby="profile-currency-note"
                className="w-full mt-1 px-3.5 py-2.5 text-sm bg-[#09090b] border border-white/10 rounded-xl text-zinc-300 font-body opacity-80 cursor-not-allowed"
              >
                <option value={LEDGER_CURRENCY}>AED - UAE Dirham (د.إ)</option>
              </select>
              <p id="profile-currency-note" className="mt-1 text-[10px] text-zinc-500">
                AED only for now. Multi-currency is coming soon.
              </p>
            </div>

            <div>
              <label htmlFor="profile-budget" className="text-[11px] font-heading text-zinc-400">
                Monthly budget limit
              </label>
              <div className="relative mt-1">
                <span aria-hidden="true" className="absolute left-3 top-2.5 text-xs font-bold text-silver-400">
                  {LEDGER_CURRENCY}
                </span>
                <input
                  id="profile-budget"
                  type="text"
                  inputMode="decimal"
                  value={budgetMajor}
                  onChange={(e) => {
                    setBudgetMajor(e.target.value);
                    if (errors.budget) setErrors((prev) => ({ ...prev, budget: undefined }));
                  }}
                  aria-invalid={!!errors.budget}
                  aria-describedby={errors.budget ? 'profile-budget-error' : undefined}
                  className={`w-full pl-14 pr-3 py-2.5 text-sm font-semibold bg-[#09090b] border rounded-xl focus:outline-none focus:border-silver-500 text-white font-body ${
                    errors.budget ? 'border-rose-500/70' : 'border-white/10'
                  }`}
                />
              </div>
              {errors.budget && (
                <p id="profile-budget-error" className="mt-1 text-[11px] text-rose-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> {errors.budget}
                </p>
              )}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-silver-100 hover:bg-white text-zinc-900 font-semibold text-sm transition active:scale-95"
          >
            Save Profile Settings
          </button>
        </form>
      </div>

      {/* AI features toggle */}
      <div className="p-5 bg-[#18181b] border border-white/8 rounded-2xl space-y-3 text-white font-body">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="p-2 rounded-xl bg-silver-500/20 text-silver-300 shrink-0">
              <Bot className="w-4 h-4" />
            </span>
            <div>
              <h4 id="ai-toggle-label" className="font-heading text-sm text-white">AI features</h4>
              <p id="ai-toggle-desc" className="text-xs text-zinc-400 mt-1 leading-relaxed">
                {aiEnabled
                  ? 'Claude reads receipt photos in Payd Lens (including blurry ones), understands what you say and answers questions about your balances.'
                  : 'Off. Payd Lens uses on-device text recognition, and voice input and questions use built-in rules. Nothing is sent to an AI model.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={aiEnabled}
            aria-labelledby="ai-toggle-label"
            aria-describedby="ai-toggle-desc"
            onClick={() => setAiEnabled(!aiEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-silver-300 ${
              aiEnabled ? 'bg-silver-200 border-silver-200' : 'bg-zinc-800 border-white/10'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full transition-transform ${
                aiEnabled ? 'translate-x-6 bg-zinc-900' : 'translate-x-1 bg-zinc-400'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Voice Privacy Disclosure Card */}
      <div className="p-5 bg-[#18181b] border border-white/8 rounded-2xl shadow-sm space-y-3 text-white font-body">
        <div className="flex items-center gap-2">
          <span className="p-2 rounded-xl bg-silver-500/20 text-silver-400">
            <Lock className="w-4 h-4" />
          </span>
          <h4 className="font-heading text-xs text-white">Privacy & accuracy</h4>
        </div>

        <div className="space-y-2 text-xs text-zinc-400 leading-relaxed font-body">
          <p>
            🔒 <strong className="text-white">Audio is processed in real time and never stored</strong>: Your microphone audio is processed on-device or streamed for ephemeral transcript extraction. Payd never saves voice recordings.
          </p>
          <p>
            ⚡ <strong className="text-white">AI only reads, never counts</strong>: AI helps understand what you say and what is on your receipts. It never calculates balances or changes your records on its own; every amount is worked out by Payd and shown to you before it is saved.
          </p>
          <p>
            💎 <strong className="text-white">Exact to the fils</strong>: Splits are calculated to the exact fils or cent, so shares always add up to the full bill with nothing lost to rounding.
          </p>
        </div>
      </div>
    </div>
  );
}
