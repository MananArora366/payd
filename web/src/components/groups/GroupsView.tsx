'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  ArrowRightLeft,
  Coffee,
  Zap,
} from 'lucide-react';
import { RecurringBillsSection } from '@/components/recurring/RecurringBillsSection';
import { extractInviteToken, resolveInviteGroup, sumBalances } from './groupLogic';
import { getGroupEmoji } from '@/lib/icons';
import { useVisibleGroups } from './useVisibleGroups';

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
  /** Group to select when the view mounts or when this value changes (e.g. opened from Home). */
  initialGroupId?: string | null;
}

export function GroupsView({
  onOpenCreateGroup,
  onOpenAddExpenseForGroup,
  onOpenSettlementForDebt,
  onOpenCareemPay,
  onSelectTransaction,
  onOpenRoulette,
  initialGroupId,
}: GroupsViewProps) {
  const {
    currentUser,
    users,
    groups,
    groupMembers: allGroupMembers,
    transactions,
    splits,
    getGroupMembers,
    getGroupBalances,
    getGroupSimplifiedDebts,
    joinGroupByToken,
  } = usePayd();

  // Only groups the current user belongs to
  const visibleGroups = useVisibleGroups();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    (initialGroupId && visibleGroups.some((g) => g.id === initialGroupId) ? initialGroupId : null) ||
      visibleGroups[0]?.id ||
      null
  );
  const [copiedToken, setCopiedToken] = useState(false);
  const [joinTokenInput, setJoinTokenInput] = useState('');
  const [joinMessage, setJoinMessage] = useState<{ kind: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [scrollRequest, setScrollRequest] = useState(0);
  const detailRef = useRef<HTMLDivElement | null>(null);

  const selectedGroup = visibleGroups.find((g) => g.id === selectedGroupId) || visibleGroups[0];
  const groupMembers = selectedGroup ? getGroupMembers(selectedGroup.id) : [];
  const groupBalances = selectedGroup ? getGroupBalances(selectedGroup.id) : {};
  const simplifiedDebts = selectedGroup ? getGroupSimplifiedDebts(selectedGroup.id) : [];
  const balanceSum = sumBalances(groupBalances);

  const groupTransactions = selectedGroup
    ? transactions.filter((t) => t.group_id === selectedGroup.id && !t.deleted_at)
    : [];

  // Auto-select a group that newly appears for this user (e.g. just created or joined)
  const knownGroupIdsRef = useRef<Set<string> | null>(null);
  const userIdRef = useRef(currentUser.id);
  useEffect(() => {
    const ids = new Set(visibleGroups.map((g) => g.id));
    const prev = knownGroupIdsRef.current;
    if (prev && userIdRef.current === currentUser.id) {
      const added = visibleGroups.find((g) => !prev.has(g.id));
      if (added) {
        setSelectedGroupId(added.id);
        setScrollRequest((n) => n + 1);
      }
    }
    knownGroupIdsRef.current = ids;
    userIdRef.current = currentUser.id;
  }, [visibleGroups, currentUser.id]);

  // On small screens the detail section sits below the grid; scroll it into view.
  useEffect(() => {
    if (scrollRequest === 0 || typeof window === 'undefined') return;
    if (!window.matchMedia || !window.matchMedia('(max-width: 767px)').matches) return;
    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [scrollRequest]);

  // Follow external selection requests (e.g. tapping a group card on Home).
  useEffect(() => {
    if (initialGroupId && visibleGroups.some((g) => g.id === initialGroupId)) {
      setSelectedGroupId(initialGroupId);
      setScrollRequest((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGroupId]);

  const selectGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    setScrollRequest((n) => n + 1);
  };

  const handleCopyInviteLink = async () => {
    if (!selectedGroup) return;
    const inviteUrl = `${window.location.origin}/join/${selectedGroup.id}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } catch {
      setJoinMessage({ kind: 'info', text: `Copy this invite link: ${inviteUrl}` });
    }
  };

  const handleJoinByToken = (e: React.FormEvent) => {
    e.preventDefault();
    const token = extractInviteToken(joinTokenInput);
    if (!token) {
      setJoinMessage({ kind: 'error', text: 'Paste an invite link or token first.' });
      return;
    }

    const target = resolveInviteGroup(token, groups);
    if (
      target &&
      allGroupMembers.some((m) => m.group_id === target.id && m.user_id === currentUser.id)
    ) {
      selectGroup(target.id);
      setJoinMessage({ kind: 'info', text: `You're already a member of ${target.name}.` });
      setJoinTokenInput('');
      return;
    }

    let res: { success: boolean; group?: Group; error?: string; alreadyMember?: boolean; message?: string };
    try {
      res = joinGroupByToken(token);
    } catch {
      res = { success: false };
    }
    if (res.success && res.group) {
      selectGroup(res.group.id);
      setJoinMessage(
        res.alreadyMember
          ? { kind: 'info', text: res.message || `You're already a member of ${res.group.name}.` }
          : { kind: 'success', text: res.message || `Joined ${res.group.name}!` }
      );
      setJoinTokenInput('');
    } else {
      setJoinMessage({
        kind: 'error',
        text: "Invite not found or expired. Check the link and try again.",
      });
    }
  };

  return (
    <div className="space-y-6 pb-28">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl sm:text-2xl text-white tracking-wide">Active ledgers</h2>
          <p className="text-xs text-zinc-400 mt-1 font-body">
            Fewest payments to settle up, so everyone's square
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenCreateGroup}
            className="px-4 py-2.5 rounded-2xl bg-silver-100 hover:bg-white text-zinc-900 font-semibold text-sm flex items-center gap-2 transition active:scale-95"
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
            <LinkIcon className="w-3.5 h-3.5 text-silver-400" />
            <span>Join Ledger:</span>
          </div>
          <input
            type="text"
            placeholder="Paste invite link or token (e.g. dubai-marina-2026)..."
            value={joinTokenInput}
            onChange={(e) => {
              setJoinTokenInput(e.target.value);
              if (joinMessage?.kind === 'error') setJoinMessage(null);
            }}
            aria-label="Invite link or token"
            className="flex-1 w-full px-3.5 py-2 text-xs bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-silver-500 text-white placeholder:text-zinc-600 font-body"
          />
          <button
            type="submit"
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#27272a] hover:bg-silver-600 text-xs font-heading text-white transition active:scale-95"
          >
            Join
          </button>
        </form>
        {joinMessage && (
          <div
            role={joinMessage.kind === 'error' ? 'alert' : 'status'}
            className={`mt-2 text-xs font-medium ${
              joinMessage.kind === 'error'
                ? 'text-rose-400'
                : joinMessage.kind === 'success'
                ? 'text-emerald-400'
                : 'text-zinc-300'
            }`}
          >
            {joinMessage.text}
          </div>
        )}
      </div>

      {/* Groups Grid / Selector Cards */}
      {visibleGroups.length === 0 && (
        <div className="p-8 text-center bg-[#18181b] border border-white/8 rounded-2xl text-xs text-zinc-400 font-body">
          You&apos;re not in any groups yet. Create one or paste an invite link above to join.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {visibleGroups.map((group) => {
          const isSelected = selectedGroup?.id === group.id;
          const members = getGroupMembers(group.id);
          const balances = getGroupBalances(group.id);
          const myBalance = balances[currentUser.id] || 0;

          return (
            <div
              key={group.id}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => selectGroup(group.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectGroup(group.id);
                }
              }}
              className={`p-4 rounded-2xl border cursor-pointer transition shadow-md ${
                isSelected
                  ? 'border-silver-500 bg-[#22222a] ring-2 ring-silver-500/30'
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
                  AED
                </span>
              </div>

              {/* Members Avatar Row & Balance */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/6 font-body">
                <div className="flex -space-x-1.5">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-[#18181b]"
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
                    {formatMinorUnits(myBalance, 'AED')}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Group Detail Section */}
      {selectedGroup && (
        <div ref={detailRef} className="space-y-6 animate-in fade-in duration-150 scroll-mt-4">
          {/* Group Header Controls */}
          <div className="p-5 bg-[#18181b] border border-white/8 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 font-body">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{getGroupEmoji(selectedGroup.name)}</span>
                <h3 className="font-heading text-lg text-white">{selectedGroup.name}</h3>
                <span className="text-[10px] font-heading px-2.5 py-0.5 rounded-full bg-silver-500/20 text-silver-300">
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
                className="px-4 py-2 rounded-xl bg-silver-600 hover:bg-silver-500 text-white text-sm font-semibold flex items-center gap-1.5 transition active:scale-95"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>Add Expense</span>
              </button>
            </div>
          </div>

          {/* Member Roster with Zero-Sum Balances */}
          <div className="p-5 bg-[#18181b] border border-white/8 rounded-2xl shadow-sm space-y-3 font-body">
            <div className="flex items-center justify-between">
              <span className="font-heading text-xs text-zinc-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-silver-400" />
                Member balances
              </span>
              <span
                className={`text-[11px] flex items-center gap-1 font-body ${
                  balanceSum === 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}
                title={
                  balanceSum === 0
                    ? 'Every fils is accounted for: member balances sum to zero'
                    : 'Member balances do not sum to zero, so some activity involves non-members'
                }
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                &Sigma; Balances = {formatMinorUnits(balanceSum, 'AED')}
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
                      <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-white">
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
                      {formatMinorUnits(bal, 'AED')}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Min-Cash-Flow Debt Simplification Box */}
          <div className="p-5 bg-[#18181b] border border-silver-500/30 rounded-2xl space-y-3 font-body">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-full bg-silver-500/20 text-silver-400">
                  <ArrowRightLeft className="w-4 h-4" />
                </span>
                <span className="font-heading text-xs text-silver-300">
                  Optimal debt simplification
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
                          {formatMinorUnits(debt.amountMinor, 'AED')}
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
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-sm transition active:scale-95"
                            title="Instant Careem Pay Transfer"
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
                <div className="p-8 text-center bg-[#18181b] border border-white/8 rounded-2xl text-xs text-zinc-400">
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
                      className="p-3.5 bg-[#18181b] hover:bg-[#202025] border border-white/8 hover:border-silver-500/40 rounded-2xl flex items-center justify-between cursor-pointer transition shadow-sm"
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
