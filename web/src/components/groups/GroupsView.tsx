'use client';

import React, { useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits, SimplifiedDebt } from '@/lib/ledger';
import { Group, Transaction } from '@/types/database';
import {
  Users,
  Plus,
  Link as LinkIcon,
  Copy,
  Check,
  ArrowRight,
  HandCoins,
  ShieldCheck,
  ChevronRight,
  Receipt,
  Sparkles,
} from 'lucide-react';

interface GroupsViewProps {
  onOpenCreateGroup: () => void;
  onOpenAddExpenseForGroup: (groupId: string) => void;
  onOpenSettlementForDebt: (debt: SimplifiedDebt, groupId: string) => void;
  onSelectTransaction: (txn: Transaction) => void;
}

export function GroupsView({
  onOpenCreateGroup,
  onOpenAddExpenseForGroup,
  onOpenSettlementForDebt,
  onSelectTransaction,
}: GroupsViewProps) {
  const {
    currentUser,
    users,
    groups,
    transactions,
    splits,
    getGroupMembers,
    getGroupBalances,
    getGroupSimplifiedDebts,
    joinGroupByToken,
  } = usePayd();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(groups[0]?.id || null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [joinTokenInput, setJoinTokenInput] = useState('');
  const [joinMessage, setJoinMessage] = useState<string | null>(null);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || groups[0];
  const groupMembers = selectedGroup ? getGroupMembers(selectedGroup.id) : [];
  const groupBalances = selectedGroup ? getGroupBalances(selectedGroup.id) : {};
  const simplifiedDebts = selectedGroup ? getGroupSimplifiedDebts(selectedGroup.id) : [];

  const groupTransactions = selectedGroup
    ? transactions.filter((t) => t.group_id === selectedGroup.id && !t.deleted_at)
    : [];

  const handleCopyInviteLink = () => {
    const inviteUrl = `${window.location.origin}/join/${selectedGroup?.id || 'demo'}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleJoinByToken = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinTokenInput.trim()) return;

    const res = joinGroupByToken(joinTokenInput.trim());
    if (res.success && res.group) {
      setSelectedGroupId(res.group.id);
      setJoinMessage(`Successfully joined ${res.group.name}!`);
      setJoinTokenInput('');
    } else {
      setJoinMessage(res.error || 'Could not join group');
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Shared Groups</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Splitwise-style groups with min-cash-flow debt simplification
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenCreateGroup}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Create Group</span>
          </button>
        </div>
      </div>

      {/* Join Group By Invite Link Box */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm">
        <form onSubmit={handleJoinByToken} className="flex flex-col sm:flex-row items-center gap-2">
          <div className="flex items-center gap-2 w-full sm:w-auto text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">
            <LinkIcon className="w-3.5 h-3.5 text-emerald-500" />
            <span>Join Group:</span>
          </div>
          <input
            type="text"
            placeholder="Paste invite link or token (e.g. dubai-marina-2026)..."
            value={joinTokenInput}
            onChange={(e) => setJoinTokenInput(e.target.value)}
            className="flex-1 w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
          />
          <button
            type="submit"
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-xs font-semibold text-slate-800 dark:text-slate-200 transition"
          >
            Join
          </button>
        </form>
        {joinMessage && (
          <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            {joinMessage}
          </div>
        )}
      </div>

      {/* Groups Carousel / Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {groups.map((group) => {
          const isSelected = selectedGroup?.id === group.id;
          const members = getGroupMembers(group.id);
          const balances = getGroupBalances(group.id);
          const myBalance = balances[currentUser.id] || 0;

          return (
            <div
              key={group.id}
              onClick={() => setSelectedGroupId(group.id)}
              className={`p-4 rounded-3xl border cursor-pointer transition shadow-sm ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20 ring-2 ring-emerald-500/20'
                  : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">{group.name}</h3>
                  <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{group.description}</p>
                </div>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {group.currency}
                </span>
              </div>

              {/* Members Avatar Row */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex -space-x-1.5">
                  {members.map((m) => (
                    <img
                      key={m.id}
                      src={m.avatar_url || ''}
                      alt={m.name}
                      title={m.name}
                      className="w-6 h-6 rounded-full object-cover ring-2 ring-white dark:ring-slate-900"
                    />
                  ))}
                </div>

                <div className="text-right">
                  <div className="text-[10px] uppercase font-semibold text-slate-400">Your Balance</div>
                  <div
                    className={`text-xs font-bold ${
                      myBalance > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : myBalance < 0
                        ? 'text-rose-500'
                        : 'text-slate-500'
                    }`}
                  >
                    {myBalance > 0 ? '+' : ''}
                    {formatMinorUnits(myBalance, group.currency)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Group Detail Section */}
      {selectedGroup && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Group Header Controls */}
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{selectedGroup.name}</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                  {groupMembers.length} members
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{selectedGroup.description}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyInviteLink}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-750 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition"
              >
                {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedToken ? 'Invite Link Copied!' : 'Copy Invite Link'}</span>
              </button>

              <button
                onClick={() => onOpenAddExpenseForGroup(selectedGroup.id)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Group Expense</span>
              </button>
            </div>
          </div>

          {/* Member Roster with Zero-Sum Balances */}
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-500" />
                Member Balances (Zero-Sum Invariant)
              </span>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Sum of balances = 0.00
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {groupMembers.map((member) => {
                const bal = groupBalances[member.id] || 0;
                const isMe = member.id === currentUser.id;

                return (
                  <div
                    key={member.id}
                    className="p-3 bg-slate-50 dark:bg-slate-850/70 border border-slate-200/60 dark:border-slate-800 rounded-2xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={member.avatar_url || ''}
                        alt={member.name}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {member.name} {isMe ? '(You)' : ''}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {bal > 0 ? 'Gets back' : bal < 0 ? 'Owes' : 'Settled'}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`text-xs font-bold ${
                        bal > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : bal < 0
                          ? 'text-rose-500'
                          : 'text-slate-400'
                      }`}
                    >
                      {bal > 0 ? '+' : ''}
                      {formatMinorUnits(bal, selectedGroup.currency)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Min-Cash-Flow Debt Simplification Box */}
          <div className="p-5 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/30 rounded-3xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-full bg-emerald-500/20 text-emerald-500">
                  <Sparkles className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Optimal Debt Simplification
                </span>
              </div>
              <span className="text-[11px] text-slate-500">
                Minimizes total payment transactions
              </span>
            </div>

            {simplifiedDebts.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-slate-900/50 rounded-2xl">
                Everyone in this group is completely even! No pending debt settlements.
              </div>
            ) : (
              <div className="space-y-2">
                {simplifiedDebts.map((debt, idx) => {
                  const fromUser = users.find((u) => u.id === debt.fromUserId);
                  const toUser = users.find((u) => u.id === debt.toUserId);

                  return (
                    <div
                      key={idx}
                      className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {fromUser?.name} {fromUser?.id === currentUser.id ? '(You)' : ''}
                        </span>
                        <span className="text-slate-400">pays</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {toUser?.name} {toUser?.id === currentUser.id ? '(You)' : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-black text-emerald-600 dark:text-emerald-400">
                          {formatMinorUnits(debt.amountMinor, selectedGroup.currency)}
                        </span>

                        <button
                          onClick={() => onOpenSettlementForDebt(debt, selectedGroup.id)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] shadow-sm transition"
                        >
                          Settle this
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Group Expense Log */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Group Activity Log ({groupTransactions.length})
            </h3>

            <div className="space-y-2">
              {groupTransactions.length === 0 ? (
                <div className="p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-xs text-slate-400">
                  No expenses added to this group yet.
                </div>
              ) : (
                groupTransactions.map((t) => {
                  const payer = users.find((u) => u.id === t.payer_id);
                  const txnSplits = splits.filter((s) => s.transaction_id === t.id);

                  return (
                    <div
                      key={t.id}
                      onClick={() => onSelectTransaction(t)}
                      className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/50 rounded-2xl flex items-center justify-between cursor-pointer transition shadow-sm"
                    >
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                          {t.title}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Paid by {payer?.name} • Split among {txnSplits.length} members
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          {formatMinorUnits(t.amount_minor, t.currency)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(t.occurred_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
