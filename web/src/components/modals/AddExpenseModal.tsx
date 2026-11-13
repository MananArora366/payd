'use client';

import React, { useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits, parseMajorToMinor, splitEqual, splitExact, splitPercentage, splitShares } from '@/lib/ledger';
import { calculateItemizedShares } from '@/lib/ai/receipt-scan';
import { X, Check, Users, Sparkles, ShieldCheck, Camera, Plus, Trash2, Split } from 'lucide-react';

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
  const [splitMethod, setSplitMethod] = useState<'equal' | 'exact' | 'itemized'>('equal');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([currentUser.id]);
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [manualItems, setManualItems] = useState<
    { id: string; name: string; amountStr: string; assignedUserIds: string[] }[]
  >([
    { id: '1', name: 'Item 1', amountStr: '', assignedUserIds: [currentUser.id] },
  ]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Compute manual items subtotal if in itemized mode
  const manualItemsTotalMinor = manualItems.reduce((acc, item) => {
    return acc + parseMajorToMinor(item.amountStr || '0', currentUser.default_currency);
  }, 0);

  const effectiveTotalMinor =
    splitMethod === 'itemized' && manualItemsTotalMinor > 0 && !amountStr.trim()
      ? manualItemsTotalMinor
      : parseMajorToMinor(amountStr, currentUser.default_currency);

  const toggleUserSelection = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      if (selectedUserIds.length === 1) return; // keep at least 1
      setSelectedUserIds(selectedUserIds.filter((id) => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const handleToggleManualItemUser = (itemId: string, userId: string) => {
    setManualItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const current = item.assignedUserIds;
        if (current.includes(userId)) {
          if (current.length === 1) return item;
          return { ...item, assignedUserIds: current.filter((id) => id !== userId) };
        } else {
          return { ...item, assignedUserIds: [...current, userId] };
        }
      })
    );
  };

  const handleAddManualItem = () => {
    setManualItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}`,
        name: `Item ${prev.length + 1}`,
        amountStr: '',
        assignedUserIds: [...selectedUserIds],
      },
    ]);
  };

  const handleRemoveManualItem = (itemId: string) => {
    if (manualItems.length <= 1) return;
    setManualItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (!title.trim()) throw new Error('Please enter a description');
      if (effectiveTotalMinor <= 0) throw new Error('Please enter an amount greater than 0');

      let splitsToSave: { user_id: string; share_minor: number }[] = [];

      if (type === 'income') {
        splitsToSave = [{ user_id: payerId, share_minor: effectiveTotalMinor }];
      } else {
        if (splitMethod === 'equal') {
          const splitObj = splitEqual(effectiveTotalMinor, selectedUserIds);
          splitsToSave = Object.entries(splitObj).map(([uid, share]) => ({
            user_id: uid,
            share_minor: share,
          }));
        } else if (splitMethod === 'exact') {
          // Exact split
          const alloc: Record<string, number> = {};
          for (const uid of selectedUserIds) {
            alloc[uid] = parseMajorToMinor(exactAmounts[uid] || '0', currentUser.default_currency);
          }
          const splitObj = splitExact(effectiveTotalMinor, alloc);
          splitsToSave = Object.entries(splitObj).map(([uid, share]) => ({
            user_id: uid,
            share_minor: share,
          }));
        } else {
          // Itemized split
          const lineItems = manualItems.map((item) => ({
            name: item.name || 'Item',
            quantity: 1,
            price_minor: parseMajorToMinor(item.amountStr || '0', currentUser.default_currency),
          }));
          const assignments: Record<number, string[]> = {};
          manualItems.forEach((item, idx) => {
            assignments[idx] = item.assignedUserIds.length > 0 ? item.assignedUserIds : selectedUserIds;
          });

          const splitObj = calculateItemizedShares(
            effectiveTotalMinor,
            lineItems,
            assignments,
            selectedUserIds
          );
          splitsToSave = Object.entries(splitObj).map(([uid, share]) => ({
            user_id: uid,
            share_minor: share,
          }));
        }
      }

      addTransaction({
        type,
        title: title.trim(),
        amount_minor: effectiveTotalMinor,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-[#18181b] border border-white/10 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4 font-body">
        {/* Handle for sheet feel */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/8">
          <div className="flex items-center gap-2">
            <span className="font-heading text-sm text-white">
              {type === 'income' ? 'RECORD INCOME' : 'ADD NEW EXPENSE'}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-zinc-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type Toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#27272a] rounded-2xl">
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`py-2 text-xs font-heading tracking-wider rounded-xl transition ${
                type === 'expense'
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={`py-2 text-xs font-heading tracking-wider rounded-xl transition ${
                type === 'income'
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
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
              className="w-full py-2.5 px-3 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 text-violet-300 text-xs font-heading tracking-wider flex items-center justify-center gap-2 transition active:scale-95"
            >
              <Camera className="w-4 h-4 text-violet-400" />
              <span>Or scan paper receipt with Payd Lens</span>
            </button>
          )}

          {/* Title */}
          <div>
            <label className="text-[11px] font-heading text-zinc-400">DESCRIPTION</label>
            <input
              type="text"
              required
              placeholder="e.g. Dinner with team, Grocery run, Salary"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full mt-1 px-3.5 py-2.5 text-sm bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-violet-500 text-white placeholder:text-zinc-600 font-body"
            />
          </div>

          {/* Amount & Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-heading text-zinc-400">AMOUNT</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-violet-400">
                  {currentUser.default_currency}
                </span>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="w-full pl-14 pr-3 py-2.5 text-sm font-bold bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-violet-500 text-white font-body"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-heading text-zinc-400">CATEGORY</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-violet-500 text-white font-body"
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
              <label className="text-[11px] font-heading text-zinc-400">PAID BY</label>
              <select
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-violet-500 text-white font-body"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.id === currentUser.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-heading text-zinc-400">LEDGER GROUP</label>
              <select
                value={groupId || ''}
                onChange={(e) => setGroupId(e.target.value ? e.target.value : null)}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-violet-500 text-white font-body"
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
            <div className="space-y-3.5 pt-2 border-t border-white/8">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-heading text-zinc-400 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-violet-400" />
                  SPLIT PARTICIPANTS ({selectedUserIds.length})
                </span>
                {/* Split Strategy Switcher */}
                <div className="flex rounded-lg bg-[#27272a] p-0.5 text-[11px] font-heading">
                  <button
                    type="button"
                    onClick={() => setSplitMethod('equal')}
                    className={`px-2.5 py-1 rounded-md transition ${
                      splitMethod === 'equal'
                        ? 'bg-violet-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Equal
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitMethod('itemized')}
                    className={`px-2.5 py-1 rounded-md transition ${
                      splitMethod === 'itemized'
                        ? 'bg-violet-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Itemize
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitMethod('exact')}
                    className={`px-2.5 py-1 rounded-md transition ${
                      splitMethod === 'exact'
                        ? 'bg-violet-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Exact
                  </button>
                </div>
              </div>

              {/* User Selector Pills */}
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
                          ? 'bg-violet-600 text-white shadow-xs font-bold'
                          : 'bg-[#27272a] text-zinc-400 hover:text-white'
                      }`}
                    >
                      <div className="w-4 h-4 rounded-full bg-violet-400/30 text-white flex items-center justify-center text-[9px] font-bold">
                        {u.name.slice(0, 1)}
                      </div>
                      <span>{u.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* ITEMIZE MODE: Tap-to-Claim line items */}
              {splitMethod === 'itemized' && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-heading text-zinc-300">
                      LINE ITEMS ({manualItems.length})
                    </span>
                    <button
                      type="button"
                      onClick={handleAddManualItem}
                      className="flex items-center gap-1 text-violet-400 text-xs font-bold hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Item
                    </button>
                  </div>

                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {manualItems.map((item, idx) => {
                      const count = item.assignedUserIds.length;
                      const fraction = count > 1 ? `¹/${count}` : '';
                      return (
                        <div
                          key={item.id}
                          className="p-3 bg-[#202025] border border-white/6 rounded-2xl space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={item.name}
                              placeholder={`Item ${idx + 1}`}
                              onChange={(e) => {
                                const val = e.target.value;
                                setManualItems((prev) =>
                                  prev.map((i) => (i.id === item.id ? { ...i, name: val } : i))
                                );
                              }}
                              className="flex-1 px-2.5 py-1.5 text-xs bg-[#09090b] border border-white/10 rounded-lg focus:outline-none focus:border-violet-500 text-white"
                            />
                            <div className="w-28 relative">
                              <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={item.amountStr}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setManualItems((prev) =>
                                    prev.map((i) => (i.id === item.id ? { ...i, amountStr: val } : i))
                                  );
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-[#09090b] border border-white/10 rounded-lg focus:outline-none focus:border-violet-500 text-white text-right pr-9 font-semibold"
                              />
                              <span className="absolute right-2 top-1.5 text-[10px] text-zinc-500 font-semibold pointer-events-none">
                                AED
                              </span>
                            </div>
                            {manualItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveManualItem(item.id)}
                                className="p-1.5 text-zinc-400 hover:text-rose-400 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Friends tap-to-claim chips for this item */}
                          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                            <span className="text-[10px] text-zinc-500 font-medium">Claimed:</span>
                            {selectedUserIds.map((uid) => {
                              const u = users.find((usr) => usr.id === uid);
                              if (!u) return null;
                              const isClaimed = item.assignedUserIds.includes(uid);
                              return (
                                <button
                                  key={uid}
                                  type="button"
                                  onClick={() => handleToggleManualItemUser(item.id, uid)}
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition ${
                                    isClaimed
                                      ? 'bg-violet-600 text-white font-semibold'
                                      : 'bg-[#27272a] text-zinc-400 border border-white/6'
                                  }`}
                                >
                                  {u.name} {isClaimed && fraction ? `(${fraction})` : ''}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* EXACT MODE: Amount per person */}
              {splitMethod === 'exact' && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-heading text-zinc-300">
                    EXACT AMOUNT PER PARTICIPANT
                  </span>
                  <div className="space-y-1.5">
                    {selectedUserIds.map((uid) => {
                      const u = users.find((usr) => usr.id === uid);
                      return (
                        <div key={uid} className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-zinc-300 font-medium">
                            {u?.name}
                          </span>
                          <div className="w-32 relative">
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={exactAmounts[uid] || ''}
                              onChange={(e) =>
                                setExactAmounts({ ...exactAmounts, [uid]: e.target.value })
                              }
                              className="w-full px-2.5 py-1.5 text-xs bg-[#09090b] border border-white/10 rounded-lg text-right pr-9 font-semibold text-white focus:outline-none focus:border-violet-500"
                            />
                            <span className="absolute right-2 top-1.5 text-[10px] text-zinc-500 font-semibold pointer-events-none">
                              AED
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* EQUAL MODE Split Preview */}
              {splitMethod === 'equal' && effectiveTotalMinor > 0 && selectedUserIds.length > 0 && (
                <div className="p-3 bg-[#202025] rounded-xl text-xs space-y-1">
                  <div className="text-zinc-400 font-medium">Deterministic Equal Shares:</div>
                  {Object.entries(splitEqual(effectiveTotalMinor, selectedUserIds)).map(([uid, share]) => {
                    const u = users.find((user) => user.id === uid);
                    return (
                      <div key={uid} className="flex justify-between font-medium">
                        <span className="text-zinc-300">{u?.name}:</span>
                        <span className="font-semibold text-white">
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
          <div className="flex items-center gap-1.5 text-[11px] text-[#10B981]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Integer Minor Units: Exact sum verified with zero loss in /lib/ledger</span>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2 font-body">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-white/10 text-zinc-300 hover:bg-[#27272a] text-xs font-heading tracking-wider transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white text-xs font-heading tracking-wider shadow-lg shadow-violet-600/30 transition active:scale-95"
            >
              Save Expense
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
