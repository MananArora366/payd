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
  ShieldCheck,
  ChevronRight,
  Receipt,
  Sparkles,
  Coffee,
  Zap,
} from 'lucide-react';
import { RecurringBillsSection } from '@/components/recurring/RecurringBillsSection';

interface GroupsViewProps {
  onOpenCreateGroup: () => void;
  onOpenAddExpenseForGroup: (groupId: string) => void;
  onOpenSettlementForDebt: (debt: SimplifiedDebt, groupId: string) => void;
  onOpenCareemPay?: (params: {
    senderId: string;
    recipientId: string;
    amountMinor: number;
    reference?: string;
    groupId?: string | null;
  }) => void;
  onSelectTransaction: (txn: Transaction) => void;
  onOpenRoulette?: (groupId?: string | null) => void;
}

export function GroupsView({
  onOpenCreateGroup,
  onOpenAddExpenseForGroup,
  onOpenSettlementForDebt,
  onOpenCareemPay,
  onSelectTransaction,
  onOpenRoulette,
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

  const getGroupEmoji = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('dubai') || lower.includes('trip')) return '🌴';
    if (lower.includes('apartment') || lower.includes('flat')) return '🏙️';
    if (lower.includes('supper') || lower.includes('food')) return '🍷';
    return '👥';
  };

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
    <div className="space-y-6 pb-28">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl sm:text-2xl text-white tracking-wide">ACTIVE LEDGERS</h2>
          <p className="text-xs text-zinc-400 mt-1 font-body">
            Deterministic min-cash-flow debt simplification & zero-sum balance guarantees
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenCreateGroup}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white font-heading text-xs tracking-wider flex items-center gap-2 shadow-lg shadow-violet-600/30 transition active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ New Group</span>
          </button>
        </div>
      </div>

      {/* Join Group By Invite Link Box */}
      <div className="p-4 bg-[#18181b] border border-white/8 rounded-2xl shadow-sm font-body">
        <form onSubmit={handleJoinByToken} className="flex flex-col sm:flex-row items-center gap-2">
          <div className="flex items-center gap-2 w-full sm:w-auto text-xs font-heading text-zinc-400 pl-1">
            <LinkIcon className="w-3.5 h-3.5 text-violet-400" />
            <span>Join Ledger:</span>
          </div>
          <input
            type="text"
            placeholder="Paste invite link or token (e.g. dubai-marina-2026)..."
            value={joinTokenInput}
            onChange={(e) => setJoinTokenInput(e.target.value)}
            className="flex-1 w-full px-3.5 py-2 text-xs bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-violet-500 text-white placeholder:text-zinc-600 font-body"
          />
          <button
            type="submit"
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#27272a] hover:bg-violet-600 text-xs font-heading text-white transition active:scale-95"
          >
            Join
          </button>
        </form>
        {joinMessage && (
          <div className="mt-2 text-xs text-emerald-400 font-medium">
            {joinMessage}
          </div>
        )}
      </div>

      {/* Groups Grid / Selector Cards */}
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
              className={`p-4 rounded-2xl border cursor-pointer transition shadow-md ${
                isSelected
                  ? 'border-violet-500 bg-[#22222a] ring-2 ring-violet-500/30'
                  : 'border-white/8 bg-[#18181b] hover:border-white/20'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getGroupEmoji(group.name)}</span>
                  <div>
                    <h3 className="font-heading text-sm text-white">{group.name}</h3>
                    <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5 font-body">{group.description}</p>
                  </div>
                </div>
                <span className="text-[10px] font-heading px-2 py-0.5 rounded-full bg-[#27272a] text-zinc-300">
                  {group.currency}
                </span>
              </div>

              {/* Members Avatar Row & Balance */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/6 font-body">
                <div className="flex -space-x-1.5">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="w-6 h-6 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-[#18181b]"
                      title={m.name}
                    >
                      {m.name.slice(0, 1)}
                    </div>
                  ))}
                </div>

                <div className="text-right">
                  <div className="text-[10px] uppercase font-heading text-zinc-400">Balance</div>
                  <div
                    className={`text-xs font-bold ${
                      myBalance > 0
                        ? 'text-[#10B981]'
                        : myBalance < 0
                        ? 'text-[#F43F5E]'
                        : 'text-zinc-400'
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
          <div className="p-5 bg-[#18181b] border border-white/8 rounded-3xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 font-body">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{getGroupEmoji(selectedGroup.name)}</span>
                <h3 className="font-heading text-lg text-white">{selectedGroup.name}</h3>
                <span className="text-[10px] font-heading px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300">
                  {groupMembers.length} MEMBERS
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 font-body">{selectedGroup.description}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleCopyInviteLink}
                className="px-3.5 py-2 rounded-xl border border-white/10 hover:bg-[#27272a] text-xs font-semibold text-zinc-300 flex items-center gap-1.5 transition active:scale-95"
              >
                {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedToken ? 'Invite Link Copied!' : 'Copy Invite'}</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenRoulette?.(selectedGroup.id)}
                className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition active:scale-95"
                title="Fair Payer Coffee Roulette"
              >
                <Coffee className="w-3.5 h-3.5" />
                <span>Coffee Roulette</span>
              </button>

              <button
                onClick={() => onOpenAddExpenseForGroup(selectedGroup.id)}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-heading tracking-wider flex items-center gap-1.5 shadow-lg shadow-violet-600/30 transition active:scale-95"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>Add Expense</span>
              </button>
            </div>
          </div>

          {/* Member Roster with Zero-Sum Balances */}
          <div className="p-5 bg-[#18181b] border border-white/8 rounded-3xl shadow-sm space-y-3 font-body">
            <div className="flex items-center justify-between">
              <span className="font-heading text-xs text-zinc-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-violet-400" />
                MEMBER BALANCES (ZERO-SUM INVARIANT)
              </span>
              <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-body">
                <ShieldCheck className="w-3.5 h-3.5" />
                &Sigma; Balances = 0.00 AED
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {groupMembers.map((member) => {
                const bal = groupBalances[member.id] || 0;
                const isMe = member.id === currentUser.id;

                return (
                  <div
                    key={member.id}
                    className="p-3 bg-[#202025] border border-white/6 rounded-2xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                        {member.name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">
                          {member.name} {isMe ? '(You)' : ''}
                        </div>
                        <div className="text-[10px] text-zinc-400">
                          {bal > 0 ? 'Gets back' : bal < 0 ? 'Owes' : 'Settled'}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`text-xs font-bold ${
                        bal > 0
                          ? 'text-[#10B981]'
                          : bal < 0
                          ? 'text-[#F43F5E]'
                          : 'text-zinc-500'
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
          <div className="p-5 bg-gradient-to-br from-violet-950/40 via-[#18181b] to-black border border-violet-500/30 rounded-3xl space-y-3 font-body">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-full bg-violet-500/20 text-violet-400">
                  <Sparkles className="w-4 h-4" />
                </span>
                <span className="font-heading text-xs text-violet-300">
                  OPTIMAL DEBT SIMPLIFICATION
                </span>
              </div>
              <span className="text-[11px] text-zinc-400">
                Minimizes total payment transfers
              </span>
            </div>

            {simplifiedDebts.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-400 bg-black/40 rounded-2xl">
                Everyone in this group is completely settled! Zero outstanding debt.
              </div>
            ) : (
              <div className="space-y-2">
                {simplifiedDebts.map((debt, idx) => {
                  const fromUser = users.find((u) => u.id === debt.fromUserId);
                  const toUser = users.find((u) => u.id === debt.toUserId);

                  return (
                    <div
                      key={idx}
                      className="p-3.5 bg-[#202025] rounded-2xl border border-white/8 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">
                          {fromUser?.name} {fromUser?.id === currentUser.id ? '(You)' : ''}
                        </span>
                        <span className="text-zinc-400 font-serif italic">&rarr; pays &rarr;</span>
                        <span className="font-bold text-white">
                          {toUser?.name} {toUser?.id === currentUser.id ? '(You)' : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#10B981] mr-1 text-sm">
                          {formatMinorUnits(debt.amountMinor, selectedGroup.currency)}
                        </span>

                        {onOpenCareemPay && (
                          <button
                            onClick={() =>
                              onOpenCareemPay({
                                senderId: debt.fromUserId,
                                recipientId: debt.toUserId,
                                amountMinor: debt.amountMinor,
                                reference: `${selectedGroup.name} settlement`,
                                groupId: selectedGroup.id,
                              })
                            }
                            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-sm transition active:scale-95"
                            title="Instant Careem Pay / Aani Transfer"
                          >
                            <Zap className="w-3 h-3" />
                            <span>Careem Pay</span>
                          </button>
                        )}

                        <button
                          onClick={() => onOpenSettlementForDebt(debt, selectedGroup.id)}
                          className="px-2.5 py-1.5 rounded-xl bg-[#27272a] hover:bg-[#3f3f46] text-zinc-300 font-semibold text-[11px] transition"
                        >
                          Manual
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Group Expense Log */}
          <div className="space-y-3 font-body">
            <h3 className="font-heading text-xs text-zinc-400">
              GROUP EXPENSE LOG ({groupTransactions.length})
            </h3>

            <div className="space-y-2">
              {groupTransactions.length === 0 ? (
                <div className="p-8 text-center bg-[#18181b] border border-white/8 rounded-3xl text-xs text-zinc-400">
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
                      className="p-3.5 bg-[#18181b] hover:bg-[#202025] border border-white/8 hover:border-violet-500/40 rounded-2xl flex items-center justify-between cursor-pointer transition shadow-sm"
                    >
                      <div>
                        <div className="text-sm font-bold text-white leading-tight">
                          {t.title}
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          Paid by {payer?.name} &bull; Split among {txnSplits.length} members
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-bold text-white">
                          {formatMinorUnits(t.amount_minor, t.currency)}
                        </div>
                        <div className="text-[10px] text-zinc-400">
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

          {/* Group Subscriptions & Recurring Bills */}
          <div className="pt-2">
            <RecurringBillsSection groupId={selectedGroup.id} />
          </div>
        </div>
      )}
    </div>
  );
}
