'use client';

import React, { useEffect, useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits } from '@/lib/ledger';
import { X, Users, ShieldCheck, Camera, Plus, Trash2, AlertTriangle } from 'lucide-react';
import {
  LEDGER_CURRENCY,
  computeSplits,
  friendlyError,
  itemsSubtotalMinor,
  parseAmountInput,
  previewMinor,
  pruneClaims,
  type FormItem,
} from './addExpenseLogic';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: 'expense' | 'income';
  defaultGroupId?: string | null;
  onOpenReceiptScanner?: () => void;
  /** Optional pre-fill (e.g. from a Careem order/ride). Applied when the modal opens. */
  prefill?: AddExpensePrefill | null;
}

export interface AddExpensePrefill {
  title: string;
  amountMinor: number;
  notes?: string;
  /** Category name or hint (e.g. 'ride', 'food', 'groceries', 'Transportation'); best-match by name. */
  categoryName?: string;
  items?: { name: string; amountMinor: number }[];
  paymentMethod?: string;
}

/** Keyword synonyms used to map a category hint onto the user's category list. */
const CATEGORY_HINTS: { match: RegExp; keywords: string[] }[] = [
  { match: /ride|taxi|car|transport|trip|cab/i, keywords: ['transport', 'travel', 'ride', 'taxi'] },
  { match: /grocer|quik|supermarket|market/i, keywords: ['grocer'] },
  { match: /food|dining|restaurant|meal|dinner|lunch/i, keywords: ['food', 'dining', 'restaurant'] },
  { match: /box|deliver|courier|parcel|package/i, keywords: ['delivery', 'shipping', 'courier', 'other'] },
];

function findCategoryId(categories: { id: string; name: string }[], hint?: string): string | null {
  if (!hint) return null;
  const h = hint.trim().toLowerCase();
  const exact = categories.find((c) => c.name.toLowerCase() === h);
  if (exact) return exact.id;
  const partial = categories.find((c) => c.name.toLowerCase().includes(h) || h.includes(c.name.toLowerCase()));
  if (partial) return partial.id;
  for (const rule of CATEGORY_HINTS) {
    if (!rule.match.test(h)) continue;
    for (const kw of rule.keywords) {
      const hit = categories.find((c) => c.name.toLowerCase().includes(kw));
      if (hit) return hit.id;
    }
  }
  return null;
}

/** Only digits, "," and "." may be typed into money fields (blocks "e", "+", "-"). */
const isMoneyKeystroke = (v: string) => /^[0-9.,]*$/.test(v);

function minorToMajorStr(amountMinor: number): string {
  return (Math.round(amountMinor) / 100).toFixed(2);
}

export function AddExpenseModal(props: AddExpenseModalProps) {
  // The form is unmounted while closed, so every open starts from fresh defaults
  // (then defaultType / defaultGroupId / prefill are applied in the initial state).
  if (!props.isOpen) return null;
  return <AddExpenseForm {...props} />;
}

const DEFAULT_ITEM = (): FormItem => ({ id: `item-${Date.now()}`, name: 'Item 1', amountStr: '', assignedUserIds: [] });

