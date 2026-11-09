'use client';

import React, { useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits, parseMajorToMinor, SUPPORTED_CURRENCIES } from '@/lib/ledger';
import {
  User,
  ShieldCheck,
  Mic,
  Download,
  RotateCcw,
  Sliders,
  DollarSign,
  Check,
  CheckCircle2,
  Lock,
} from 'lucide-react';

export function ProfileView() {
  const {
    currentUser,
    users,
    switchUser,
    updateBudget,
    updateUserProfile,
    resetToDemoData,
    budgets,
    transactions,
    splits,
    settlements,
    groups,
    categories,
    auditLogs,
  } = usePayd();

  const currentBudget = budgets.find((b) => b.user_id === currentUser.id && b.category_id === null);
  const [budgetMajor, setBudgetMajor] = useState(
    currentBudget ? (currentBudget.limit_minor / 100).toString() : '5000'
  );
  const [selectedCurrency, setSelectedCurrency] = useState(currentUser.default_currency || 'AED');
  const [name, setName] = useState(currentUser.name);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const minorVal = parseMajorToMinor(budgetMajor, selectedCurrency);
    updateBudget(minorVal, null);
    updateUserProfile({ name, default_currency: selectedCurrency });
    setSaveMessage('Profile settings saved successfully!');
    setTimeout(() => setSaveMessage(null), 2500);
  };

  const handleExportData = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      currentUser,
      users,
      groups,
      categories,
      transactions,
      splits,
      settlements,
      budgets,
      auditLogs,
    };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `payd-backup-${currentUser.name.toLowerCase()}-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">User Profile & Settings</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Manage your personal budget, currency, voice privacy, and ledger data
        </p>
      </div>

      {saveMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{saveMessage}</span>
        </div>
      )}

      {/* Profile Card */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm space-y-5">
        <div className="flex items-center gap-4">
          <img
            src={currentUser.avatar_url || ''}
            alt={currentUser.name}
            className="w-16 h-16 rounded-2xl object-cover ring-2 ring-emerald-500"
          />
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{currentUser.name}</h3>
            <p className="text-xs text-slate-400">{currentUser.email}</p>
            <span className="inline-block mt-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
              Verified Ledger Account
            </span>
          </div>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-1 px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Default Currency</label>
              <select
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
                className="w-full mt-1 px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {Object.values(SUPPORTED_CURRENCIES).map((curr) => (
                  <option key={curr.code} value={curr.code}>
                    {curr.code} - {curr.name} ({curr.symbol})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Monthly Budget Limit
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">
                  {selectedCurrency}
                </span>
                <input
                  type="number"
                  step="10"
                  value={budgetMajor}
                  onChange={(e) => setBudgetMajor(e.target.value)}
                  className="w-full pl-14 pr-3 py-2.5 text-sm font-semibold bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition"
          >
            Save Profile Settings
          </button>
        </form>
      </div>

      {/* Voice Privacy Disclosure Card */}
      <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
            <Lock className="w-4 h-4" />
          </span>
          <h4 className="font-bold text-sm text-slate-900 dark:text-white">Voice Privacy & Invariant Contract</h4>
        </div>

        <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          <p>
            🔒 <strong>Audio is processed in real time and never stored</strong>: Your microphone audio is processed on-device or streamed for ephemeral transcript extraction. Payd never saves voice recordings.
          </p>
          <p>
            ⚡ <strong>AI Is Language Only</strong>: Gemini is strictly restricted to parsing intent and natural language formatting. Gemini <em>never</em> calculates balances, remainder distributions, or writes directly to the database. All calculations are 100% deterministic in <code className="text-emerald-500 font-mono">/lib/ledger</code>.
          </p>
          <p>
            💎 <strong>Integer Minor Units</strong>: Monetary values are strictly calculated as integer minor units (fils/cents). Floating-point math is completely prohibited in the ledger.
          </p>
        </div>
      </div>

      {/* Quick Persona Switcher */}
      <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
          Demo Persona Switcher
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => switchUser(u.id)}
              className={`p-3 rounded-2xl border text-center transition ${
                u.id === currentUser.id
                  ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850'
              }`}
            >
              <img src={u.avatar_url || ''} alt={u.name} className="w-10 h-10 rounded-full object-cover mx-auto mb-1.5" />
              <div className="text-xs font-bold text-slate-900 dark:text-white">{u.name}</div>
              <div className="text-[10px] text-slate-400">{u.default_currency}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Ledger Data Management */}
      <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
          Ledger Data & Backup
        </span>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleExportData}
            className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-750 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition"
          >
            <Download className="w-4 h-4 text-emerald-500" />
            <span>Export Full Ledger JSON</span>
          </button>

          <button
            onClick={resetToDemoData}
            className="flex-1 py-2.5 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-semibold text-xs flex items-center justify-center gap-2 transition"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset Demo Data</span>
          </button>
        </div>
      </div>
    </div>
  );
}
