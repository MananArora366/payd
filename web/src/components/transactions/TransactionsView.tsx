'use client';

import React, { useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits } from '@/lib/ledger';
import { getCategoryIcon } from '@/lib/icons';
import { Transaction } from '@/types/database';
import {
  Search,
  Filter,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Layers,
  Tag,
  AlertCircle,
} from 'lucide-react';

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
  const [showDeleted, setShowDeleted] = useState(false);

  // Filter transactions
  const filtered = transactions.filter((t) => {
    if (!showDeleted && t.deleted_at) return false;
    if (selectedType !== 'all' && t.type !== selectedType) return false;
    if (selectedCategoryId !== 'all' && t.category_id !== selectedCategoryId) return false;
    if (selectedGroupId !== 'all') {
      if (selectedGroupId === 'personal' && t.group_id !== null) return false;
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

  const totalFilteredMinor = filtered.reduce((acc, t) => {
    if (t.deleted_at) return acc;
    return t.type === 'expense' ? acc + t.amount_minor : acc;
  }, 0);

  return (
    <div className="space-y-6 pb-24">
      {/* Title & Top Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Transactions</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Full ledger transaction history with reversing audit support
          </p>
        </div>

        <button
          onClick={() => onOpenAddExpense('expense')}
          className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Transaction</span>
        </button>
      </div>

      {/* Filter Controls Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm space-y-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search by title, notes, payer, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
          />
        </div>

        {/* Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700 dark:text-slate-300"
          >
            <option value="all">All Types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700 dark:text-slate-300"
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
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700 dark:text-slate-300"
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
          <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl cursor-pointer text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
              className="rounded text-emerald-500 focus:ring-emerald-500"
            />
            <span className="text-[11px] whitespace-nowrap">Include Deleted</span>
          </label>
        </div>

        {/* Filter Summary */}
        <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1">
          <span>
            Showing {filtered.length} entries • Active expense total:{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {formatMinorUnits(totalFilteredMinor, currentUser.default_currency)}
            </strong>
          </span>
        </div>
      </div>

      {/* Transaction List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
            <Filter className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
            <h4 className="font-semibold text-slate-800 dark:text-slate-200">No matching transactions</h4>
            <p className="text-xs text-slate-400 mt-1">Try clearing search filters or add a new transaction.</p>
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
                onClick={() => onSelectTransaction(t)}
                className={`p-4 rounded-2xl border transition flex items-center justify-between cursor-pointer shadow-sm ${
                  isDeleted
                    ? 'bg-rose-500/5 border-rose-500/20 opacity-60'
                    : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2.5 rounded-xl ${
                      isDeleted
                        ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-500'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {getCategoryIcon(cat?.icon, 'w-4 h-4')}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                        {t.title}
                      </span>
                      {isDeleted && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500">
                          Reversed
                        </span>
                      )}
                      {group && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                          {group.name}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                      <span>{cat?.name}</span>
                      <span>•</span>
                      <span>Paid by {payer?.id === currentUser.id ? 'You' : payer?.name}</span>
                      <span>•</span>
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
                        ? 'line-through text-slate-400'
                        : isIncome
                        ? 'text-teal-600 dark:text-teal-400'
                        : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {isIncome ? '+' : ''}
                    {formatMinorUnits(t.amount_minor, t.currency)}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {t.amount_minor} minor units
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
