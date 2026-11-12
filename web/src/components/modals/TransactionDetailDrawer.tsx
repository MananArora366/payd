'use client';

import React from 'react';
import { Transaction } from '@/types/database';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits } from '@/lib/ledger';
import { getCategoryIcon, getPaymentMethodIcon } from '@/lib/icons';
import { X, Trash2, RotateCcw, Calendar, User, Users, ShieldAlert, Tag, Wallet, Share2, Copy, Check } from 'lucide-react';

interface TransactionDetailDrawerProps {
  transaction: Transaction | null;
  onClose: () => void;
}

export function TransactionDetailDrawer({ transaction, onClose }: TransactionDetailDrawerProps) {
  const {
    currentUser,
    users,
    groups,
    categories,
    splits,
    softDeleteTransaction,
    restoreTransaction,
  } = usePayd();

  const [copied, setCopied] = React.useState(false);

  if (!transaction) return null;

  const category = categories.find((c) => c.id === transaction.category_id);
  const payer = users.find((u) => u.id === transaction.payer_id);
  const group = groups.find((g) => g.id === transaction.group_id);
  const txnSplits = splits.filter((s) => s.transaction_id === transaction.id);
  const isDeleted = !!transaction.deleted_at;

  const getBreakdownSummary = () => {
    const payerName = payer?.id === currentUser.id ? 'You' : payer?.name || 'Someone';
    const totalStr = formatMinorUnits(transaction.amount_minor, transaction.currency);
    let text = `🧾 *${transaction.title}* (${totalStr})\n`;
    text += `Paid by: ${payerName}\n`;
    if (group) text += `Group: ${group.name}\n`;
    if (txnSplits.length > 0) {
      text += `\n*Split Breakdown:*\n`;
      txnSplits.forEach((sp) => {
        const u = users.find((user) => user.id === sp.user_id);
        const shareStr = formatMinorUnits(sp.share_minor, transaction.currency);
        text += `• ${u?.name || 'User'}: ${shareStr}\n`;
      });
    }
    text += `\nTracked on Payd • Settle easily via Careem Pay / Aani! 💚`;
    return text;
  };

  const handleCopyBreakdown = () => {
    navigator.clipboard.writeText(getBreakdownSummary());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(getBreakdownSummary());
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleDelete = () => {
    softDeleteTransaction(transaction.id);
    onClose();
  };

  const handleRestore = () => {
    restoreTransaction(transaction.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                transaction.type === 'income'
                  ? 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400'
                  : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {transaction.type}
            </span>
            {isDeleted && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                Soft Deleted (Reversed)
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-slate-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Title & Amount Banner */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">{transaction.title}</h3>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(transaction.occurred_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>

          <div className="text-right">
            <div
              className={`text-2xl font-black ${
                transaction.type === 'income'
                  ? 'text-teal-600 dark:text-teal-400'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {transaction.type === 'income' ? '+' : ''}
              {formatMinorUnits(transaction.amount_minor, transaction.currency)}
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              {transaction.amount_minor} minor units
            </div>
          </div>
        </div>

        {/* Meta badges */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-xl flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              {getCategoryIcon(category?.icon, 'w-4 h-4')}
            </div>
            <div>
              <span className="text-[10px] uppercase text-slate-400 block font-semibold">Category</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{category?.name || 'Uncategorized'}</span>
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-xl flex items-center gap-2.5">
            <img src={payer?.avatar_url || ''} alt="" className="w-7 h-7 rounded-full object-cover" />
            <div>
              <span className="text-[10px] uppercase text-slate-400 block font-semibold">Paid By</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {payer?.name} {payer?.id === currentUser.id ? '(You)' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Group / Notes */}
        {(group || transaction.notes) && (
          <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-xl space-y-1 text-xs">
            {group && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Group:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{group.name}</span>
              </div>
            )}
            {transaction.notes && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Notes:</span>
                <span className="font-medium text-slate-700 dark:text-slate-300 italic">{transaction.notes}</span>
              </div>
            )}
          </div>
        )}

        {/* Split Breakdown */}
        {txnSplits.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Split Allocation
              </span>
              <span>{txnSplits.length} members</span>
            </div>

            <div className="space-y-1.5">
              {txnSplits.map((sp) => {
                const u = users.find((user) => user.id === sp.user_id);
                return (
                  <div
                    key={sp.id}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100 dark:border-slate-800 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <img src={u?.avatar_url || ''} alt="" className="w-5 h-5 rounded-full object-cover" />
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {u?.name} {u?.id === currentUser.id ? '(You)' : ''}
                      </span>
                    </div>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {formatMinorUnits(sp.share_minor, transaction.currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Share & Copy Row */}
        {txnSplits.length > 0 && !isDeleted && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="py-2.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share to WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={handleCopyBreakdown}
              className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy Breakdown'}</span>
            </button>
          </div>
        )}

        {/* Audit & Reversal Notice */}
        <div className="flex items-start gap-2 p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/80 text-[11px] text-slate-500">
          <ShieldAlert className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <span>
            Invariant 5: Deleting an expense creates reversing audit entries and recalculates all ledger balances dynamically.
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          {isDeleted ? (
            <button
              onClick={handleRestore}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-md transition"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Restore Transaction</span>
            </button>
          ) : (
            <button
              onClick={handleDelete}
              className="flex-1 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-sm font-semibold flex items-center justify-center gap-2 transition"
            >
              <Trash2 className="w-4 h-4" />
              <span>Soft-Delete & Reverse</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-750 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
