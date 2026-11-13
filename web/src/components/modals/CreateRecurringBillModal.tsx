'use client';

import React, { useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits, parseMajorToMinor, splitEqual } from '@/lib/ledger';
import { RecurringFrequency } from '@/types/database';
import { X, Repeat, Users, ShieldCheck } from 'lucide-react';

interface CreateRecurringBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGroupId?: string | null;
}

export function CreateRecurringBillModal({
  isOpen,
  onClose,
  defaultGroupId = null,
}: CreateRecurringBillModalProps) {
  const { currentUser, users, groups, categories, addRecurringBill } = usePayd();

  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [dueDay, setDueDay] = useState(1);
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [payerId, setPayerId] = useState(currentUser.id);
  const [groupId, setGroupId] = useState<string | null>(defaultGroupId || groups[0]?.id || null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(users.map((u) => u.id));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const totalMinor = parseMajorToMinor(amountStr, currentUser.default_currency);

  const toggleUserSelection = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      if (selectedUserIds.length === 1) return;
      setSelectedUserIds(selectedUserIds.filter((id) => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (!title.trim()) throw new Error('Please enter a subscription / bill title');
      if (totalMinor <= 0) throw new Error('Please enter an amount greater than 0');

      const splitObj = splitEqual(totalMinor, selectedUserIds);
      const splits = Object.entries(splitObj).map(([uid, share]) => ({
        user_id: uid,
        share_minor: share,
      }));

      addRecurringBill({
        title: title.trim(),
        amount_minor: totalMinor,
        currency: currentUser.default_currency,
        category_id: categoryId || null,
        payer_id: payerId,
        group_id: groupId || null,
        frequency,
        due_day: dueDay,
        notes: notes.trim() || null,
        auto_post: false,
        last_posted_at: null,
        splits,
      });

      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save recurring bill');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-[#18181b] border border-white/10 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4 text-white font-body">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/8">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-violet-500/20 text-violet-400">
              <Repeat className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading text-sm text-white">
                NEW SHARED SUBSCRIPTION
              </h3>
              <p className="text-xs text-zinc-400 font-body">Automate recurring Wi-Fi, rent, DEWA, or Netflix</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Subscription Title
            </label>
            <input
              type="text"
              placeholder="e.g. Du 5G Wi-Fi, DEWA Bill, Netflix 4K"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full mt-1 px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Amount ({currentUser.default_currency})
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="w-full mt-1 px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Frequency
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Due Day of Month
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={dueDay}
                onChange={(e) => setDueDay(parseInt(e.target.value, 10) || 1)}
                className="w-full mt-1 px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Who Pays Front-Line?
              </label>
              <select
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.id === currentUser.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Assign to Group
              </label>
              <select
                value={groupId || ''}
                onChange={(e) => setGroupId(e.target.value ? e.target.value : null)}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Personal (No group)</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Participants to Split Among */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-purple-500" />
                Split Subscriptions Between ({selectedUserIds.length})
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {users.map((u) => {
                const isSelected = selectedUserIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleUserSelection(u.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                      isSelected
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    <img src={u.avatar_url || ''} alt={u.name} className="w-4 h-4 rounded-full object-cover" />
                    <span>{u.name}</span>
                  </button>
                );
              })}
            </div>

            {totalMinor > 0 && selectedUserIds.length > 0 && (
              <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-xl text-xs space-y-1">
                <div className="text-slate-400 font-medium">Equal Share per member:</div>
                <div className="font-bold text-slate-900 dark:text-white text-sm">
                  {formatMinorUnits(Math.round(totalMinor / selectedUserIds.length), currentUser.default_currency)} / {frequency === 'monthly' ? 'month' : frequency === 'weekly' ? 'week' : 'year'}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Posting this will log an immutable transaction into the ledger automatically</span>
          </div>

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
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-purple-600/25 transition"
            >
              Create Subscription
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