function AddExpenseForm({ onClose, defaultType = 'expense', defaultGroupId = null, onOpenReceiptScanner, prefill = null }: AddExpenseModalProps) {
  const { currentUser, users, categories, groups, visibleGroups, addTransaction, getGroupMembers } = usePayd();

  /** People who may take part: the group's members, or everyone for a personal expense. */
  const membersFor = (gid: string | null) => {
    if (!gid) return users;
    const members = getGroupMembers(gid);
    return members.length > 0 ? members : users;
  };
  const defaultSelectionFor = (gid: string | null) =>
    gid ? membersFor(gid).map((u) => u.id) : [currentUser.id];
  const defaultPayerFor = (gid: string | null) => {
    const members = membersFor(gid);
    return members.some((u) => u.id === currentUser.id) ? currentUser.id : members[0]?.id ?? currentUser.id;
  };

  const initialGroupId = defaultGroupId && groups.some((g) => g.id === defaultGroupId) ? defaultGroupId : null;
  const prefillItems = (prefill?.items || []).filter((i) => i && i.name);

  const [type, setType] = useState<'expense' | 'income'>(prefill ? 'expense' : defaultType);
  const [title, setTitle] = useState(prefill?.title || '');
  const [amountStr, setAmountStr] = useState(
    prefill && prefill.amountMinor > 0 ? minorToMajorStr(prefill.amountMinor) : ''
  );
  const [categoryId, setCategoryId] = useState(
    findCategoryId(categories, prefill?.categoryName) || categories[0]?.id || ''
  );
  const [payerId, setPayerId] = useState(() => defaultPayerFor(initialGroupId));
  const [groupId, setGroupId] = useState<string | null>(initialGroupId);
  const [paymentMethod, setPaymentMethod] = useState(prefill?.paymentMethod || 'Card');
  const [notes, setNotes] = useState(prefill?.notes || '');
  const [splitMethod, setSplitMethod] = useState<'equal' | 'exact' | 'itemized'>(
    prefillItems.length > 0 ? 'itemized' : 'equal'
  );
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(() => defaultSelectionFor(initialGroupId));
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [manualItems, setManualItems] = useState<FormItem[]>(() =>
    prefillItems.length > 0
      ? prefillItems.map((item, idx) => ({
          id: `prefill-${idx}`,
          name: item.name,
          amountStr: minorToMajorStr(item.amountMinor || 0),
          // Empty = shared across all selected participants until someone taps to claim.
          assignedUserIds: [],
        }))
      : [DEFAULT_ITEM()]
  );
  const [error, setError] = useState<string | null>(null);
  const [claimWarning, setClaimWarning] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const availableUsers = membersFor(groupId);
  const nameOf = (uid: string) => users.find((u) => u.id === uid)?.name || 'Someone';

  const manualItemsTotalMinor = itemsSubtotalMinor(manualItems);
  const usingItemSubtotal = splitMethod === 'itemized' && type === 'expense' && manualItemsTotalMinor > 0 && !amountStr.trim();
  const effectiveTotalMinor = usingItemSubtotal ? manualItemsTotalMinor : previewMinor(amountStr);

  const splitInput = {
    type,
    totalMinor: effectiveTotalMinor,
    payerId,
    splitMethod,
    participantIds: selectedUserIds,
    exactAmounts,
    items: manualItems,
    nameOf,
  };
  // Live preview (equal / itemized); exact mode is validated on save.
  const livePreview =
    type === 'expense' && splitMethod !== 'exact' && effectiveTotalMinor > 0 ? computeSplits(splitInput) : null;

  /** Applies a new participant list and drops claims by anyone no longer participating. */
  const applyParticipants = (next: string[]) => {
    setSelectedUserIds(next);
    setExactAmounts((prev) => Object.fromEntries(Object.entries(prev).filter(([uid]) => next.includes(uid))));
    const { items, orphaned } = pruneClaims(manualItems, next);
    if (items !== manualItems) setManualItems(items);
    if (orphaned.length > 0) {
      setClaimWarning(
        `${orphaned.map((n) => `"${n}"`).join(', ')} ${orphaned.length === 1 ? 'was' : 'were'} claimed only by someone you removed, so ${orphaned.length === 1 ? 'it is' : 'they are'} now shared by everyone. Tap names to re-assign.`
      );
    }
  };

  const handleGroupChange = (gid: string | null) => {
    setGroupId(gid);
    setError(null);
    const allowed = membersFor(gid).map((u) => u.id);
    if (!allowed.includes(payerId)) setPayerId(defaultPayerFor(gid));
    // A group resets to all of its members; "Personal" keeps the current picks (everyone is eligible).
    const kept = selectedUserIds.filter((id) => allowed.includes(id));
    applyParticipants(gid ? allowed : kept.length > 0 ? kept : [currentUser.id]);
  };

  const toggleUserSelection = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      if (selectedUserIds.length === 1) return; // keep at least 1
      applyParticipants(selectedUserIds.filter((id) => id !== userId));
    } else {
      applyParticipants([...selectedUserIds, userId]);
    }
  };

  const handleToggleManualItemUser = (itemId: string, userId: string) => {
    setManualItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const current = item.assignedUserIds;
        // Removing the last claimant makes the item shared by everyone again.
        return current.includes(userId)
          ? { ...item, assignedUserIds: current.filter((id) => id !== userId) }
          : { ...item, assignedUserIds: [...current, userId] };
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
        assignedUserIds: [],
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
      if (!title.trim()) throw new Error('Please enter a description.');

      let totalMinor = effectiveTotalMinor;
      if (!usingItemSubtotal) {
        const parsed = parseAmountInput(amountStr);
        if (!parsed.ok) {
          throw new Error(
            splitMethod === 'itemized' && type === 'expense' && !amountStr.trim()
              ? 'Enter a total amount, or add prices to the items.'
              : parsed.error
          );
        }
        totalMinor = parsed.value;
      }

      const result = computeSplits({ ...splitInput, totalMinor });
      if (!result.ok) throw new Error(result.error);

      addTransaction({
        type,
        title: title.trim(),
        amount_minor: totalMinor,
        currency: LEDGER_CURRENCY,
        category_id: categoryId || null,
        payer_id: payerId,
        group_id: groupId || null,
        payment_method: paymentMethod,
        notes: notes.trim() || null,
        splits: result.splits,
      });

      onClose();
    } catch (err: unknown) {
      setError(friendlyError(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div role="dialog" aria-modal="true" aria-label={type === 'income' ? 'Record income' : 'Add new expense'} className="w-full max-w-lg bg-[#18181b] border border-white/10 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4 font-body">
        {/* Handle for sheet feel */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/8">
          <div className="flex items-center gap-2">
            <span className="font-heading text-sm text-white">
              {type === 'income' ? 'RECORD INCOME' : 'ADD NEW EXPENSE'}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-full text-zinc-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div role="alert" className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Type Toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#27272a] rounded-2xl">
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`py-2 text-sm font-semibold rounded-xl transition ${
                type === 'expense'
                  ? 'bg-silver-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={`py-2 text-sm font-semibold rounded-xl transition ${
                type === 'income'
                  ? 'bg-silver-600 text-white shadow-md'
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
              className="w-full py-2.5 px-3 rounded-xl bg-silver-500/15 hover:bg-silver-500/25 border border-silver-500/30 text-silver-300 text-sm font-semibold flex items-center justify-center gap-2 transition active:scale-95"
            >
              <Camera className="w-4 h-4 text-silver-400" />
              <span>Or scan paper receipt with Payd Lens</span>
            </button>
          )}

          {/* Title */}
          <div>
            <label className="text-[11px] font-heading text-zinc-400">Description</label>
            <input
              type="text"
              required
              aria-label="Description"
              placeholder="e.g. Dinner with team, Grocery run, Salary"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full mt-1 px-3.5 py-2.5 text-sm bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-silver-500 text-white placeholder:text-zinc-600 font-body"
            />
          </div>

          {/* Amount & Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-heading text-zinc-400">Amount</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-silver-400">
                  {LEDGER_CURRENCY}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.,]*"
                  autoComplete="off"
                  aria-label="Amount in AED"
                  required={!(splitMethod === 'itemized' && type === 'expense' && manualItemsTotalMinor > 0)}
                  placeholder={
                    splitMethod === 'itemized' && type === 'expense' && manualItemsTotalMinor > 0
                      ? minorToMajorStr(manualItemsTotalMinor)
                      : '0.00'
                  }
                  value={amountStr}
                  onChange={(e) => isMoneyKeystroke(e.target.value) && setAmountStr(e.target.value)}
                  className="w-full pl-14 pr-3 py-2.5 text-sm font-bold bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-silver-500 text-white font-body"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-heading text-zinc-400">Category</label>
              <select
                aria-label="Category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-silver-500 text-white font-body"
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
              <label className="text-[11px] font-heading text-zinc-400">Paid by</label>
              <select
                aria-label="Paid by"
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-silver-500 text-white font-body"
              >
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.id === currentUser.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-heading text-zinc-400">Ledger group</label>
              <select
                aria-label="Ledger group"
                value={groupId || ''}
                onChange={(e) => handleGroupChange(e.target.value ? e.target.value : null)}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-silver-500 text-white font-body"
              >
                <option value="">Personal (No group)</option>
                {/* Only groups you belong to (plus a preselected one, e.g. from a prefill). */}
                {groups.filter((g) => g.id === groupId || visibleGroups.some((v) => v.id === g.id)).map((g) => (
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
                  <Users className="w-3.5 h-3.5 text-silver-400" />
                  SPLIT PARTICIPANTS ({selectedUserIds.length})
                </span>
                {/* Split Strategy Switcher */}
                <div className="flex rounded-lg bg-[#27272a] p-0.5 text-[11px] font-heading">
                  <button
                    type="button"
                    onClick={() => setSplitMethod('equal')}
                    className={`px-2.5 py-1 rounded-md transition ${
                      splitMethod === 'equal'
                        ? 'bg-silver-600 text-white shadow-xs'
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
                        ? 'bg-silver-600 text-white shadow-xs'
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
                        ? 'bg-silver-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Exact
                  </button>
                </div>
              </div>

              {/* User Selector Pills */}
              <div className="flex flex-wrap gap-1.5">
                {availableUsers.map((u) => {
                  const isSelected = selectedUserIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleUserSelection(u.id)}
                      aria-pressed={isSelected}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                        isSelected
                          ? 'bg-silver-600 text-white shadow-xs font-bold'
                          : 'bg-[#27272a] text-zinc-400 hover:text-white'
                      }`}
                    >
                      <div className="w-4 h-4 rounded-full bg-silver-400/30 text-white flex items-center justify-center text-[9px] font-bold">
                        {u.name.slice(0, 1)}
                      </div>
                      <span>{u.name}</span>
                    </button>
                  );
                })}
              </div>

              {groupId && (
                <p className="text-[10px] text-zinc-500">
                  Only members of {groups.find((g) => g.id === groupId)?.name ?? 'this group'} can be part of this split.
                </p>
              )}

              {claimWarning && (
                <div role="alert" className="flex items-start gap-2 p-2.5 text-[11px] bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span className="flex-1">{claimWarning}</span>
                  <button type="button" onClick={() => setClaimWarning(null)} className="font-bold hover:underline">
                    OK
                  </button>
                </div>
              )}

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
                      className="flex items-center gap-1 text-silver-400 text-xs font-bold hover:underline"
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
                              className="flex-1 px-2.5 py-1.5 text-xs bg-[#09090b] border border-white/10 rounded-lg focus:outline-none focus:border-silver-500 text-white"
                            />
                            <div className="w-28 relative">
                              <input
                                type="text"
                                inputMode="decimal"
                                pattern="[0-9.,]*"
                                autoComplete="off"
                                aria-label={`Price of ${item.name || 'item'} in AED`}
                                placeholder="0.00"
                                value={item.amountStr}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (!isMoneyKeystroke(val)) return;
                                  setManualItems((prev) =>
                                    prev.map((i) => (i.id === item.id ? { ...i, amountStr: val } : i))
                                  );
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-[#09090b] border border-white/10 rounded-lg focus:outline-none focus:border-silver-500 text-white text-right pr-9 font-semibold"
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
                            <span className="text-[10px] text-zinc-500 font-medium">
                              {count === 0 ? 'Shared by all · tap to claim:' : 'Claimed:'}
                            </span>
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
                                      ? 'bg-silver-600 text-white font-semibold'
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

                  {/* Item subtotal vs bill total */}
                  <div className="p-2.5 bg-[#202025] rounded-xl text-[11px] space-y-0.5">
                    <div className="flex justify-between text-zinc-400">
                      <span>Items subtotal</span>
                      <span className="font-semibold text-zinc-200">
                        {formatMinorUnits(manualItemsTotalMinor, LEDGER_CURRENCY)}
                      </span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Bill total{usingItemSubtotal ? ' (from items)' : ''}</span>
                      <span className="font-semibold text-zinc-200">
                        {formatMinorUnits(effectiveTotalMinor, LEDGER_CURRENCY)}
                      </span>
                    </div>
                    {manualItemsTotalMinor === 0 ? (
                      <div className="text-zinc-500 pt-0.5">No item prices yet, so the total is split equally.</div>
                    ) : effectiveTotalMinor > 0 && effectiveTotalMinor !== manualItemsTotalMinor ? (
                      <div className="text-amber-300 pt-0.5">
                        {formatMinorUnits(Math.abs(effectiveTotalMinor - manualItemsTotalMinor), LEDGER_CURRENCY)}{' '}
                        {effectiveTotalMinor > manualItemsTotalMinor
                          ? 'extra (fees, delivery, tax or tip)'
                          : 'less (discount or promo)'}{' '}
                        is shared in proportion to each person&apos;s items.
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {/* EXACT MODE: Amount per person */}
              {splitMethod === 'exact' && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-heading text-zinc-300">
                    Exact amount per participant
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
                              type="text"
                              inputMode="decimal"
                              pattern="[0-9.,]*"
                              autoComplete="off"
                              aria-label={`Amount for ${u?.name ?? 'participant'} in AED`}
                              placeholder="0.00"
                              value={exactAmounts[uid] || ''}
                              onChange={(e) =>
                                isMoneyKeystroke(e.target.value) &&
                                setExactAmounts({ ...exactAmounts, [uid]: e.target.value })
                              }
                              className="w-full px-2.5 py-1.5 text-xs bg-[#09090b] border border-white/10 rounded-lg text-right pr-9 font-semibold text-white focus:outline-none focus:border-silver-500"
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

              {/* EQUAL / ITEMIZED split preview */}
              {livePreview?.ok && (
                <div className="p-3 bg-[#202025] rounded-xl text-xs space-y-1">
                  <div className="text-zinc-400 font-medium">
                    {splitMethod === 'equal' ? 'Equal shares:' : 'Each person pays:'}
                  </div>
                  {livePreview.splits.map(({ user_id: uid, share_minor: share }) => (
                    <div key={uid} className="flex justify-between font-medium">
                      <span className="text-zinc-300">{nameOf(uid)}:</span>
                      <span className="font-semibold text-white">{formatMinorUnits(share, LEDGER_CURRENCY)}</span>
                    </div>
                  ))}
                </div>
              )}
              {livePreview && !livePreview.ok && (
                <div role="status" className="flex items-start gap-2 p-2.5 text-[11px] bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{livePreview.error}</span>
                </div>
              )}
            </div>
          )}

          {/* Accuracy note */}
          <div className="flex items-center gap-1.5 text-[11px] text-[#10B981]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Shares always add up to the exact total</span>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2 font-body">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-white/10 text-zinc-300 hover:bg-[#27272a] text-sm font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-silver-100 hover:bg-white text-zinc-900 text-sm font-semibold transition active:scale-95"
            >
              {type === 'income' ? 'Save Income' : 'Save Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
