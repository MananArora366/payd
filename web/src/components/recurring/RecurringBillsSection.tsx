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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Filter bills if groupId is provided, or show all
  const displayedBills = groupId
    ? recurringBills.filter((b) => b.group_id === groupId)
    : recurringBills;

  const handlePostNow = (bill: RecurringBill) => {
    try {
      triggerRecurringBillSplit(bill.id);
      setJustPostedId(bill.id);
      setStatusMessage(`Split for "${bill.title}" logged into ledger!`);

      setTimeout(() => {
        setJustPostedId(null);
        setStatusMessage(null);
      }, 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to post split');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-violet-500/20 text-violet-400">
            <Repeat className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-heading text-xs text-white flex items-center gap-1.5">
              SHARED SUBSCRIPTIONS & RECURRING BILLS
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-heading border border-violet-500/30">
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
          className="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-heading text-xs tracking-wider flex items-center gap-1 shadow-md shadow-violet-600/30 transition active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          <span>+ Subscription</span>
        </button>
      </div>

      {statusMessage && (
        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-150">
          <Check className="w-4 h-4" />
          <span>{statusMessage}</span>
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

            return (
              <div
                key={bill.id}
                className="p-4 bg-[#18181b] border border-white/8 hover:border-violet-500/40 rounded-2xl shadow-sm space-y-3 flex flex-col justify-between transition text-white font-body"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Due Day {bill.due_day} • {bill.frequency}
                      </span>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 mt-0.5">
                        {bill.title}
                      </h4>
                    </div>

                    <button
                      type="button"
                      onClick={() => deleteRecurringBill(bill.id)}
                      className="p-1 text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 transition"
                      title="Delete subscription"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="text-lg font-black text-slate-900 dark:text-white mt-2">
                    {formatMinorUnits(bill.amount_minor, bill.currency)}
                    <span className="text-xs font-normal text-slate-400 ml-1">
                      /{bill.frequency === 'monthly' ? 'mo' : bill.frequency === 'weekly' ? 'wk' : 'yr'}
                    </span>
                  </div>

                  {bill.notes && (
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{bill.notes}</p>
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
                          : 'bg-slate-100 hover:bg-purple-600 hover:text-white text-slate-700 dark:bg-slate-800 dark:text-slate-200'
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
