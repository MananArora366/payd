'use client';

import React, { useEffect, useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits } from '@/lib/ledger';
import { Transaction } from '@/types/database';
import { Search, Filter, Plus } from 'lucide-react';
import { sortByDateDesc, volumeByType } from '@/components/analytics/spendMath';

// Remember "Include Deleted" for the browser session so it survives tab switches.
const SHOW_DELETED_KEY = 'payd:activity:showDeleted';

const onActivateKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
};

interface TransactionsViewProps {
  onOpenAddExpense: (type?: 'expense' | 'income') => void;
  onSelectTransaction: (txn: Transaction) => void;
}

export function TransactionsView({ onOpenAddExpense, onSelectTransaction }: TransactionsViewProps) {
  const { currentUser, users, categories, groups, transactions } = usePayd();

  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [showDeleted, setShowDeletedState] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SHOW_DELETED_KEY) === '1') setShowDeletedState(true);
    } catch {
      // sessionStorage unavailable (private mode etc.): keep the default
    }
  }, []);

  const setShowDeleted = (value: boolean) => {
    setShowDeletedState(value);
    try {
      window.sessionStorage.setItem(SHOW_DELETED_KEY, value ? '1' : '0');
    } catch {
      // ignore
    }
  };

  // Category emoji helper
  const getCategoryEmoji = (catName?: string) => {
    const lower = (catName || '').toLowerCase();
    if (lower.includes('food') || lower.includes('dining')) return '🍣';
    if (lower.includes('grocer')) return '🛒';
    if (lower.includes('utility') || lower.includes('bill') || lower.includes('wifi')) return '⚡';
    if (lower.includes('transport') || lower.includes('careem')) return '🚗';
    if (lower.includes('coffee')) return '☕';
    if (lower.includes('travel')) return '✈️';
    if (lower.includes('entertainment')) return '🎬';
    return '💳';
  };

  // Filter transactions, newest first
  const filtered = sortByDateDesc(transactions).filter((t) => {
    if (!showDeleted && t.deleted_at) return false;
    if (selectedType !== 'all' && t.type !== selectedType) return false;
    if (selectedCategoryId !== 'all' && t.category_id !== selectedCategoryId) return false;
    if (selectedGroupId !== 'all') {
      if (selectedGroupId === 'personal' && t.group_id) return false;
      if (selectedGroupId !== 'personal' && t.group_id !== selectedGroupId) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const payer = users.find((u) => u.id === t.payer_id)?.name.toLowerCase() || '';
      const cat = categories.find((c) => c.id === t.category_id)?.name.toLowerCase() || '';
      const notes = (t.notes || '').toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !payer.includes(q) && !cat.includes(q) && !notes.includes(q)) {
        return false;
      }
    }
    return true;
  });

  // Active volume excludes deleted entries; expenses and income are reported separately.
  const { expenseMinor, incomeMinor } = volumeByType(filtered);

  return (
    <div className="space-y-6 pb-28">
      {/* Title & Top Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl sm:text-2xl text-white tracking-wide">Expense activity</h2>
          <p className="text-xs text-zinc-400 mt-1 font-body">
            Every expense and income entry in one place. Settlements live in the Settle tab
          </p>
        </div>

        <button
          onClick={() => onOpenAddExpense('expense')}
          className="px-4 py-2.5 rounded-2xl bg-silver-100 hover:bg-white text-zinc-900 font-semibold text-sm flex items-center justify-center gap-2 transition active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>+ Add Expense</span>
        </button>
      </div>

      {/* Filter Controls Bar */}
      <div className="p-4 bg-[#18181b] border border-white/8 rounded-2xl shadow-sm space-y-3 font-body">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-zinc-400" />
          <input
            type="search"
            aria-label="Search transactions"
            placeholder="Search by title, notes, payer, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-silver-500 text-white placeholder:text-zinc-600 font-body"
          />
        </div>

        {/* Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {/* Type Filter */}
          <select
            aria-label="Filter by type"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-2 bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-silver-500 text-zinc-300"
          >
            <option value="all">All Types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </select>

          {/* Category Filter */}
          <select
            aria-label="Filter by category"
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="px-3 py-2 bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-silver-500 text-zinc-300"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Group Filter */}
          <select
            aria-label="Filter by group"
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="px-3 py-2 bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-silver-500 text-zinc-300"
          >
            <option value="all">All Groups</option>
            <option value="personal">Personal Only</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          {/* Show Deleted Toggle */}
          <label className="flex items-center gap-2 px-3 py-2 bg-[#09090b] border border-white/10 rounded-xl cursor-pointer text-zinc-400">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
              className="rounded accent-silver-600"
            />
            <span className="text-[11px] whitespace-nowrap">Include Deleted</span>
          </label>
        </div>

        {/* Filter Summary */}
        <div className="flex justify-between items-center text-[11px] text-zinc-400 pt-1">
          <span>
            Showing {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'} &bull; Active volume:{' '}
            {selectedType !== 'income' && (
              <strong className="text-white">
                {formatMinorUnits(expenseMinor, currentUser.default_currency)} spent
              </strong>
            )}
            {selectedType === 'all' && incomeMinor > 0 && ' · '}
            {selectedType !== 'expense' && (selectedType === 'income' || incomeMinor > 0) && (
              <strong className="text-[#10B981]">
                +{formatMinorUnits(incomeMinor, currentUser.default_currency)} income
              </strong>
            )}
          </span>
        </div>
      </div>

      {/* Transaction List */}
      <div className="space-y-2 font-body">
        {filtered.length === 0 ? (
          <div className="p-12 text-center bg-[#18181b] border border-white/8 rounded-2xl">
            <Filter className="w-8 h-8 text-zinc-500 mx-auto mb-2 opacity-50" />
            <h4 className="font-heading text-sm text-white">No matching transactions</h4>
            <p className="text-xs text-zinc-400 mt-1 font-body">Try clearing search filters or add a new transaction.</p>
          </div>
        ) : (
          filtered.map((t) => {
            const cat = categories.find((c) => c.id === t.category_id);
            const payer = users.find((u) => u.id === t.payer_id);
            const group = groups.find((g) => g.id === t.group_id);
            const isIncome = t.type === 'income';
            const isDeleted = !!t.deleted_at;

            return (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectTransaction(t)}
                onKeyDown={onActivateKey(() => onSelectTransaction(t))}
                className={`p-4 rounded-2xl border transition flex items-center justify-between cursor-pointer shadow-sm ${
                  isDeleted
                    ? 'bg-rose-500/5 border-rose-500/20 opacity-60'
                    : 'bg-[#18181b] hover:bg-[#202025] border-white/8 hover:border-silver-500/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-silver-500/10 flex items-center justify-center text-lg shrink-0">
                    {getCategoryEmoji(cat?.name)}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white leading-tight">
                        {t.title}
                      </span>
                      {isDeleted && (
                        <span className="text-[10px] uppercase font-heading px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400">
                          Reversed
                        </span>
                      )}
                      {group && (
                        <span className="text-[10px] font-heading px-2 py-0.5 rounded-full bg-silver-500/20 text-silver-300">
                          {group.name}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-2">
                      <span>{cat?.name}</span>
                      <span>&bull;</span>
                      <span>
                        {isIncome ? 'Received by' : 'Paid by'} {payer?.id === currentUser.id ? 'You' : payer?.name}
                      </span>
                      <span>&bull;</span>
                      <span>
                        {new Date(t.occurred_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`text-sm font-bold ${
                      isDeleted
                        ? 'line-through text-zinc-500'
                        : isIncome
                        ? 'text-[#10B981]'
                        : 'text-white'
                    }`}
                  >
                    {isIncome ? '+' : ''}
                    {formatMinorUnits(t.amount_minor, t.currency)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
