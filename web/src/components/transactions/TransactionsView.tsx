'use client';

import React, { useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits } from '@/lib/ledger';
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
    <div className="space-y-6 pb-28">
      {/* Title & Top Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl sm:text-2xl text-white tracking-wide">EXPENSE ACTIVITY</h2>
          <p className="text-xs text-zinc-400 mt-1 font-body">
            Deterministic immutable ledger history with zero-loss precision
          </p>
        </div>

        <button
          onClick={() => onOpenAddExpense('expense')}
          className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white font-heading text-xs tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-violet-600/30 transition active:scale-95 self-start sm:self-auto"
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
            type="text"
            placeholder="Search by title, notes, payer, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-violet-500 text-white placeholder:text-zinc-600 font-body"
          />
        </div>

        {/* Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-2 bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-violet-500 text-zinc-300"
          >
            <option value="all">All Types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="px-3 py-2 bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-violet-500 text-zinc-300"
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
            className="px-3 py-2 bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-violet-500 text-zinc-300"
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
              className="rounded accent-violet-600"
            />
            <span className="text-[11px] whitespace-nowrap">Include Deleted</span>
          </label>
        </div>

        {/* Filter Summary */}
        <div className="flex justify-between items-center text-[11px] text-zinc-400 pt-1">
          <span>
            Showing {filtered.length} entries &bull; Active volume:{' '}
            <strong className="text-white">
              {formatMinorUnits(totalFilteredMinor, currentUser.default_currency)}
            </strong>
          </span>
        </div>
      </div>

      {/* Transaction List */}
      <div className="space-y-2 font-body">
        {filtered.length === 0 ? (
          <div className="p-12 text-center bg-[#18181b] border border-white/8 rounded-3xl">
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
                onClick={() => onSelectTransaction(t)}
                className={`p-4 rounded-2xl border transition flex items-center justify-between cursor-pointer shadow-sm ${
                  isDeleted
                    ? 'bg-rose-500/5 border-rose-500/20 opacity-60'
                    : 'bg-[#18181b] hover:bg-[#202025] border-white/8 hover:border-violet-500/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-lg shrink-0">
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
                        <span className="text-[10px] font-heading px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300">
                          {group.name}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-2">
                      <span>{cat?.name}</span>
                      <span>&bull;</span>
                      <span>Paid by {payer?.id === currentUser.id ? 'You' : payer?.name}</span>
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
                  <div className="text-[10px] text-zinc-500 font-mono">
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
