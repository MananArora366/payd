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
    <div className="space-y-6 max-w-2xl mx-auto pb-28 font-body">
      {/* Title */}
      <div>
        <h2 className="font-heading text-xl sm:text-2xl text-white tracking-wide">USER PROFILE & SETTINGS</h2>
        <p className="text-xs text-zinc-400 mt-1 font-body">
          Manage your personal budget, currency, voice privacy, and ledger data
        </p>
      </div>

      {saveMessage && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-xs font-semibold text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{saveMessage}</span>
        </div>
      )}

      {/* Profile Card */}
      <div className="p-6 bg-[#18181b] border border-white/8 rounded-3xl shadow-md space-y-5 text-white font-body">
        <div className="flex items-center gap-4">
          <img
            src={currentUser.avatar_url || ''}
            alt={currentUser.name}
            className="w-16 h-16 rounded-2xl object-cover ring-2 ring-violet-500"
          />
          <div>
            <h3 className="font-heading text-base text-white">{currentUser.name}</h3>
            <p className="text-xs text-zinc-400 font-body">{currentUser.email}</p>
            <span className="inline-block mt-1 text-[10px] font-heading px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
              Verified Ledger Account
            </span>
          </div>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-4 pt-4 border-t border-white/8">
          <div>
            <label className="text-[11px] font-heading text-zinc-400">DISPLAY NAME</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-1 px-3.5 py-2.5 text-sm bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-violet-500 text-white font-body"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-heading text-zinc-400">DEFAULT CURRENCY</label>
              <select
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
                className="w-full mt-1 px-3.5 py-2.5 text-sm bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-violet-500 text-white font-body"
              >
                {Object.values(SUPPORTED_CURRENCIES).map((curr) => (
                  <option key={curr.code} value={curr.code}>
                    {curr.code} - {curr.name} ({curr.symbol})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-heading text-zinc-400">
                MONTHLY BUDGET LIMIT
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-violet-400">
                  {selectedCurrency}
                </span>
                <input
                  type="number"
                  step="10"
                  value={budgetMajor}
                  onChange={(e) => setBudgetMajor(e.target.value)}
                  className="w-full pl-14 pr-3 py-2.5 text-sm font-semibold bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-violet-500 text-white font-body"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white font-heading text-xs tracking-wider shadow-lg shadow-violet-600/30 transition active:scale-95"
          >
            Save Profile Settings
          </button>
        </form>
      </div>

      {/* Voice Privacy Disclosure Card */}
      <div className="p-5 bg-[#18181b] border border-white/8 rounded-3xl shadow-sm space-y-3 text-white font-body">
        <div className="flex items-center gap-2">
          <span className="p-2 rounded-xl bg-violet-500/20 text-violet-400">
            <Lock className="w-4 h-4" />
          </span>
          <h4 className="font-heading text-xs text-white">VOICE PRIVACY & INVARIANT CONTRACT</h4>
        </div>

        <div className="space-y-2 text-xs text-zinc-400 leading-relaxed font-body">
          <p>
            🔒 <strong className="text-white">Audio is processed in real time and never stored</strong>: Your microphone audio is processed on-device or streamed for ephemeral transcript extraction. Payd never saves voice recordings.
          </p>
          <p>
            ⚡ <strong className="text-white">AI Is Language Only</strong>: Gemini is strictly restricted to parsing intent and natural language formatting. Gemini <em>never</em> calculates balances, remainder distributions, or writes directly to the database. All calculations are 100% deterministic in <code className="text-violet-400 font-mono">/lib/ledger</code>.
          </p>
          <p>
            💎 <strong className="text-white">Integer Minor Units</strong>: Monetary values are strictly calculated as integer minor units (fils/cents). Floating-point math is completely prohibited in the ledger.
          </p>
        </div>
      </div>

      {/* Quick Persona Switcher */}
      <div className="p-5 bg-[#18181b] border border-white/8 rounded-3xl shadow-sm space-y-3 font-body">
        <span className="text-[11px] font-heading text-zinc-400 block">
          DEMO PERSONA SWITCHER
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => switchUser(u.id)}
              className={`p-3 rounded-2xl border text-center transition ${
                u.id === currentUser.id
                  ? 'border-violet-500 bg-[#22222a]'
                  : 'border-white/6 hover:bg-[#202025]'
              }`}
            >
              <img src={u.avatar_url || ''} alt={u.name} className="w-10 h-10 rounded-full object-cover mx-auto mb-1.5" />
              <div className="text-xs font-bold text-white">{u.name}</div>
              <div className="text-[10px] text-zinc-400">{u.default_currency}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Ledger Data Management */}
      <div className="p-5 bg-[#18181b] border border-white/8 rounded-3xl shadow-sm space-y-3 font-body">
        <span className="text-[11px] font-heading text-zinc-400 block">
          LEDGER DATA & BACKUP
        </span>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleExportData}
            className="flex-1 py-2.5 px-4 rounded-xl border border-white/10 hover:bg-[#27272a] text-zinc-300 font-semibold text-xs flex items-center justify-center gap-2 transition active:scale-95"
          >
            <Download className="w-4 h-4 text-violet-400" />
            <span>Export Full Ledger JSON</span>
          </button>

          <button
            onClick={resetToDemoData}
            className="flex-1 py-2.5 px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 font-semibold text-xs flex items-center justify-center gap-2 transition active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset Demo Data</span>
          </button>
        </div>
      </div>
    </div>
  );
}
