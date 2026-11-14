'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits } from '@/lib/ledger';
import { useDialog } from '@/lib/hooks/useDialog';
import { X, Users, ShieldCheck } from 'lucide-react';
import { LEDGER_CURRENCY, friendlyError } from './addExpenseLogic';
import {
  buildNewSplit,
  previewNewSplit,
  remainingForMethod,
  type NewSplitDraft,
  type NewSplitMethod,
} from '@/components/modals/newSplitLogic';

interface NewSplitModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGroupId?: string | null;
}

const METHODS: { id: NewSplitMethod; label: string; hint: string }[] = [
  { id: 'equal', label: 'Equal', hint: 'Everyone pays the same' },
  { id: 'exact', label: 'Exact', hint: 'Amount per person' },
  { id: 'percentage', label: '%', hint: 'Percent per person' },
  { id: 'shares', label: 'Shares', hint: 'Shares per person' },
];

/** Only digits, "," and "." may be typed into money fields (blocks "e", "+", "-"). */
const isMoneyKeystroke = (v: string) => /^[0-9.,]*$/.test(v);
/** Percent / share fields: digits and a decimal point. */
const isNumberKeystroke = (v: string) => /^[0-9.]*$/.test(v);

const inputClass =
  'w-full mt-1 px-3.5 py-2.5 text-sm bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-brand-500 text-white placeholder:text-zinc-600 font-body';
const selectClass =
  'w-full mt-1 px-3 py-2.5 text-sm bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-brand-500 text-white font-body';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const emptyValues = (): Record<NewSplitMethod, Record<string, string>> => ({
  equal: {},
  exact: {},
  percentage: {},
  shares: {},
});

export function NewSplitModal(props: NewSplitModalProps) {
  // The form is unmounted while closed, so every open starts from fresh defaults.
  if (!props.isOpen) return null;
  return <NewSplitForm {...props} />;
}

