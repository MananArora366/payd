'use client';

import React, { useState, useEffect } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits, parseMajorToMinor, calculateBilateralDebts } from '@/lib/ledger';
import { X, Check, ShieldCheck, ArrowRight, AlertTriangle } from 'lucide-react';

interface RecordSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSenderId?: string;
  defaultRecipientId?: string;
  defaultAmountMinor?: number;
  defaultGroupId?: string | null;
}

export function RecordSettlementModal({
  isOpen,
  onClose,
  defaultSenderId,
  defaultRecipientId,
  defaultAmountMinor,
  defaultGroupId = null,
}: RecordSettlementModalProps) {
  const { currentUser, users, groups, transactions, splits, settlements, recordSettlement } = usePayd();

  const [senderId, setSenderId] = useState(defaultSenderId || currentUser.id);
  const [recipientId, setRecipientId] = useState(
    defaultRecipientId || users.find((u) => u.id !== currentUser.id)?.id || ''
  );
  const [amountStr, setAmountStr] = useState(
    defaultAmountMinor ? (defaultAmountMinor / 100).toFixed(2) : ''
  );
  const [groupId, setGroupId] = useState<string | null>(defaultGroupId);
  const [method, setMethod] = useState('Cash');
  const [reference, setReference] = useState('');
  const [allowOverpayment, setAllowOverpayment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultSenderId) setSenderId(defaultSenderId);
    if (defaultRecipientId) setRecipientId(defaultRecipientId);
    if (defaultAmountMinor) setAmountStr((defaultAmountMinor / 100).toFixed(2));
    if (defaultGroupId) setGroupId(defaultGroupId);
  }, [defaultSenderId, defaultRecipientId, defaultAmountMinor, defaultGroupId]);

  if (!isOpen) return null;

  // Calculate current outstanding liability between sender and recipient
  const bilateral = calculateBilateralDebts(transactions, splits, settlements);
  const senderDebts = bilateral.get(senderId);
  const currentDebtMinor = senderDebts?.get(recipientId) || 0;

  const totalMinor = parseMajorToMinor(amountStr, currentUser.default_currency);
  const isOverpaying = currentDebtMinor > 0 && totalMinor > currentDebtMinor;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (senderId === recipientId) {
        throw new Error('Sender and recipient must be different individuals.');
      }
      if (totalMinor <= 0) {
        throw new Error('Please enter a valid amount.');
      }

      recordSettlement({
        group_id: groupId || null,
        sender_id: senderId,
        recipient_id: recipientId,
        amount_minor: totalMinor,
        currency: currentUser.default_currency,
        method,
        reference: reference.trim() || 'Settlement',
        allowOverpayment,
      });

      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record settlement');
    }
  };

  const senderUser = users.find((u) => u.id === senderId);
  const recipientUser = users.find((u) => u.id === recipientId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-slate-900 dark:text-white">Record Settlement</span>
            <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400">
              Not an expense
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

        {/* Sender -> Recipient Flow Header */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-850 rounded-2xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <img src={senderUser?.avatar_url || ''} alt="" className="w-7 h-7 rounded-full object-cover" />
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
            <img src={recipientUser?.avatar_url || ''} alt="" className="w-7 h-7 rounded-full object-cover" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Sender & Recipient Selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sender</label>
              <select
                value={senderId}
                onChange={(e) => setSenderId(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.id === currentUser.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recipient</label>
              <select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {users
                  .filter((u) => u.id !== senderId)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.id === currentUser.id ? '(You)' : ''}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Current Outstanding Debt Info */}
          <div className="text-xs flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
            <span className="text-slate-500">Current Outstanding Debt:</span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {formatMinorUnits(currentDebtMinor, currentUser.default_currency)}
            </span>
          </div>

          {/* Amount & Method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">
                  {currentUser.default_currency}
                </span>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="w-full pl-14 pr-3 py-2 text-sm font-semibold bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Apple Pay">Apple Pay</option>
                <option value="Credit Card">Card</option>
                <option value="Wio">Wio / UPI</option>
              </select>
            </div>
          </div>

          {/* Invariant 4 Warning & Checkbox */}
          {isOverpaying && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
              <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Invariant 4 Warning: Amount ({formatMinorUnits(totalMinor, currentUser.default_currency)}) exceeds
                  outstanding liability ({formatMinorUnits(currentDebtMinor, currentUser.default_currency)}).
                </span>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowOverpayment}
                  onChange={(e) => setAllowOverpayment(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Explicitly flag as allowed advance/overpayment</span>
              </label>
            </div>
          )}

          {/* Reference Notes */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notes / Reference</label>
            <input
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
              disabled={isOverpaying && !allowOverpayment}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-semibold shadow-lg shadow-emerald-600/25 transition disabled:opacity-40"
            >
              Record Settlement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
