'use client';

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  User,
  Group,
  GroupMember,
  Category,
  Transaction,
  TransactionSplit,
  Settlement,
  Budget,
  AuditLog,
  RecurringBill,
  UserReimbursementVelocity,
  CashFlowExposureMetrics,
} from '@/types/database';
import {
  INITIAL_USERS,
  INITIAL_CATEGORIES,
  INITIAL_GROUPS,
  INITIAL_GROUP_MEMBERS,
  INITIAL_TRANSACTIONS,
  INITIAL_SPLITS,
  INITIAL_SETTLEMENTS,
  INITIAL_BUDGETS,
  INITIAL_RECURRING_BILLS,
} from './initialData';
import {
  calculateNetBalances,
  calculatePersonalSpend,
  calculateBilateralDebts,
  calculateGroupedBilateralDebts,
  getPairDebtBreakdown as breakdownPairDebt,
  getSignedPairDebt,
  checkSettlement,
  formatMinorUnits,
  LedgerInvariantError,
  SimplifiedDebt,
  PairDebtComponent,
} from '@/lib/ledger';

interface AddTransactionInput {
  type: 'expense' | 'income' | 'refund' | 'transfer' | 'adjustment';
  title: string;
  amount_minor: number;
  currency?: string;
  category_id?: string | null;
  payer_id: string;
  group_id?: string | null;
  payment_method?: string;
  notes?: string | null;
  occurred_at?: string;
  splits: { user_id: string; share_minor: number }[];
}

interface RecordSettlementInput {
  group_id?: string | null;
  sender_id: string;
  recipient_id: string;
  amount_minor: number;
  currency?: string;
  method: string;
  reference?: string | null;
  allowOverpayment?: boolean;
}

export type SettlementValidation = { ok: true; debtMinor: number } | { ok: false; reason: string; debtMinor: number };

export interface JoinGroupResult {
  success: boolean;
  group?: Group;
  error?: string;
  /** True when the current user was already in the group (success is still true). */
  alreadyMember?: boolean;
  /** Friendly status text, e.g. "You're already a member of Dubai Flatmates." */
  message?: string;
}