function NewSplitForm({ onClose, defaultGroupId = null }: NewSplitModalProps) {
  const { currentUser, users, groups, visibleGroups, categories, getGroupMembers, addTransaction } = usePayd();
  const { dialogProps, titleId } = useDialog(true, onClose);
  const titleRef = useRef<HTMLInputElement | null>(null);

  // Focus the title after useDialog has moved focus into the panel (and captured the opener).
  useEffect(() => {
    const raf = requestAnimationFrame(() => titleRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  /** Groups the user can pick: their own groups, plus a valid preselected one. */
  const groupOptions = groups.filter(
    (g) => visibleGroups.some((v) => v.id === g.id) || g.id === defaultGroupId
  );

  /** People who can take part: the group's members, or all known people without a group. */
  const peopleFor = (gid: string | null) => {
    if (!gid) {
      const others = users.filter((u) => u.id !== currentUser.id);
      return [currentUser, ...others];
    }
    const members = getGroupMembers(gid);
    return members.length > 0 ? members : [currentUser];
  };
  const defaultParticipantsFor = (gid: string | null) => (gid ? peopleFor(gid).map((u) => u.id) : [currentUser.id]);
  const defaultPayerFor = (ids: string[]) => (ids.includes(currentUser.id) ? currentUser.id : ids[0] ?? currentUser.id);

  const initialGroupId = defaultGroupId && groups.some((g) => g.id === defaultGroupId) ? defaultGroupId : null;
  const initialParticipants = defaultParticipantsFor(initialGroupId);

  const [title, setTitle] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [groupId, setGroupId] = useState<string | null>(initialGroupId);
  const [participantIds, setParticipantIds] = useState<string[]>(initialParticipants);
  const [payerId, setPayerId] = useState(() => defaultPayerFor(initialParticipants));
  const [method, setMethod] = useState<NewSplitMethod>('equal');
  // Values are kept per method so switching back and forth doesn't mix amounts with percents.
  const [valuesByMethod, setValuesByMethod] = useState(emptyValues);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const people = peopleFor(groupId);
  const plainNameOf = (uid: string) => users.find((u) => u.id === uid)?.name || (uid === currentUser.id ? currentUser.name : 'Someone');

  const rawValues = valuesByMethod[method];
  const values: Record<string, string> =
    method === 'shares'
      ? Object.fromEntries(participantIds.map((uid) => [uid, rawValues[uid] ?? '1']))
      : Object.fromEntries(participantIds.filter((uid) => rawValues[uid] !== undefined).map((uid) => [uid, rawValues[uid]]));

  const draft: NewSplitDraft = {
    title,
    amountInput,
    payerId,
    groupId,
    participantIds,
    method,
    values,
    categoryId: categoryId || null,
  };

  const preview = previewNewSplit(draft);
  const hasPreview = Object.keys(preview).length > 0;
  const remaining = method === 'exact' || method === 'percentage' ? remainingForMethod(draft) : null;

  const applyParticipants = (next: string[]) => {
    setParticipantIds(next);
    setError(null);
    if (!next.includes(payerId)) setPayerId(defaultPayerFor(next));
  };

  const handleGroupChange = (gid: string | null) => {
    setGroupId(gid);
    applyParticipants(defaultParticipantsFor(gid));
  };

  const toggleParticipant = (uid: string) => {
    if (participantIds.includes(uid)) {
      if (participantIds.length === 1) return; // keep at least one person
      applyParticipants(participantIds.filter((id) => id !== uid));
    } else {
      // Keep the chip order stable (same order as the people list).
      const next = new Set([...participantIds, uid]);
      applyParticipants(people.map((p) => p.id).filter((id) => next.has(id)));
    }
  };

  const setValue = (uid: string, v: string) => {
    setError(null);
    setValuesByMethod((prev) => ({ ...prev, [method]: { ...prev[method], [uid]: v } }));
  };

  // Summary line, from the current user's point of view.
  let summary: { text: string; tone: 'good' | 'warn' | 'muted' } | null = null;
  if (hasPreview) {
    const myShare = preview[currentUser.id] ?? 0;
    if (payerId === currentUser.id) {
      const owed = Object.entries(preview).reduce((sum, [uid, v]) => (uid === currentUser.id ? sum : sum + v), 0);
      summary =
        owed > 0
          ? { text: `You'll be owed ${formatMinorUnits(owed, LEDGER_CURRENCY)}`, tone: 'good' }
          : { text: 'Only your own share, so nobody owes anything.', tone: 'muted' };
    } else if (myShare > 0) {
      summary = {
        text: `You owe ${plainNameOf(payerId)} ${formatMinorUnits(myShare, LEDGER_CURRENCY)}`,
        tone: 'warn',
      };
    } else {
      summary = { text: "You're not part of this split.", tone: 'muted' };
    }
  }

  const canSave = title.trim().length > 0 && amountInput.trim().length > 0 && !saving;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setError(null);

    const result = buildNewSplit(draft, plainNameOf);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaving(true);
    try {
      addTransaction(result.input);
      onClose();
    } catch (err: unknown) {
      setError(friendlyError(err));
      setSaving(false);
    }
  };

  const remainingTone =
    remaining === null
      ? ''
      : Math.abs(remaining.value) < 1e-9
        ? 'text-[#10B981]'
        : remaining.value > 0
          ? 'text-amber-300'
          : 'text-rose-400';
  const formatRemaining = (r: { kind: 'amount' | 'percent'; value: number }) => {
    const abs = Math.abs(r.value);
    const shown = r.kind === 'amount' ? formatMinorUnits(abs, LEDGER_CURRENCY) : `${Number(abs.toFixed(2))}%`;
    if (abs < 1e-9) return r.kind === 'amount' ? 'All of the amount is assigned' : 'Adds up to 100%';
    return r.value > 0 ? `${shown} left to assign` : `${shown} over`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div
        {...dialogProps}
        className="focus:outline-none w-full max-w-lg bg-[#18181b] border border-white/10 rounded-t-2xl sm:rounded-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl max-h-[92vh] sm:max-h-[90vh] overflow-y-auto space-y-4 font-body text-white"
      >
        {/* Handle for sheet feel */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/8">
          <h2 id={titleId} className="font-heading text-sm text-white">
            New split
          </h2>
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
          {/* Title */}
          <div>
            <label htmlFor="new-split-title" className="text-[11px] font-heading text-zinc-400">
              What was it for?
            </label>
            <input
              id="new-split-title"
              ref={titleRef}
              type="text"
              required
              autoComplete="off"
              placeholder="e.g. Dinner at Zuma, Taxi to the airport"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError(null);
              }}
              className={inputClass}
            />
          </div>

          {/* Amount & Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-split-amount" className="text-[11px] font-heading text-zinc-400">
                Amount
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2.5 text-xs font-semibold text-brand-400 pointer-events-none" aria-hidden="true">
                  {LEDGER_CURRENCY}
                </span>
                <input
                  id="new-split-amount"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.,]*"
                  autoComplete="off"
                  required
                  aria-label={`Amount in ${LEDGER_CURRENCY}`}
                  placeholder="0.00"
                  value={amountInput}
                  onChange={(e) => {
                    if (!isMoneyKeystroke(e.target.value)) return;
                    setAmountInput(e.target.value);
                    setError(null);
                  }}
                  className="w-full pl-14 pr-3 py-2.5 text-sm font-semibold bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-brand-500 text-white font-body"
                />
              </div>
            </div>

            <div>
              <label htmlFor="new-split-category" className="text-[11px] font-heading text-zinc-400">
                Category (optional)
              </label>
              <select
                id="new-split-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={selectClass}
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Split with & Paid by */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-split-group" className="text-[11px] font-heading text-zinc-400">
                Split with
              </label>
              <select
                id="new-split-group"
                value={groupId || ''}
                onChange={(e) => handleGroupChange(e.target.value ? e.target.value : null)}
                className={selectClass}
              >
                <option value="">No group / friends</option>
                {groupOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="new-split-payer" className="text-[11px] font-heading text-zinc-400">
                Paid by
              </label>
              <select
                id="new-split-payer"
                value={payerId}
                onChange={(e) => {
                  setPayerId(e.target.value);
                  setError(null);
                }}
                className={selectClass}
              >
                {participantIds.map((uid) => (
                  <option key={uid} value={uid}>
                    {plainNameOf(uid)} {uid === currentUser.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Participants */}
          <div className="space-y-3.5 pt-2 border-t border-white/8">
            <span id="new-split-people-label" className="text-[11px] font-heading text-zinc-400 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-brand-400" />
              PEOPLE IN THIS SPLIT ({participantIds.length})
            </span>

            <div role="group" aria-labelledby="new-split-people-label" className="flex flex-wrap gap-1.5">
              {people.map((u) => {
                const isSelected = participantIds.includes(u.id);
                const isLast = isSelected && participantIds.length === 1;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleParticipant(u.id)}
                    aria-pressed={isSelected}
                    aria-disabled={isLast || undefined}
                    title={isLast ? 'At least one person must be in the split' : undefined}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                      isSelected ? 'bg-brand-600 text-white shadow-xs font-semibold' : 'bg-[#27272a] text-zinc-400 hover:text-white'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="w-5 h-5 rounded-full bg-brand-400/30 text-white flex items-center justify-center text-[11px] font-semibold"
                    >
                      {initialsOf(u.name)}
                    </span>
                    <span>
                      {u.name}
                      {u.id === currentUser.id ? ' (You)' : ''}
                    </span>
                  </button>
                );
              })}
            </div>

            {groupId && (
              <p className="text-[11px] text-zinc-500">
                Only members of {groups.find((g) => g.id === groupId)?.name ?? 'this group'} can be part of this split.
              </p>
            )}

            {/* Split method */}
            <div>
              <span id="new-split-method-label" className="text-[11px] font-heading text-zinc-400">
                Split method
              </span>
              <div
                role="group"
                aria-labelledby="new-split-method-label"
                className="mt-1 grid grid-cols-4 gap-1 p-1 bg-[#27272a] rounded-xl text-xs font-heading"
              >
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setMethod(m.id);
                      setError(null);
                    }}
                    aria-pressed={method === m.id}
                    title={m.hint}
                    aria-label={m.id === 'percentage' ? 'Percentage' : m.label}
                    className={`py-1.5 rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                      method === m.id ? 'bg-brand-600 text-white shadow-xs' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Per-person rows */}
            <div className="p-3 bg-[#202025] rounded-xl text-xs space-y-1.5">
              {participantIds.map((uid) => {
                const name = plainNameOf(uid);
                const share = preview[uid];
                return (
                  <div key={uid} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 min-w-0 text-zinc-300 font-medium">
                      <span
                        aria-hidden="true"
                        className="w-5 h-5 shrink-0 rounded-full bg-brand-400/20 text-brand-200 flex items-center justify-center text-[11px] font-semibold"
                      >
                        {initialsOf(name)}
                      </span>
                      <span className="truncate">{uid === currentUser.id ? `${name} (You)` : name}</span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      {method !== 'equal' && (
                        <span className="relative w-24">
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            aria-label={
                              method === 'exact'
                                ? `Amount for ${name} in ${LEDGER_CURRENCY}`
                                : method === 'percentage'
                                  ? `Percent for ${name}`
                                  : `Shares for ${name}`
                            }
                            placeholder={method === 'exact' ? '0.00' : method === 'percentage' ? '0' : '1'}
                            value={values[uid] ?? ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (method === 'exact' ? !isMoneyKeystroke(v) : !isNumberKeystroke(v)) return;
                              setValue(uid, v);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs bg-[#09090b] border border-white/10 rounded-lg text-right pr-9 font-semibold text-white focus:outline-none focus:border-brand-500"
                          />
                          <span className="absolute right-2 top-1.5 text-[11px] text-zinc-500 font-semibold pointer-events-none" aria-hidden="true">
                            {method === 'exact' ? LEDGER_CURRENCY : method === 'percentage' ? '%' : 'x'}
                          </span>
                        </span>
                      )}
                      <span className="w-24 text-right font-semibold text-white tabular-nums" aria-live="polite">
                        {share !== undefined ? formatMinorUnits(share, LEDGER_CURRENCY) : '-'}
                      </span>
                    </span>
                  </div>
                );
              })}

              {remaining && (
                <div role="status" className={`pt-1.5 mt-1 border-t border-white/6 text-[11px] font-semibold ${remainingTone}`}>
                  {formatRemaining(remaining)}
                </div>
              )}
            </div>
          </div>

          {/* Summary */}
          {summary && (
            <div
              role="status"
              className={`p-3 rounded-xl text-sm font-semibold border ${
                summary.tone === 'good'
                  ? 'bg-brand-500/10 border-brand-500/30 text-brand-300'
                  : summary.tone === 'warn'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-[#202025] border-white/6 text-zinc-400'
              }`}
            >
              {summary.text}
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
              disabled={!canSave}
              className="flex-1 py-3 rounded-xl bg-brand-400 hover:bg-brand-300 text-zinc-950 text-sm font-semibold transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-brand-400 disabled:active:scale-100"
            >
              Create split
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
