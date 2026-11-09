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
} from './initialData';
import {
  calculateNetBalances,
  calculatePersonalSpend,
  calculateBilateralDebts,
  simplifyDebts,
  validateSettlementAmount,
  splitEqual,
  LedgerInvariantError,
  SimplifiedDebt,
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
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  switchUser: (userId: string) => void;
  addTransaction: (input: AddTransactionInput) => Transaction;
  softDeleteTransaction: (transactionId: string) => void;
  restoreTransaction: (transactionId: string) => void;
  recordSettlement: (input: RecordSettlementInput) => Settlement;
  createGroup: (name: string, description: string, memberIds: string[], currency?: string) => Group;
  joinGroupByToken: (token: string) => { success: boolean; group?: Group; error?: string };
  updateBudget: (limit_minor: number, category_id?: string | null) => void;
  updateUserProfile: (updates: Partial<User>) => void;
  resetToDemoData: () => void;
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
  getGroupBalances: (groupId: string) => Record<string, number>;
  getGroupSimplifiedDebts: (groupId: string) => SimplifiedDebt[];
  getGroupMembers: (groupId: string) => User[];
}

const PaydContext = createContext<PaydContextType | undefined>(undefined);

const STORAGE_KEY = 'payd_state_v1';

export function PaydProvider({ children }: { children: React.ReactNode }) {
  const [isClient, setIsClient] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

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

  // Load from localStorage on client mount
  useEffect(() => {
    setIsClient(true);
    try {
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
  ]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('payd_theme', nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
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
      currency: input.currency || currentUser.default_currency || 'AED',
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
    if (input.sender_id === input.recipient_id) {
      throw new LedgerInvariantError('Sender and recipient cannot be the same user');
    }

    // Check outstanding debt between sender and recipient
    const bilateral = calculateBilateralDebts(transactions, splits, settlements);
    const debtorMap = bilateral.get(input.sender_id);
    const currentDebt = debtorMap?.get(input.recipient_id) || 0;

    if (!validateSettlementAmount(input.amount_minor, currentDebt, input.allowOverpayment ?? false)) {
      throw new LedgerInvariantError(
        `Settlement amount (${input.amount_minor}) exceeds current outstanding liability (${currentDebt})`
      );
    }

    const settlementId = `s-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const newSettlement: Settlement = {
      id: settlementId,
      group_id: input.group_id || null,
      sender_id: input.sender_id,
      recipient_id: input.recipient_id,
      amount_minor: Math.round(input.amount_minor),
      currency: input.currency || currentUser.default_currency || 'AED',
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
      currency,
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

  // Join group by invite token
  const joinGroupByToken = (token: string): { success: boolean; group?: Group; error?: string } => {
    // For demo/simulated tokens:
    // Matches by group ID or predefined token strings
    const targetGroup =
      groups.find((g) => g.id === token) ||
      (token === 'dubai-marina-2026' ? groups.find((g) => g.name.includes('Flatmates')) : null) ||
      (token === 'hatta-camp-2026' ? groups.find((g) => g.name.includes('Hatta')) : null);

    if (!targetGroup) {
      return { success: false, error: 'Invalid or expired invite token' };
    }

    const alreadyMember = groupMembers.some((m) => m.group_id === targetGroup.id && m.user_id === currentUser.id);
    if (!alreadyMember) {
      setGroupMembers((prev) => [
        ...prev,
        {
          group_id: targetGroup.id,
          user_id: currentUser.id,
          role: 'member',
          joined_at: new Date().toISOString(),
        },
      ]);
    }

    return { success: true, group: targetGroup };
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

  // Derived financial computations using pure ledger engine
  const netBalances = useMemo(() => {
    return calculateNetBalances(transactions, splits, settlements);
  }, [transactions, splits, settlements]);

  const userNetBalance = netBalances[currentUser.id] || 0;

  // Breakdown of "Owed to me" vs "I owe"
  const { userOwedToMe, userIOwe } = useMemo(() => {
    const bilateral = calculateBilateralDebts(transactions, splits, settlements);
    let owedToMe = 0;
    let iOwe = 0;

    // What others owe currentUser:
    for (const [debtorId, credMap] of bilateral.entries()) {
      if (debtorId !== currentUser.id && credMap.has(currentUser.id)) {
        owedToMe += credMap.get(currentUser.id) || 0;
      }
    }

    // What currentUser owes others:
    const myDebts = bilateral.get(currentUser.id);
    if (myDebts) {
      for (const amount of myDebts.values()) {
        iOwe += amount;
      }
    }

    return { userOwedToMe: owedToMe, userIOwe: iOwe };
  }, [transactions, splits, settlements, currentUser.id]);

  const userSpending = useMemo(() => {
    return calculatePersonalSpend(currentUser.id, transactions, splits);
  }, [currentUser.id, transactions, splits]);

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
    const groupNet = getGroupBalances(groupId);
    return simplifyDebts(groupNet);
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
        theme,
        toggleTheme,
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
        netBalances,
        userNetBalance,
        userOwedToMe,
        userIOwe,
        userSpending,
        getGroupBalances,
        getGroupSimplifiedDebts,
        getGroupMembers,
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
