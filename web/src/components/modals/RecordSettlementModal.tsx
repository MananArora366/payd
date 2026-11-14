'use client';

import React, { useState, useEffect } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits, parseMajorToMinor } from '@/lib/ledger';
import { X, Check, ShieldCheck, ArrowRight, AlertTriangle } from 'lucide-react';
import { useDialog } from '@/lib/hooks/useDialog';

interface RecordSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSenderId?: string;
  defaultRecipientId?: string;
  defaultAmountMinor?: number;
  defaultGroupId?: string | null;
}

const CURRENCY = 'AED'; // AED-only ledger

export function RecordSettlementModal({
  isOpen,
  onClose,
  defaultSenderId,
  defaultRecipientId,
  defaultAmountMinor,
  defaultGroupId = null,
}: RecordSettlementModalProps) {
  const { currentUser, users, groups, groupMembers, recordSettlement, validateSettlement, getPairwiseDebt } = usePayd();

  const [senderId, setSenderId] = useState(defaultSenderId || currentUser.id);
  const [recipientId, setRecipientId] = useState(defaultRecipientId || '');
  const [amountStr, setAmountStr] = useState('');
  const [groupId, setGroupId] = useState<string | null>(defaultGroupId);
  const [method, setMethod] = useState('Careem Pay');
  const [reference, setReference] = useState('');
  const [allowOverpayment, setAllowOverpayment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset everything each time the modal opens, using the latest defaults.
  useEffect(() => {
    if (!isOpen) return;
    const sender = defaultSenderId || currentUser.id;
    const recipient =
      defaultRecipientId && defaultRecipientId !== sender
        ? defaultRecipientId
        : users.find((u) => u.id !== sender)?.id || '';
    setSenderId(sender);
    setRecipientId(recipient);
    setAmountStr(defaultAmountMinor ? (defaultAmountMinor / 100).toFixed(2) : '');
    setGroupId(defaultGroupId || null);
    setMethod('Careem Pay');
    setReference('');
    setAllowOverpayment(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultSenderId, defaultRecipientId, defaultAmountMinor, defaultGroupId]);

  const { dialogProps, titleId } = useDialog(isOpen, onClose);

  if (!isOpen) return null;

  // People offered: the group's members when a group is chosen, everyone otherwise.
  const memberIds = groupId
    ? new Set(groupMembers.filter((m) => m.group_id === groupId).map((m) => m.user_id))
    : null;
  const pickable = memberIds ? users.filter((u) => memberIds.has(u.id)) : users;
  const recipientOptions = pickable.filter((u) => u.id !== senderId);

  const changeSender = (id: string) => {
    setSenderId(id);
    if (recipientId === id || !recipientId) {
      setRecipientId(pickable.find((u) => u.id !== id)?.id || '');
    }
    setError(null);
  };

  const changeGroup = (gid: string | null) => {
    setGroupId(gid);
    setError(null);
    if (!gid) return;
    const ids = new Set(groupMembers.filter((m) => m.group_id === gid).map((m) => m.user_id));
    const sender = ids.has(senderId) ? senderId : ids.has(currentUser.id) ? currentUser.id : users.find((u) => ids.has(u.id))?.id || senderId;
    setSenderId(sender);
    if (!ids.has(recipientId) || recipientId === sender) {
      setRecipientId(users.find((u) => ids.has(u.id) && u.id !== sender)?.id || '');
    }
  };

  // Same unified debt the Groups / Settlements tabs show and the ledger validates against.
  const currentDebtMinor = recipientId ? getPairwiseDebt(senderId, recipientId, groupId) : 0;
  const reverseDebtMinor = recipientId ? getPairwiseDebt(recipientId, senderId, groupId) : 0;

  const totalMinor = parseMajorToMinor(amountStr, CURRENCY);
  const isOverpaying = totalMinor > 0 && totalMinor > currentDebtMinor;

  // Groups you belong to (plus the currently selected one).
  const sharedGroups = groups.filter((g) => {
    if (g.id === groupId) return true;
    const ids = groupMembers.filter((m) => m.group_id === g.id).map((m) => m.user_id);
    return ids.includes(currentUser.id);
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const input = {
      group_id: groupId || null,
      sender_id: senderId,
      recipient_id: recipientId,
      amount_minor: totalMinor,
      allowOverpayment: isOverpaying && allowOverpayment,
    };
    const check = validateSettlement(input);
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    try {
      recordSettlement({
        ...input,
        currency: CURRENCY,
        method,
        reference: reference.trim() || (isOverpaying ? 'Advance payment' : 'Settlement'),
      });
      onClose();
    } catch (err: unknown) {
      // recordSettlement throws plain-language reasons; never show internal codes.
      const msg = err instanceof Error ? err.message.replace(/^Ledger Invariant Violation:?\s*/i, '') : '';
      setError(msg || "Couldn't record this settlement. Please check the details and try again.");
    }
  };

  const senderUser = users.find((u) => u.id === senderId);
  const recipientUser = users.find((u) => u.id === recipientId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div {...dialogProps} className="focus:outline-none w-full max-w-lg bg-[#18181b] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4 text-white font-body">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/8">
          <div className="flex items-center gap-2">
            <h2 id={titleId} className="font-heading text-sm text-white">Record settlement</h2>
            <span className="text-[10px] font-heading px-2 py-0.5 rounded-full bg-silver-500/20 text-silver-300 border border-silver-500/30">
              Not an expense
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-full text-slate-400 hover:text-slate-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div role="alert" className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-xl">
            {error}
          </div>
        )}

        {/* Sender -> Recipient Flow Header */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-850 rounded-2xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {senderUser?.avatar_url ? (
              <img src={senderUser.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <span aria-hidden="true" className="w-7 h-7 rounded-full bg-silver-600/40 flex items-center justify-center text-[10px] font-bold">
                {(senderUser?.name || '?').slice(0, 1)}
              </span>
            )}
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Payer</span>
              <span className="font-semibold">{senderUser?.name}</span>
            </div>
          </div>

          <div className="flex flex-col items-center px-2">
            <span className="text-[10px] text-emerald-500 font-semibold mb-0.5">Repaying</span>
            <ArrowRight className="w-4 h-4 text-emerald-500" />
          </div>

          <div className="flex items-center gap-2 text-right">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Recipient</span>
              <span className="font-semibold">{recipientUser?.name}</span>
            </div>
            {recipientUser?.avatar_url ? (
              <img src={recipientUser.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <span aria-hidden="true" className="w-7 h-7 rounded-full bg-silver-600/40 flex items-center justify-center text-[10px] font-bold">
                {(recipientUser?.name || '?').slice(0, 1)}
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Sender & Recipient Selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="settle-sender" className="text-xs font-medium text-zinc-400">Sender</label>
              <select
                id="settle-sender"
                value={senderId}
                onChange={(e) => changeSender(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {pickable.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.id === currentUser.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="settle-recipient" className="text-xs font-medium text-zinc-400">Recipient</label>
              <select
                id="settle-recipient"
                value={recipientId}
                onChange={(e) => {
                  setRecipientId(e.target.value);
                  setError(null);
                }}
                className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {recipientOptions.length === 0 && <option value="">No one else in this group</option>}
                {recipientOptions
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.id === currentUser.id ? '(You)' : ''}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Group the payment belongs to */}
          <div>
            <label htmlFor="settle-group" className="text-xs font-medium text-zinc-400">Group</label>
            <select
              id="settle-group"
              value={groupId || ''}
              onChange={(e) => changeGroup(e.target.value || null)}
              className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">No group (overall balance)</option>
              {sharedGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Current Outstanding Debt Info */}
          <div className="text-xs flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
            <span className="text-slate-500">
              {senderUser?.name || 'Sender'} owes {recipientUser?.name || 'recipient'}
              {groupId ? ' in this group' : ' overall'}:
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {formatMinorUnits(currentDebtMinor, CURRENCY)}
            </span>
          </div>
          {currentDebtMinor === 0 && reverseDebtMinor > 0 && (
            <p className="text-[11px] text-slate-400 px-1">
              It&apos;s the other way round: {recipientUser?.name} owes {senderUser?.name}{' '}
              {formatMinorUnits(reverseDebtMinor, CURRENCY)}.
            </p>
          )}

          {/* Amount & Method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="settle-amount" className="text-xs font-medium text-zinc-400">Amount</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">
                  {CURRENCY}
                </span>
                <input
                  id="settle-amount"
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="0.00"
                  value={amountStr}
                  onChange={(e) => {
                    setAmountStr(e.target.value);
                    setError(null);
                  }}
                  className="w-full pl-14 pr-3 py-2 text-sm font-semibold bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="settle-method" className="text-xs font-medium text-zinc-400">Payment Method</label>
              <select
                id="settle-method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              >
                <option value="Careem Pay">Careem Pay (Instant)</option>
                <option value="Apple Pay">Apple Pay</option>
                <option value="Bank Transfer">Bank Transfer / Wio</option>
                <option value="Credit Card">Card</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
          </div>

          {/* Overpayment warning */}
          {isOverpaying && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
              <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {currentDebtMinor === 0
                    ? `${senderUser?.name || 'The sender'} doesn't owe ${recipientUser?.name || 'the recipient'} anything${groupId ? ' in this group' : ''} right now.`
                    : `Heads up: this amount (${formatMinorUnits(totalMinor, CURRENCY)}) is more than what's owed (${formatMinorUnits(currentDebtMinor, CURRENCY)}).`}
                </span>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowOverpayment}
                  onChange={(e) => setAllowOverpayment(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>
                  Record {currentDebtMinor === 0 ? 'it' : 'the extra'} as an advance payment (
                  {recipientUser?.name || 'the recipient'} will owe it back)
                </span>
              </label>
            </div>
          )}

          {/* Reference Notes */}
          <div>
            <label htmlFor="settle-reference" className="text-xs font-medium text-zinc-400">Notes / Reference</label>
            <input
              id="settle-reference"
              type="text"
              placeholder="e.g. Settle dinner & grocery debts"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full mt-1 px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-teal-600 dark:text-teal-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Repayment updates derived balances directly without polluting expense budgets.</span>
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
              disabled={(isOverpaying && !allowOverpayment) || !recipientId}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition disabled:opacity-40"
            >
              Record Settlement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
