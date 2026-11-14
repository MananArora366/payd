'use client';

import React, { useEffect, useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits, splitEqual } from '@/lib/ledger';
import { useVisibleGroups } from '@/components/groups/useVisibleGroups';
import { parseAmountInput } from '@/components/groups/groupLogic';
import { clampDueDay, dueDayRange, WEEKDAY_NAMES } from '@/components/recurring/recurringPeriod';
import { RecurringFrequency } from '@/types/database';
import { X, Repeat, Users, ShieldCheck } from 'lucide-react';
import { useDialog } from '@/lib/hooks/useDialog';

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
  const { currentUser, users, categories, addRecurringBill, getGroupMembers } = usePayd();
  const groups = useVisibleGroups();

  const defaultCategoryId = () => {
    const byName = (re: RegExp) => categories.find((c) => re.test(c.name))?.id;
    return byName(/subscription/i) || byName(/utilit|bill/i) || categories[0]?.id || '';
  };
  const initialGroupId = () =>
    (defaultGroupId && groups.some((g) => g.id === defaultGroupId) ? defaultGroupId : groups[0]?.id) || null;
  // Group selected: only its members. Personal: everyone.
  const eligibleFor = (gid: string | null) => (gid ? getGroupMembers(gid) : users);

  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [dueDay, setDueDay] = useState(1);
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [payerId, setPayerId] = useState(currentUser.id);
  const [groupId, setGroupId] = useState<string | null>(initialGroupId);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(() => eligibleFor(initialGroupId()).map((u) => u.id));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const applyGroup = (gid: string | null) => {
    setGroupId(gid);
    const members = eligibleFor(gid);
    setSelectedUserIds(members.map((u) => u.id));
    setPayerId((prev) =>
      members.some((u) => u.id === prev)
        ? prev
        : members.some((u) => u.id === currentUser.id)
        ? currentUser.id
        : members[0]?.id || currentUser.id
    );
  };

  // Reset the form every time the modal opens
  useEffect(() => {
    if (!isOpen) return;
    setTitle('');
    setAmountStr('');
    setFrequency('monthly');
    setDueDay(1);
    setCategoryId(defaultCategoryId());
    setPayerId(currentUser.id);
    setNotes('');
    setError(null);
    applyGroup(initialGroupId());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultGroupId, currentUser.id]);

  const { dialogProps, titleId } = useDialog(isOpen, onClose);

  if (!isOpen) return null;

  const eligibleUsers = eligibleFor(groupId);
  const eligibleIds = new Set(eligibleUsers.map((u) => u.id));
  const participantIds = selectedUserIds.filter((id) => eligibleIds.has(id));
  const amountCheck = parseAmountInput(amountStr);
  const totalMinor = amountCheck.ok ? amountCheck.value : 0;
  const isWeekly = frequency === 'weekly';
  const dueRange = dueDayRange(frequency);

  const toggleUserSelection = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      if (participantIds.length === 1) return;
      setSelectedUserIds(selectedUserIds.filter((id) => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Please enter a subscription or bill title.');
      return;
    }
    if (!amountCheck.ok) {
      setError(amountCheck.error);
      return;
    }
    if (participantIds.length === 0) {
      setError('Pick at least one person to split with.');
      return;
    }
    if (!eligibleIds.has(payerId)) {
      setError('The payer must be a member of the selected group.');
      return;
    }

    try {
      const splitObj = splitEqual(totalMinor, participantIds);
      const splits = Object.entries(splitObj).map(([uid, share]) => ({
        user_id: uid,
        share_minor: share,
      }));

      addRecurringBill({
        title: title.trim(),
        amount_minor: totalMinor,
        currency: 'AED',
        category_id: categoryId || null,
        payer_id: payerId,
        group_id: groupId || null,
        frequency,
        due_day: clampDueDay(dueDay, frequency),
        notes: notes.trim() || null,
        auto_post: false,
        last_posted_at: null,
        splits,
      });

      onClose();
    } catch {
      setError("We couldn't save this recurring bill. Please check the details and try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div {...dialogProps} className="focus:outline-none w-full max-w-lg bg-[#18181b] border border-white/10 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4 text-white font-body">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/8">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-silver-500/20 text-silver-400">
              <Repeat className="w-5 h-5" />
            </div>
            <div>
              <h3 id={titleId} className="font-heading text-sm text-white">
                New shared subscription
              </h3>
              <p className="text-xs text-zinc-400 font-body">Automate recurring Wi-Fi, rent, DEWA, or Netflix</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
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
            <label className="text-xs font-medium text-zinc-400">
              Subscription Title
            </label>
            <input
              type="text"
              placeholder="e.g. Du 5G Wi-Fi, DEWA Bill, Netflix 4K"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full mt-1 px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-silver-500 font-medium"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-400">
                Amount (AED)
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="w-full mt-1 px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-silver-500 font-bold"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-400">
                Frequency
              </label>
              <select
                value={frequency}
                onChange={(e) => {
                  const next = e.target.value as RecurringFrequency;
                  setFrequency(next);
                  setDueDay((d) => clampDueDay(d, next));
                }}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-silver-500 font-medium"
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-400">
                {isWeekly ? 'Due Day of Week' : frequency === 'yearly' ? 'Due Day (of month, yearly)' : 'Due Day of Month'}
              </label>
              {isWeekly ? (
                <select
                  value={clampDueDay(dueDay, 'weekly')}
                  onChange={(e) => setDueDay(parseInt(e.target.value, 10) || 1)}
                  className="w-full mt-1 px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-silver-500"
                >
                  {WEEKDAY_NAMES.map((d, i) => (
                    <option key={d} value={i + 1}>
                      {d}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min={dueRange.min}
                  max={dueRange.max}
                  value={dueDay}
                  onChange={(e) => setDueDay(clampDueDay(parseInt(e.target.value, 10) || 1, frequency))}
                  className="w-full mt-1 px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-silver-500"
                />
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-400">
                Who Pays Front-Line?
              </label>
              <select
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-silver-500 font-medium"
              >
                {eligibleUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.id === currentUser.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-400">
                Assign to Group
              </label>
              <select
                value={groupId || ''}
                onChange={(e) => applyGroup(e.target.value ? e.target.value : null)}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-silver-500"
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
              <label className="text-xs font-medium text-zinc-400">
                Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-silver-500"
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
              <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-silver-500" />
                Split Subscriptions Between ({participantIds.length})
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {eligibleUsers.map((u) => {
                const isSelected = participantIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleUserSelection(u.id)}
                    aria-pressed={isSelected}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                      isSelected
                        ? 'bg-silver-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    <img src={u.avatar_url || ''} alt={u.name} className="w-4 h-4 rounded-full object-cover" />
                    <span>{u.name}</span>
                  </button>
                );
              })}
            </div>

            {totalMinor > 0 && participantIds.length > 0 && (
              <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-xl text-xs space-y-1">
                <div className="text-slate-400 font-medium">Equal Share per member:</div>
                <div className="font-bold text-slate-900 dark:text-white text-sm">
                  {totalMinor % participantIds.length !== 0 ? '≈ ' : ''}
                  {formatMinorUnits(Math.round(totalMinor / participantIds.length), 'AED')} / {frequency === 'monthly' ? 'month' : frequency === 'weekly' ? 'week' : 'year'}
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
              className="flex-1 py-2.5 rounded-xl bg-silver-100 hover:bg-white text-zinc-900 text-sm font-semibold transition"
            >
              Create Subscription
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
