'use client';

import React, { useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits } from '@/lib/ledger';
import { RecurringBill } from '@/types/database';
import {
  Repeat,
  Plus,
  Play,
  Check,
  Trash2,
  Calendar,
  Sparkles,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { CreateRecurringBillModal } from '@/components/modals/CreateRecurringBillModal';
import { describePeriod, formatDueDay, isPostedInCurrentPeriod } from './recurringPeriod';

interface RecurringBillsSectionProps {
  groupId?: string | null;
}

export function RecurringBillsSection({ groupId = null }: RecurringBillsSectionProps) {
  const {
    currentUser,
    users,
    groups,
    recurringBills,
    triggerRecurringBillSplit,
    deleteRecurringBill,
  } = usePayd();

  const [modalOpen, setModalOpen] = useState(false);
  const [justPostedId, setJustPostedId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  // Bill id awaiting "post again this period?" confirmation
  const [confirmRepostId, setConfirmRepostId] = useState<string | null>(null);
  // Bill id awaiting delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Filter bills if groupId is provided, or show all
  const displayedBills = groupId
    ? recurringBills.filter((b) => b.group_id === groupId)
    : recurringBills;

  const flash = (msg: { kind: 'success' | 'error'; text: string }) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage((cur) => (cur === msg ? null : cur)), 3500);
  };

  const postBill = (bill: RecurringBill) => {
    setConfirmRepostId(null);
    try {
      triggerRecurringBillSplit(bill.id);
      setJustPostedId(bill.id);
      flash({ kind: 'success', text: `Split for "${bill.title}" logged into ledger!` });
      setTimeout(() => setJustPostedId((cur) => (cur === bill.id ? null : cur)), 3000);
    } catch {
      flash({ kind: 'error', text: `We couldn't post "${bill.title}". Check its participants and amount, then try again.` });
    }
  };

  const handlePostNow = (bill: RecurringBill) => {
    // Guard: don't post the same bill twice in one billing period without confirmation
    if (isPostedInCurrentPeriod(bill)) {
      setConfirmRepostId(bill.id);
      return;
    }
    postBill(bill);
  };

  const handleConfirmDelete = (bill: RecurringBill) => {
    setConfirmDeleteId(null);
    deleteRecurringBill(bill.id);
    flash({ kind: 'success', text: `Deleted "${bill.title}". Past posted splits stay in the ledger.` });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-silver-500/20 text-silver-400">
            <Repeat className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-heading text-xs text-white flex items-center gap-1.5">
              Shared subscriptions & recurring bills
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-silver-500/20 text-silver-300 font-heading border border-silver-500/30">
                {displayedBills.length} ACTIVE
              </span>
            </h3>
            <p className="text-[11px] text-zinc-400 font-body">
              Automated monthly splits for Wi-Fi, rent, DEWA, and memberships
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="px-3.5 py-1.5 rounded-xl bg-silver-600 hover:bg-silver-500 text-white font-semibold text-sm flex items-center gap-1 transition active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          <span>+ Subscription</span>
        </button>
      </div>

      {statusMessage && (
        <div
          role={statusMessage.kind === 'error' ? 'alert' : 'status'}
          className={`p-3 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-150 ${
            statusMessage.kind === 'error'
              ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
              : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
          }`}
        >
          {statusMessage.kind === 'error' ? <AlertCircle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Grid of Recurring Bills */}
      {displayedBills.length === 0 ? (
        <div className="p-6 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-xs space-y-1">
          <p>No recurring subscriptions configured yet.</p>
          <p className="text-[11px] text-slate-500">
            Set up shared utilities, Wi-Fi, or streaming services to split with 1 click.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {displayedBills.map((bill) => {
            const payer = users.find((u) => u.id === bill.payer_id);
            const group = groups.find((g) => g.id === bill.group_id);
            const isPostedRecently = justPostedId === bill.id;
            const postedThisPeriod = isPostedInCurrentPeriod(bill);
            const periodLabel = describePeriod(new Date(), bill.frequency);

            return (
              <div
                key={bill.id}
                className="p-4 bg-[#18181b] border border-white/8 hover:border-silver-500/40 rounded-2xl shadow-sm space-y-3 flex flex-col justify-between transition text-white font-body"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-silver-600 dark:text-silver-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDueDay(bill.due_day, bill.frequency)} • {bill.frequency}
                      </span>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 mt-0.5">
                        {bill.title}
                      </h4>
                    </div>

                    {confirmDeleteId === bill.id ? (
                      <div className="flex items-center gap-1 text-[10px]">
                        <span className="text-zinc-400">Delete?</span>
                        <button
                          type="button"
                          onClick={() => handleConfirmDelete(bill)}
                          className="px-2 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-0.5 rounded-lg bg-[#27272a] hover:bg-[#3f3f46] text-zinc-300 font-bold"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(bill.id)}
                        className="p-1 text-zinc-500 hover:text-rose-400 transition"
                        title="Delete subscription"
                        aria-label={`Delete ${bill.title}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="text-lg font-semibold text-slate-900 dark:text-white mt-2">
                    {formatMinorUnits(bill.amount_minor, bill.currency)}
                    <span className="text-xs font-normal text-slate-400 ml-1">
                      /{bill.frequency === 'monthly' ? 'mo' : bill.frequency === 'weekly' ? 'wk' : 'yr'}
                    </span>
                  </div>

                  {bill.notes && (
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{bill.notes}</p>
                  )}

                  {postedThisPeriod && !isPostedRecently && (
                    <p className="text-[10px] text-emerald-400 mt-1">Already posted for {periodLabel}</p>
                  )}

                  {confirmRepostId === bill.id && (
                    <div role="alert" className="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 space-y-2">
                      <p>This bill was already posted for {periodLabel}. Post it again?</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => postBill(bill)}
                          className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold"
                        >
                          Post again
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRepostId(null)}
                          className="px-2.5 py-1 rounded-lg bg-[#27272a] hover:bg-[#3f3f46] text-zinc-300 font-bold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Paid by {payer?.name?.split(' ')[0] || 'Member'}</span>
                    <span>{group?.name || 'Personal'}</span>
                  </div>

                  {/* Split participant avatars */}
                  <div className="flex items-center justify-between">
                    <div className="flex -space-x-1.5 overflow-hidden">
                      {bill.splits.map((s) => {
                        const u = users.find((usr) => usr.id === s.user_id);
                        return (
                          <img
                            key={s.user_id}
                            src={u?.avatar_url || ''}
                            alt={u?.name || ''}
                            title={`${u?.name}: ${formatMinorUnits(s.share_minor, bill.currency)}`}
                            className="inline-block h-5 w-5 rounded-full ring-2 ring-white dark:ring-slate-900 object-cover"
                          />
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => handlePostNow(bill)}
                      disabled={isPostedRecently}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition ${
                        isPostedRecently
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-100 hover:bg-silver-600 hover:text-white text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {isPostedRecently ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Posted!</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Post Split Now</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateRecurringBillModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultGroupId={groupId}
      />
    </div>
  );
}
