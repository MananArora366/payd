'use client';

import React, { useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits, parseMajorToMinor, splitEqual, splitExact, splitPercentage, splitShares } from '@/lib/ledger';
import { X, Check, Users, Sparkles, ShieldCheck, Camera } from 'lucide-react';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: 'expense' | 'income';
  defaultGroupId?: string | null;
  onOpenReceiptScanner?: () => void;
}

export function AddExpenseModal({ isOpen, onClose, defaultType = 'expense', defaultGroupId = null, onOpenReceiptScanner }: AddExpenseModalProps) {
  const { currentUser, users, categories, groups, addTransaction } = usePayd();

  const [type, setType] = useState<'expense' | 'income'>(defaultType);
  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [payerId, setPayerId] = useState(currentUser.id);
  const [groupId, setGroupId] = useState<string | null>(defaultGroupId);
  const [paymentMethod, setPaymentMethod] = useState('Card');
  const [notes, setNotes] = useState('');
  const [splitMethod, setSplitMethod] = useState<'equal' | 'exact'>('equal');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([currentUser.id]);
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const totalMinor = parseMajorToMinor(amountStr, currentUser.default_currency);

  const toggleUserSelection = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      if (selectedUserIds.length === 1) return; // keep at least 1
      setSelectedUserIds(selectedUserIds.filter((id) => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (!title.trim()) throw new Error('Please enter a description');
      if (totalMinor <= 0) throw new Error('Please enter an amount greater than 0');

      let splitsToSave: { user_id: string; share_minor: number }[] = [];

      if (type === 'income') {
        splitsToSave = [{ user_id: payerId, share_minor: totalMinor }];
      } else {
        if (splitMethod === 'equal') {
          const splitObj = splitEqual(totalMinor, selectedUserIds);
          splitsToSave = Object.entries(splitObj).map(([uid, share]) => ({
            user_id: uid,
            share_minor: share,
          }));
        } else {
          // Exact split
          const alloc: Record<string, number> = {};
          for (const uid of selectedUserIds) {
            alloc[uid] = parseMajorToMinor(exactAmounts[uid] || '0', currentUser.default_currency);
          }
          const splitObj = splitExact(totalMinor, alloc);
          splitsToSave = Object.entries(splitObj).map(([uid, share]) => ({
            user_id: uid,
            share_minor: share,
          }));
        }
      }

      addTransaction({
        type,
        title: title.trim(),
        amount_minor: totalMinor,
        currency: currentUser.default_currency,
        category_id: categoryId || null,
        payer_id: payerId,
        group_id: groupId || null,
        payment_method: paymentMethod,
        notes: notes.trim() || null,
        splits: splitsToSave,
      });

      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save transaction');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-slate-900 dark:text-white">
              {type === 'income' ? 'Record Income' : 'Add New Expense'}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-slate-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type Toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-850 rounded-2xl">
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`py-2 text-xs font-semibold rounded-xl transition ${
                type === 'expense'
                  ? 'bg-white dark:bg-slate-750 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={`py-2 text-xs font-semibold rounded-xl transition ${
                type === 'income'
                  ? 'bg-white dark:bg-slate-750 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Income
            </button>
          </div>

          {/* Quick Payd Lens Camera Trigger */}
          {type === 'expense' && onOpenReceiptScanner && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenReceiptScanner();
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-center gap-2 transition"
            >
              <Camera className="w-4 h-4" />
              <span>Or scan paper receipt with Payd Lens</span>
            </button>
          )}

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</label>
            <input
              type="text"
              required
              placeholder="e.g. Dinner with team, Grocery run, Salary"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full mt-1 px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Amount & Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">
                  {currentUser.default_currency}
                </span>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="w-full pl-14 pr-3 py-2.5 text-sm font-semibold bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Payer & Group */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Paid By</label>
              <select
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.id === currentUser.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Group (Optional)</label>
              <select
                value={groupId || ''}
                onChange={(e) => setGroupId(e.target.value ? e.target.value : null)}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Personal (No group)</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Splits section (for expenses) */}
          {type === 'expense' && (
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-emerald-500" />
                  Split Among Participants
                </span>
                <span className="text-xs font-medium text-slate-400">
                  {selectedUserIds.length} selected
                </span>
              </div>

              {/* User Selector Pills */}
              <div className="flex flex-wrap gap-2">
                {users.map((u) => {
                  const isSelected = selectedUserIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleUserSelection(u.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                        isSelected
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      <img src={u.avatar_url || ''} alt={u.name} className="w-4 h-4 rounded-full object-cover" />
                      <span>{u.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Split Preview */}
              {totalMinor > 0 && selectedUserIds.length > 0 && (
                <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-xl text-xs space-y-1">
                  <div className="text-slate-400 font-medium">Deterministic Equal Shares:</div>
                  {Object.entries(splitEqual(totalMinor, selectedUserIds)).map(([uid, share]) => {
                    const u = users.find((user) => user.id === uid);
                    return (
                      <div key={uid} className="flex justify-between font-medium">
                        <span>{u?.name}:</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {formatMinorUnits(share, currentUser.default_currency)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Invariant guarantee */}
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Integer Minor Units: Exact sum verified in /lib/ledger</span>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-750 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-semibold shadow-lg shadow-emerald-600/25 transition"
            >
              Save Transaction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
