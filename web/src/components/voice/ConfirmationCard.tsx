'use client';

import React, { useState } from 'react';
import { VoiceIntent, buildShortDescription } from '@/lib/ai/gemini';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits, parseMajorToMinor, splitEqual } from '@/lib/ledger';
import { Check, X, Edit3, ShieldCheck, ArrowRight, UserCheck, Tag, Users } from 'lucide-react';
import { getCategoryIcon } from '@/lib/icons';

interface ConfirmationCardProps {
  intent: VoiceIntent;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationCard({ intent, onConfirm, onCancel }: ConfirmationCardProps) {
  const { users, currentUser, categories, groups, addTransaction, recordSettlement, getGroupMembers } = usePayd();

  // Payd is an AED-only ledger: everything is recorded in AED.
  const LEDGER_CURRENCY = 'AED';
  const spokenCurrency = (intent.currency || LEDGER_CURRENCY).toUpperCase();
  const currencyMismatch = spokenCurrency !== LEDGER_CURRENCY;

  const isRepayment = intent.intent === 'record_repayment';

  const defaultCategory =
    categories.find((c) => c.name.toLowerCase() === (intent.category || '').toLowerCase())?.name ||
    categories.find((c) => c.name === 'Other')?.name ||
    categories[0]?.name ||
    '';

  const [title, setTitle] = useState(() => buildShortDescription(intent));
  const [amountMajor, setAmountMajor] = useState(intent.amount ? intent.amount.toString() : '0');
  const [selectedCategory, setSelectedCategory] = useState(defaultCategory);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Resolve payer
  const payerUser =
    users.find((u) => u.name.toLowerCase() === (intent.payer || '').toLowerCase()) || currentUser;

  // Resolve participants (exact full name or exact first name; no substring matches)
  const participantUsers = users.filter((u) =>
    intent.participants.some((p) => {
      const want = p.trim().toLowerCase();
      if (!want) return false;
      return u.name.toLowerCase() === want || u.name.toLowerCase().split(' ')[0] === want.split(' ')[0];
    })
  );
  // Ensure at least currentUser and payer are included if empty
  const activeParticipants =
    participantUsers.length > 0 ? participantUsers : [currentUser];

  // Resolve group if matched
  const matchedGroup = groups.find(
    (g) => g.name.toLowerCase() === (intent.group_name || '').toLowerCase()
  );

  const groupMemberIds = matchedGroup ? new Set(getGroupMembers(matchedGroup.id).map((u) => u.id)) : null;
  const nonMembers = groupMemberIds
    ? [payerUser, ...activeParticipants].filter((u) => !groupMemberIds.has(u.id))
    : [];

  // Repayment: payer (who paid back) -> recipient
  const repaymentRecipient = activeParticipants.find((u) => u.id !== payerUser.id) || currentUser;

  const totalMinor = parseMajorToMinor(amountMajor, LEDGER_CURRENCY);

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
      if (nonMembers.length > 0 && matchedGroup) {
        throw new Error(
          `${nonMembers.map((u) => u.name).join(', ')} ${nonMembers.length === 1 ? 'is' : 'are'} not in ${matchedGroup.name}.`
        );
      }

      if (isRepayment) {
        // Repayment settlement
        if (repaymentRecipient.id === payerUser.id) {
          throw new Error('Please say who paid whom, e.g. "Prakarsh paid me back 80 AED".');
        }
        recordSettlement({
          group_id: matchedGroup?.id || null,
          sender_id: payerUser.id,
          recipient_id: repaymentRecipient.id,
          amount_minor: totalMinor,
          currency: LEDGER_CURRENCY,
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
          title: title.trim() || 'Expense',
          amount_minor: totalMinor,
          currency: LEDGER_CURRENCY,
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
      const raw = String(err?.message || '');
      const friendly = /invariant|violation/i.test(raw)
        ? isRepayment
          ? "This repayment doesn't match what's owed between these people. Check the amount and who paid whom."
          : "We couldn't save this because the amounts don't add up. Please check the details."
        : raw || 'Failed to save. Please try again.';
      setErrorMessage(friendly);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
      {/* Header with Intent Badge */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
            {intent.intent.replace(/_/g, ' ')}
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
                {LEDGER_CURRENCY}
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
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{isRepayment ? 'From' : 'Paid By'}</label>
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

        {currencyMismatch && (
          <div className="p-2.5 text-[11px] bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-xl">
            You mentioned {spokenCurrency}. Payd records everything in AED (multi-currency coming soon), so please enter the amount in AED.
          </div>
        )}

        {isRepayment && (
          <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-850/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-sm">
            <UserCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="font-medium truncate">{payerUser.id === currentUser.id ? 'You' : payerUser.name}</span>
            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" aria-label="pays" />
            <span className="font-medium truncate">{repaymentRecipient.id === currentUser.id ? 'You' : repaymentRecipient.name}</span>
            <span className="ml-auto font-semibold">{formatMinorUnits(totalMinor, LEDGER_CURRENCY)}</span>
          </div>
        )}

        {nonMembers.length > 0 && matchedGroup && (
          <div className="p-2.5 text-[11px] bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-xl">
            {nonMembers.map((u) => u.name).join(', ')} {nonMembers.length === 1 ? 'is' : 'are'} not a member of {matchedGroup.name}.
          </div>
        )}

        {/* Category Picker */}
        {!isRepayment && (
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

        {/* Split preview */}
        {!isRepayment && activeParticipants.length > 1 && (
          <div className="p-3 bg-slate-50 dark:bg-slate-850/60 rounded-2xl border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-500" />
                Equal split ({activeParticipants.length} people)
              </span>
              <span>{formatMinorUnits(totalMinor, LEDGER_CURRENCY)}</span>
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
                      {formatMinorUnits(share, LEDGER_CURRENCY)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Accuracy note */}
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        <span>Shares always add up to the exact total</span>
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
          className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50"
        >
          <Check className="w-4 h-4" />
          <span>Confirm & Persist</span>
        </button>
      </div>
    </div>
  );
}
