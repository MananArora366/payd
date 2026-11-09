'use client';

import React, { useState } from 'react';
import { VoiceIntent } from '@/lib/ai/gemini';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits, parseMajorToMinor, splitEqual, getCurrencySymbol } from '@/lib/ledger';
import { Check, X, Edit3, ShieldCheck, ArrowRight, UserCheck, Tag, Users } from 'lucide-react';
import { getCategoryIcon } from '@/lib/icons';

interface ConfirmationCardProps {
  intent: VoiceIntent;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationCard({ intent, onConfirm, onCancel }: ConfirmationCardProps) {
  const { users, currentUser, categories, groups, addTransaction, recordSettlement } = usePayd();

  const [title, setTitle] = useState(intent.notes || intent.category || 'Expense');
  const [amountMajor, setAmountMajor] = useState(intent.amount ? intent.amount.toString() : '0');
  const [selectedCategory, setSelectedCategory] = useState(intent.category || 'Food and dining');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Resolve payer
  const payerUser =
    users.find((u) => u.name.toLowerCase() === (intent.payer || '').toLowerCase()) || currentUser;

  // Resolve participants
  const participantUsers = users.filter((u) =>
    intent.participants.some((p) => u.name.toLowerCase().includes(p.toLowerCase()))
  );
  // Ensure at least currentUser and payer are included if empty
  const activeParticipants =
    participantUsers.length > 0 ? participantUsers : [currentUser];

  // Resolve group if matched
  const matchedGroup = groups.find(
    (g) => g.name.toLowerCase() === (intent.group_name || '').toLowerCase()
  );

  const totalMinor = parseMajorToMinor(amountMajor, currentUser.default_currency);

  // Compute deterministic splits using /lib/ledger
  let computedSplits: Record<string, number> = {};
  try {
    if (intent.intent === 'split_expense' || activeParticipants.length > 1) {
      computedSplits = splitEqual(
        totalMinor,
        activeParticipants.map((u) => u.id)
      );
    } else {
      computedSplits = { [payerUser.id]: totalMinor };
    }
  } catch (err: any) {
    computedSplits = { [payerUser.id]: totalMinor };
  }

  const handleSave = () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (totalMinor <= 0) {
        throw new Error('Please enter a valid amount greater than zero.');
      }

      if (intent.intent === 'record_repayment') {
        // Repayment settlement
        const recipientUser = activeParticipants.find((u) => u.id !== payerUser.id) || currentUser;
        recordSettlement({
          group_id: matchedGroup?.id || null,
          sender_id: payerUser.id,
          recipient_id: recipientUser.id,
          amount_minor: totalMinor,
          currency: currentUser.default_currency,
          method: 'Voice Settlement',
          reference: title,
          allowOverpayment: true,
        });
      } else {
        // Expense or Income
        const catObj = categories.find((c) => c.name.toLowerCase() === selectedCategory.toLowerCase());
        const splitList = Object.entries(computedSplits).map(([userId, shareMinor]) => ({
          user_id: userId,
          share_minor: shareMinor,
        }));

        addTransaction({
          type: intent.intent === 'add_income' ? 'income' : 'expense',
          title: title || 'Expense',
          amount_minor: totalMinor,
          currency: currentUser.default_currency,
          category_id: catObj?.id || null,
          payer_id: payerUser.id,
          group_id: matchedGroup?.id || null,
          payment_method: 'Card',
          notes: intent.notes,
          splits: splitList,
        });
      }

      onConfirm();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save transaction');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
      {/* Header with Intent Badge */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
            {intent.intent.replace('_', ' ')}
          </span>
          {matchedGroup && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400">
              {matchedGroup.name}
            </span>
          )}
        </div>
        <button
          onClick={onCancel}
          className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {errorMessage && (
        <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-xl">
          {errorMessage}
        </div>
      )}

      {/* Editable Fields */}
      <div className="space-y-3">
        {/* Title */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Description</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full mt-1 px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Amount & Payer row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Amount</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-2.5 text-xs font-semibold text-slate-400">
                {currentUser.default_currency}
              </span>
              <input
                type="number"
                step="0.01"
                value={amountMajor}
                onChange={(e) => setAmountMajor(e.target.value)}
                className="w-full pl-12 pr-3 py-2 text-sm font-semibold bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Paid By</label>
            <div className="mt-1 flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl text-sm font-medium">
              <img
                src={payerUser.avatar_url || ''}
                alt={payerUser.name}
                className="w-5 h-5 rounded-full object-cover"
              />
              <span className="truncate">{payerUser.name}</span>
            </div>
          </div>
        </div>

        {/* Category Picker */}
        {intent.intent !== 'record_repayment' && (
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-slate-200"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Deterministic Split Shares Preview */}
        {intent.intent !== 'record_repayment' && activeParticipants.length > 1 && (
          <div className="p-3 bg-slate-50 dark:bg-slate-850/60 rounded-2xl border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-500" />
                Deterministic Equal Split ({activeParticipants.length} people)
              </span>
              <span>{formatMinorUnits(totalMinor, currentUser.default_currency)}</span>
            </div>

            <div className="space-y-1.5">
              {activeParticipants.map((user) => {
                const share = computedSplits[user.id] || 0;
                return (
                  <div key={user.id} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <img
                        src={user.avatar_url || ''}
                        alt={user.name}
                        className="w-4 h-4 rounded-full object-cover"
                      />
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {user.id === currentUser.id ? `${user.name} (You)` : user.name}
                      </span>
                    </div>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {formatMinorUnits(share, currentUser.default_currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Invariant Guarantee Footer */}
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        <span>Deterministic ledger: zero floating-point math & integer minor verification</span>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-750 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium transition"
        >
          Discard
        </button>
        <button
          onClick={handleSave}
          disabled={isSubmitting}
          className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-semibold shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
        >
          <Check className="w-4 h-4" />
          <span>Confirm & Persist</span>
        </button>
      </div>
    </div>
  );
}