/** Pulls a token out of "https://host/join/<token>?x#y", "/join/<token>" or a bare token. */
export function extractJoinToken(input: string): string {
  let raw = (input || '').trim();
  if (!raw) return '';
  const m = raw.match(/\/join\/([^/?#\s]+)/i);
  if (m) raw = m[1];
  raw = raw.split(/[?#]/)[0].replace(/\/+$/, '');
  try {
    raw = decodeURIComponent(raw);
  } catch {}
  return raw.trim();
}

interface PaydContextType {
  currentUser: User;
  users: User[];
  groups: Group[];
  groupMembers: GroupMember[];
  categories: Category[];
  transactions: Transaction[];
  splits: TransactionSplit[];
  settlements: Settlement[];
  budgets: Budget[];
  auditLogs: AuditLog[];
  recurringBills: RecurringBill[];
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  /** User setting: use AI (Claude) for receipts, voice and questions. Sent with every /api/ai request. */
  aiEnabled: boolean;
  setAiEnabled: (enabled: boolean) => void;
  switchUser: (userId: string) => void;
  addTransaction: (input: AddTransactionInput) => Transaction;
  softDeleteTransaction: (transactionId: string) => void;
  restoreTransaction: (transactionId: string) => void;
  recordSettlement: (input: RecordSettlementInput) => Settlement;
  createGroup: (name: string, description: string, memberIds: string[], currency?: string) => Group;
  joinGroupByToken: (token: string) => JoinGroupResult;
  updateBudget: (limit_minor: number, category_id?: string | null) => void;
  updateUserProfile: (updates: Partial<User>) => void;
  resetToDemoData: () => void;
  // Recurring Subscriptions & Bills
  addRecurringBill: (bill: Omit<RecurringBill, 'id' | 'created_at'>) => RecurringBill;
  deleteRecurringBill: (billId: string) => void;
  triggerRecurringBillSplit: (billId: string) => Transaction;
  // Computed financial aggregates
  netBalances: Record<string, number>;
  userNetBalance: number;
  userOwedToMe: number;
  userIOwe: number;
  userSpending: {
    totalSpentMinor: number;
    totalIncomeMinor: number;
    netSavingsMinor: number;
  };
  reimbursementVelocities: UserReimbursementVelocity[];
  cashFlowExposure: CashFlowExposureMetrics;
  getGroupBalances: (groupId: string) => Record<string, number>;
  getGroupSimplifiedDebts: (groupId: string) => SimplifiedDebt[];
  getGroupMembers: (groupId: string) => User[];
  // ── Unified debt model (added by the settlements fix) ──
  /** Groups the current user is a member of. */
  visibleGroups: Group[];
  /** Overall netted pairwise debts: debtorId -> creditorId -> amountMinor. */
  bilateralDebts: Map<string, Map<string, number>>;
  /**
   * What `fromUserId` owes `toUserId` (>= 0). With a groupId: the debt inside that
   * group (same number the Groups tab suggests). Without: the overall netted debt.
   */
  getPairwiseDebt: (fromUserId: string, toUserId: string, groupId?: string | null) => number;
  /** Per-group components between two users (each in its own direction). groupId null = no group. */
  getPairDebtBreakdown: (userA: string, userB: string) => PairDebtComponent[];
  /** Pure check, run BEFORE charging anyone. Uses the same debt as getPairwiseDebt. */
  validateSettlement: (input: {
    sender_id: string;
    recipient_id: string;
    amount_minor: number;
    group_id?: string | null;
    allowOverpayment?: boolean;
  }) => SettlementValidation;
}

const PaydContext = createContext<PaydContextType | undefined>(undefined);

const STORAGE_KEY = 'payd_state_v3';

export function PaydProvider({ children }: { children: React.ReactNode }) {
  const [isClient, setIsClient] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [aiEnabled, setAiEnabledState] = useState(true);

  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [currentUser, setCurrentUser] = useState<User>(INITIAL_USERS[0]);
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [groups, setGroups] = useState<Group[]>(INITIAL_GROUPS);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>(INITIAL_GROUP_MEMBERS);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [splits, setSplits] = useState<TransactionSplit[]>(INITIAL_SPLITS);
  const [settlements, setSettlements] = useState<Settlement[]>(INITIAL_SETTLEMENTS);
  const [budgets, setBudgets] = useState<Budget[]>(INITIAL_BUDGETS);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [recurringBills, setRecurringBills] = useState<RecurringBill[]>(INITIAL_RECURRING_BILLS);

  // Load from localStorage on client mount
  useEffect(() => {
    setIsClient(true);
    try {
      if (localStorage.getItem('payd_ai_enabled') === 'false') setAiEnabledState(false);
      const storedTheme = localStorage.getItem('payd_theme') as 'light' | 'dark';
      if (storedTheme) {
        setTheme(storedTheme);
        document.documentElement.classList.toggle('dark', storedTheme === 'dark');
      } else {
        document.documentElement.classList.add('dark');
      }

      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.users) setUsers(parsed.users);
        if (parsed.currentUserId) {
          const found = parsed.users?.find((u: User) => u.id === parsed.currentUserId);
          if (found) setCurrentUser(found);
        }
        if (parsed.categories) setCategories(parsed.categories);
        if (parsed.groups) setGroups(parsed.groups);
        if (parsed.groupMembers) setGroupMembers(parsed.groupMembers);
        if (parsed.transactions) setTransactions(parsed.transactions);
        if (parsed.splits) setSplits(parsed.splits);
        if (parsed.settlements) setSettlements(parsed.settlements);
        if (parsed.budgets) setBudgets(parsed.budgets);
        if (parsed.auditLogs) setAuditLogs(parsed.auditLogs);
        if (parsed.recurringBills) setRecurringBills(parsed.recurringBills);
      }
    } catch (e) {
      console.warn('Failed to parse Payd local store:', e);
    }
  }, []);

  // Save to localStorage when state changes
  useEffect(() => {
    if (!isClient) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          users,
          currentUserId: currentUser.id,
          categories,
          groups,
          groupMembers,
          transactions,
          splits,
          settlements,
          budgets,
          auditLogs,
          recurringBills,
        })
      );
    } catch (e) {
      console.warn('Failed to save Payd state to localStorage:', e);
    }
  }, [
    isClient,
    users,
    currentUser,
    categories,
    groups,
    groupMembers,
    transactions,
    splits,
    settlements,
    budgets,
    auditLogs,
    recurringBills,
  ]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('payd_theme', nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
  };

  const setAiEnabled = (enabled: boolean) => {
    setAiEnabledState(enabled);
    try {
      localStorage.setItem('payd_ai_enabled', String(enabled));
    } catch {
      // Storage can be unavailable (private mode); the setting still applies this session.
    }
  };

  const switchUser = (userId: string) => {
    const found = users.find((u) => u.id === userId);
    if (found) setCurrentUser(found);
  };

  const resetToDemoData = () => {
    setUsers(INITIAL_USERS);
    setCurrentUser(INITIAL_USERS[0]);
    setCategories(INITIAL_CATEGORIES);
    setGroups(INITIAL_GROUPS);
    setGroupMembers(INITIAL_GROUP_MEMBERS);
    setTransactions(INITIAL_TRANSACTIONS);
    setSplits(INITIAL_SPLITS);
    setSettlements(INITIAL_SETTLEMENTS);
    setBudgets(INITIAL_BUDGETS);
    setRecurringBills(INITIAL_RECURRING_BILLS);
    setAuditLogs([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  // Add Transaction with strict allocation invariant
  const addTransaction = (input: AddTransactionInput): Transaction => {
    // Invariant 3 check: sum of shares must equal amount_minor
    const splitSum = input.splits.reduce((acc, s) => acc + s.share_minor, 0);
    if (splitSum !== input.amount_minor) {
      throw new LedgerInvariantError(
        `Split sum (${splitSum}) does not equal transaction amount (${input.amount_minor})`
      );
    }

    const txnId = `t-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const newTxn: Transaction = {
      id: txnId,
      type: input.type,
      title: input.title,
      amount_minor: Math.round(input.amount_minor),
      currency: 'AED', // AED-only ledger
      category_id: input.category_id || null,
      payer_id: input.payer_id,
      group_id: input.group_id || null,
      payment_method: input.payment_method || 'Card',
      notes: input.notes || null,
      occurred_at: input.occurred_at || now,
      created_by: currentUser.id,
      created_at: now,
    };

    const newSplits: TransactionSplit[] = input.splits.map((s, idx) => ({
      id: `sp-${txnId}-${idx}`,
      transaction_id: txnId,
      user_id: s.user_id,
      share_minor: Math.round(s.share_minor),
      created_at: now,
    }));

    const auditEntry: AuditLog = {
      id: `al-${Date.now()}`,
      actor_id: currentUser.id,
      action: 'insert',
      record_type: 'transaction',
      record_id: txnId,
      before: null,
      after: { transaction: newTxn, splits: newSplits },
      created_at: now,
    };

    setTransactions((prev) => [newTxn, ...prev]);
    setSplits((prev) => [...prev, ...newSplits]);
    setAuditLogs((prev) => [auditEntry, ...prev]);

    return newTxn;
  };

  // Soft delete transaction
  const softDeleteTransaction = (transactionId: string) => {
    const existing = transactions.find((t) => t.id === transactionId);
    if (!existing || existing.deleted_at) return;

    const now = new Date().toISOString();
    const updated = { ...existing, deleted_at: now };

    const auditEntry: AuditLog = {
      id: `al-${Date.now()}`,
      actor_id: currentUser.id,
      action: 'soft_delete',
      record_type: 'transaction',
      record_id: transactionId,
      before: existing,
      after: updated,
      created_at: now,
    };

    setTransactions((prev) => prev.map((t) => (t.id === transactionId ? updated : t)));
    setAuditLogs((prev) => [auditEntry, ...prev]);
  };

  // Restore transaction
  const restoreTransaction = (transactionId: string) => {
    const existing = transactions.find((t) => t.id === transactionId);
    if (!existing || !existing.deleted_at) return;

    const updated = { ...existing, deleted_at: undefined };
    const now = new Date().toISOString();

    const auditEntry: AuditLog = {
      id: `al-${Date.now()}`,
      actor_id: currentUser.id,
      action: 'restore',
      record_type: 'transaction',
      record_id: transactionId,
      before: existing,
      after: updated,
      created_at: now,
    };

    setTransactions((prev) => prev.map((t) => (t.id === transactionId ? updated : t)));
    setAuditLogs((prev) => [auditEntry, ...prev]);
  };

  // Record Settlement
  const recordSettlement = (input: RecordSettlementInput): Settlement => {
    const check = validateSettlement(input);
    if (!check.ok) {
      // Message is already plain-language; UIs can show err.message directly.
      throw new LedgerInvariantError(check.reason);
    }

    const settlementId = `s-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const newSettlement: Settlement = {
      id: settlementId,
      group_id: input.group_id || null,
      sender_id: input.sender_id,
      recipient_id: input.recipient_id,
      amount_minor: Math.round(input.amount_minor),
      currency: 'AED', // AED-only ledger
      method: input.method || 'Cash',
      reference: input.reference || null,
      status: 'settled',
      settled_at: now,
      created_at: now,
    };

    const auditEntry: AuditLog = {
      id: `al-${Date.now()}`,
      actor_id: currentUser.id,
      action: 'insert',
      record_type: 'settlement',
      record_id: settlementId,
      before: null,
      after: newSettlement,
      created_at: now,
    };

    setSettlements((prev) => [newSettlement, ...prev]);
    setAuditLogs((prev) => [auditEntry, ...prev]);

    return newSettlement;
  };

  // Create Group
  const createGroup = (name: string, description: string, memberIds: string[], currency: string = 'AED'): Group => {
    const groupId = `g-${Date.now()}`;
    const now = new Date().toISOString();

    const newGroup: Group = {
      id: groupId,
      name,
      description,
      currency: currency === 'AED' ? currency : 'AED', // AED-only ledger; param kept for API compatibility
      creator_id: currentUser.id,
      created_at: now,
    };

    const allMemberIds = Array.from(new Set([currentUser.id, ...memberIds]));
    const newMembers: GroupMember[] = allMemberIds.map((uid) => ({
      group_id: groupId,
      user_id: uid,
      role: uid === currentUser.id ? 'admin' : 'member',
      joined_at: now,
    }));

    setGroups((prev) => [newGroup, ...prev]);
    setGroupMembers((prev) => [...prev, ...newMembers]);

    return newGroup;
  };

  // Join group by invite token, full invite URL (/join/<token>) or raw group id
  const joinGroupByToken = (input: string): JoinGroupResult => {
    const token = extractJoinToken(input);
    if (!token) return { success: false, error: 'Paste an invite link or code first.' };
    const lower = token.toLowerCase();
    const targetGroup =
      groups.find((g) => g.id === token) ||
      (lower === 'dubai-marina-2026' ? groups.find((g) => g.name.includes('Flatmates')) : null) ||
      (lower === 'hatta-camp-2026' ? groups.find((g) => g.name.includes('Hatta')) : null);

    if (!targetGroup) {
      return { success: false, error: 'That invite link is invalid or has expired.' };
    }

    const alreadyMember = groupMembers.some((m) => m.group_id === targetGroup.id && m.user_id === currentUser.id);
    if (alreadyMember) {
      return {
        success: true,
        group: targetGroup,
        alreadyMember: true,
        message: `You're already a member of ${targetGroup.name}.`,
      };
    }
    setGroupMembers((prev) => [
      ...prev,
      {
        group_id: targetGroup.id,
        user_id: currentUser.id,
        role: 'member',
        joined_at: new Date().toISOString(),
      },
    ]);

    return { success: true, group: targetGroup, alreadyMember: false, message: `Joined ${targetGroup.name}!` };
  };

  // Update budget
  const updateBudget = (limit_minor: number, category_id?: string | null) => {
    const now = new Date().toISOString();
    setBudgets((prev) => {
      const idx = prev.findIndex(
        (b) => b.user_id === currentUser.id && b.category_id === (category_id || null)
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], limit_minor };
        return copy;
      }
      return [
        ...prev,
        {
          id: `b-${Date.now()}`,
          user_id: currentUser.id,
          category_id: category_id || null,
          limit_minor,
          period: 'monthly',
          created_at: now,
        },
      ];
    });
  };

  // Update user profile
  const updateUserProfile = (updates: Partial<User>) => {
    const updated = { ...currentUser, ...updates };
    setCurrentUser(updated);
    setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? updated : u)));
  };

  // Recurring Subscriptions & Shared Bills
  const addRecurringBill = (bill: Omit<RecurringBill, 'id' | 'created_at'>): RecurringBill => {
    const newBill: RecurringBill = {
      ...bill,
      id: `rec-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    setRecurringBills((prev) => [newBill, ...prev]);
    return newBill;
  };

  const deleteRecurringBill = (billId: string) => {
    setRecurringBills((prev) => prev.filter((b) => b.id !== billId));
  };

  const triggerRecurringBillSplit = (billId: string): Transaction => {
    const bill = recurringBills.find((b) => b.id === billId);
    if (!bill) throw new Error('Recurring bill template not found');

    const now = new Date().toISOString();
    const periodName =
      bill.frequency === 'monthly' ? 'Monthly' : bill.frequency === 'weekly' ? 'Weekly' : 'Annual';

    const txn = addTransaction({
      type: 'expense',
      title: `${bill.title} (${periodName} Split)`,
      amount_minor: bill.amount_minor,
      currency: bill.currency,
      category_id: bill.category_id,
      payer_id: bill.payer_id,
      group_id: bill.group_id,
      payment_method: 'Auto-Debit / Card',
      notes: bill.notes || `Recurring subscription automatically triggered on ${new Date().toLocaleDateString('en-AE')}`,
      splits: bill.splits,
    });

    setRecurringBills((prev) =>
      prev.map((b) => (b.id === billId ? { ...b, last_posted_at: now } : b))
    );

    return txn;
  };

  // Derived financial computations using pure ledger engine
  const netBalances = useMemo(() => {
    return calculateNetBalances(transactions, splits, settlements);
  }, [transactions, splits, settlements]);

  const userNetBalance = netBalances[currentUser.id] || 0;

  // Unified debt model: per-group netted debts, aggregated and netted across groups.
  const groupedBilateralDebts = useMemo(
    () => calculateGroupedBilateralDebts(transactions, splits, settlements),
    [transactions, splits, settlements]
  );
  const bilateralDebts = useMemo(
    () => calculateBilateralDebts(transactions, splits, settlements),
    [transactions, splits, settlements]
  );

  // Breakdown of "Owed to me" vs "I owe". owedToMe - iOwe === userNetBalance.
  const { userOwedToMe, userIOwe } = useMemo(() => {
    let owedToMe = 0;
    let iOwe = 0;
    for (const [debtorId, credMap] of bilateralDebts.entries()) {
      if (debtorId === currentUser.id) {
        for (const amount of credMap.values()) iOwe += amount;
      } else {
        owedToMe += credMap.get(currentUser.id) || 0;
      }
    }
    return { userOwedToMe: owedToMe, userIOwe: iOwe };
  }, [bilateralDebts, currentUser.id]);

  const getPairwiseDebt = (fromUserId: string, toUserId: string, groupId?: string | null): number => {
    if (fromUserId === toUserId) return 0;
    const debts = groupId ? groupedBilateralDebts.get(groupId) : bilateralDebts;
    return Math.max(0, getSignedPairDebt(debts, fromUserId, toUserId));
  };

  const getPairDebtBreakdown = (userA: string, userB: string): PairDebtComponent[] =>
    breakdownPairDebt(groupedBilateralDebts, userA, userB);

  const validateSettlement: PaydContextType['validateSettlement'] = (input) => {
    const debt = getPairwiseDebt(input.sender_id, input.recipient_id, input.group_id);
    const nameOf = (id: string) => (id === currentUser.id ? 'You' : users.find((u) => u.id === id)?.name || 'Someone');
    const senderName = nameOf(input.sender_id);
    const recipientName = input.recipient_id === currentUser.id ? 'you' : nameOf(input.recipient_id);
    if (input.group_id) {
      const group = groups.find((g) => g.id === input.group_id);
      if (!group) return { ok: false, reason: "That group doesn't exist any more.", debtMinor: debt };
      const members = new Set(groupMembers.filter((m) => m.group_id === input.group_id).map((m) => m.user_id));
      if (input.sender_id && input.recipient_id && (!members.has(input.sender_id) || !members.has(input.recipient_id))) {
        return { ok: false, reason: `Both people need to be members of ${group.name} to settle in it.`, debtMinor: debt };
      }
    }
    if (input.sender_id && !users.some((u) => u.id === input.sender_id)) {
      return { ok: false, reason: 'Choose who is paying.', debtMinor: debt };
    }
    if (input.recipient_id && !users.some((u) => u.id === input.recipient_id)) {
      return { ok: false, reason: 'Choose who is being paid.', debtMinor: debt };
    }
    return checkSettlement(input, debt, {
      sender: senderName,
      recipient: recipientName,
      format: (m) => formatMinorUnits(m, 'AED'),
    });
  };

  const visibleGroups = useMemo(() => {
    const mine = new Set(groupMembers.filter((m) => m.user_id === currentUser.id).map((m) => m.group_id));
    return groups.filter((g) => mine.has(g.id));
  }, [groups, groupMembers, currentUser.id]);

  const userSpending = useMemo(() => {
    return calculatePersonalSpend(currentUser.id, transactions, splits);
  }, [currentUser.id, transactions, splits]);

  // Reimbursement Velocity & Debt Lag Analytics.
  // Only real history counts: expenses currentUser fronted that the other person
  // shared, and that person's repayments. No history -> avg_lag_days null ("n/a").
  const reimbursementVelocities: UserReimbursementVelocity[] = useMemo(() => {
    const otherUsers = users.filter((u) => u.id !== currentUser.id);
    const DAY = 1000 * 60 * 60 * 24;

    return otherUsers.map((u) => {
      const currentOwed = bilateralDebts.get(u.id)?.get(currentUser.id) || 0;

      // Expenses currentUser paid where u had a share (income and other types ignored).
      const uShared = new Set(
        splits.filter((sp) => sp.user_id === u.id && sp.share_minor > 0).map((sp) => sp.transaction_id)
      );
      const frontedForU = transactions
        .filter(
          (t) =>
            !t.deleted_at &&
            t.type === 'expense' &&
            t.payer_id === currentUser.id &&
            uShared.has(t.id)
        )
        .map((t) => new Date(t.occurred_at).getTime())
        .filter((ms) => Number.isFinite(ms))
        .sort((a, b) => a - b);

      const userSettlements = settlements.filter(
        (s) => s.sender_id === u.id && s.recipient_id === currentUser.id && s.status === 'settled'
      );

      let avgLagDays: number | null = null;
      const lags: number[] = [];
      for (const st of userSettlements) {
        const stTime = new Date(st.settled_at).getTime();
        // Most recent fronted expense on or before this repayment.
        let prev: number | undefined;
        for (const ms of frontedForU) if (ms <= stTime) prev = ms;
        if (prev !== undefined) lags.push(Math.max(0, (stTime - prev) / DAY));
      }
      if (lags.length > 0) {
        avgLagDays = Math.round((lags.reduce((a, b) => a + b, 0) / lags.length) * 10) / 10;
      } else if (currentOwed > 0 && frontedForU.length > 0) {
        // Open debt with no repayment yet: how long the oldest fronted expense has been waiting.
        avgLagDays = Math.round(((Date.now() - frontedForU[0]) / DAY) * 10) / 10;
      }

      const tier: UserReimbursementVelocity['tier'] =
        avgLagDays === null ? 'unknown' : avgLagDays <= 2.5 ? 'speedy' : avgLagDays <= 7.0 ? 'average' : 'lagging';

      return {
        user_id: u.id,
        name: u.name,
        avatar_url: u.avatar_url,
        avg_lag_days: avgLagDays,
        avg_lag_label: avgLagDays === null ? 'n/a' : `${avgLagDays} days`,
        total_settlements_count: userSettlements.length,
        tier,
        current_owed_minor: currentOwed,
      };
    });
  }, [users, currentUser.id, transactions, splits, settlements, bilateralDebts]);

  // Cash Flow & Out-of-pocket Exposure
  const cashFlowExposure: CashFlowExposureMetrics = useMemo(() => {
    let totalFronted = 0;
    let personalConsumption = 0;

    for (const t of transactions) {
      if (t.deleted_at || t.type !== 'expense') continue;
      if (t.payer_id === currentUser.id) {
        totalFronted += t.amount_minor;
        const mySplit = splits.find(
          (s) => s.transaction_id === t.id && s.user_id === currentUser.id
        );
        personalConsumption += mySplit ? mySplit.share_minor : 0;
      }
    }

    let totalRecovered = 0;
    for (const st of settlements) {
      if (st.recipient_id === currentUser.id && st.status === 'settled') {
        totalRecovered += st.amount_minor;
      }
    }

    const outstanding = Math.max(0, totalFronted - personalConsumption - totalRecovered);

    const laggingUsers = reimbursementVelocities
      .filter((v) => v.current_owed_minor > 0)
      .sort((a, b) => (b.avg_lag_days ?? -1) - (a.avg_lag_days ?? -1));

    return {
      total_fronted_minor: totalFronted,
      total_recovered_minor: totalRecovered,
      outstanding_exposure_minor: outstanding,
      personal_consumption_minor: personalConsumption,
      top_lagging_user: laggingUsers[0] || null,
    };
  }, [transactions, splits, settlements, currentUser.id, reimbursementVelocities]);

  // Group helpers
  const getGroupMembers = (groupId: string): User[] => {
    const memberUserIds = groupMembers.filter((m) => m.group_id === groupId).map((m) => m.user_id);
    return users.filter((u) => memberUserIds.includes(u.id));
  };

  const getGroupBalances = (groupId: string): Record<string, number> => {
    const groupTxns = transactions.filter((t) => t.group_id === groupId);
    const groupTxnIds = new Set(groupTxns.map((t) => t.id));
    const groupSplits = splits.filter((s) => groupTxnIds.has(s.transaction_id));
    const groupSettlements = settlements.filter((s) => s.group_id === groupId);
    const memberIds = groupMembers.filter((m) => m.group_id === groupId).map((m) => m.user_id);

    return calculateNetBalances(groupTxns, groupSplits, groupSettlements, memberIds);
  };

  const getGroupSimplifiedDebts = (groupId: string): SimplifiedDebt[] => {
    // Same numbers as getPairwiseDebt(from, to, groupId) and the settlement check.
    const groupDebts = groupedBilateralDebts.get(groupId);
    const out: SimplifiedDebt[] = [];
    if (!groupDebts) return out;
    for (const [from, m] of groupDebts) {
      for (const [to, amountMinor] of m) out.push({ fromUserId: from, toUserId: to, amountMinor });
    }
    return out.sort((a, b) => b.amountMinor - a.amountMinor);
  };

  return (
    <PaydContext.Provider
      value={{
        currentUser,
        users,
        groups,
        groupMembers,
        categories,
        transactions,
        splits,
        settlements,
        budgets,
        auditLogs,
        recurringBills,
        theme,
        toggleTheme,
        aiEnabled,
        setAiEnabled,
        switchUser,
        addTransaction,
        softDeleteTransaction,
        restoreTransaction,
        recordSettlement,
        createGroup,
        joinGroupByToken,
        updateBudget,
        updateUserProfile,
        resetToDemoData,
        addRecurringBill,
        deleteRecurringBill,
        triggerRecurringBillSplit,
        netBalances,
        userNetBalance,
        userOwedToMe,
        userIOwe,
        userSpending,
        reimbursementVelocities,
        cashFlowExposure,
        getGroupBalances,
        getGroupSimplifiedDebts,
        getGroupMembers,
        visibleGroups,
        bilateralDebts,
        getPairwiseDebt,
        getPairDebtBreakdown,
        validateSettlement,
      }}
    >
      {children}
    </PaydContext.Provider>
  );
}

export function usePayd() {
  const context = useContext(PaydContext);
  if (!context) {
    throw new Error('usePayd must be used within a PaydProvider');
  }
  return context;
}
