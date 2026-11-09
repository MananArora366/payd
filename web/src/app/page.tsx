'use client';

import React, { useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { BottomNav } from '@/components/BottomNav';
import { HomeView } from '@/components/home/HomeView';
import { TransactionsView } from '@/components/transactions/TransactionsView';
import { GroupsView } from '@/components/groups/GroupsView';
import { SettlementsView } from '@/components/settlements/SettlementsView';
import { ProfileView } from '@/components/profile/ProfileView';
import { FloatingMicrophone } from '@/components/voice/FloatingMicrophone';
import { AddExpenseModal } from '@/components/modals/AddExpenseModal';
import { RecordSettlementModal } from '@/components/modals/RecordSettlementModal';
import { CreateGroupModal } from '@/components/modals/CreateGroupModal';
import { TransactionDetailDrawer } from '@/components/modals/TransactionDetailDrawer';
import { ReceiptScannerModal } from '@/components/modals/ReceiptScannerModal';
import { Transaction } from '@/types/database';
import { SimplifiedDebt } from '@/lib/ledger';

export default function AppHome() {
  const [activeTab, setActiveTab] = useState('home');

  // Modal States
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [addExpenseType, setAddExpenseType] = useState<'expense' | 'income'>('expense');
  const [addExpenseGroupId, setAddExpenseGroupId] = useState<string | null>(null);

  const [settlementOpen, setSettlementOpen] = useState(false);
  const [settlementParams, setSettlementParams] = useState<{
    senderId?: string;
    recipientId?: string;
    amountMinor?: number;
    groupId?: string | null;
  }>({});

  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [receiptScannerOpen, setReceiptScannerOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const handleOpenAddExpense = (type: 'expense' | 'income' = 'expense', groupId: string | null = null) => {
    setAddExpenseType(type);
    setAddExpenseGroupId(groupId);
    setAddExpenseOpen(true);
  };

  const handleOpenRecordSettlement = (params?: {
    senderId?: string;
    recipientId?: string;
    amountMinor?: number;
    groupId?: string | null;
  }) => {
    setSettlementParams(params || {});
    setSettlementOpen(true);
  };

  const handleOpenSettlementForDebt = (debt: SimplifiedDebt, groupId: string) => {
    setSettlementParams({
      senderId: debt.fromUserId,
      recipientId: debt.toUserId,
      amountMinor: debt.amountMinor,
      groupId,
    });
    setSettlementOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Navbar onOpenReceiptScanner={() => setReceiptScannerOpen(true)} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 pt-6">
        {activeTab === 'home' && (
          <HomeView
            onOpenAddExpense={(type) => handleOpenAddExpense(type || 'expense')}
            onOpenRecordSettlement={() => handleOpenRecordSettlement()}
            onOpenCreateGroup={() => setCreateGroupOpen(true)}
            onOpenReceiptScanner={() => setReceiptScannerOpen(true)}
            onSelectTransaction={(txn) => setSelectedTransaction(txn)}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'transactions' && (
          <TransactionsView
            onOpenAddExpense={(type) => handleOpenAddExpense(type || 'expense')}
            onSelectTransaction={(txn) => setSelectedTransaction(txn)}
          />
        )}

        {activeTab === 'groups' && (
          <GroupsView
            onOpenCreateGroup={() => setCreateGroupOpen(true)}
            onOpenAddExpenseForGroup={(groupId) => handleOpenAddExpense('expense', groupId)}
            onOpenSettlementForDebt={handleOpenSettlementForDebt}
            onSelectTransaction={(txn) => setSelectedTransaction(txn)}
          />
        )}

        {activeTab === 'settlements' && (
          <SettlementsView
            onOpenRecordSettlement={(params) => handleOpenRecordSettlement(params)}
          />
        )}

        {activeTab === 'profile' && <ProfileView />}
      </main>

      {/* Floating Hero Microphone (Available on all screens) */}
      <FloatingMicrophone onOpenReceiptScanner={() => setReceiptScannerOpen(true)} />

      {/* Responsive Bottom Navigation */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Global Modals */}
      <AddExpenseModal
        isOpen={addExpenseOpen}
        onClose={() => setAddExpenseOpen(false)}
        defaultType={addExpenseType}
        defaultGroupId={addExpenseGroupId}
        onOpenReceiptScanner={() => setReceiptScannerOpen(true)}
      />

      <RecordSettlementModal
        isOpen={settlementOpen}
        onClose={() => setSettlementOpen(false)}
        defaultSenderId={settlementParams.senderId}
        defaultRecipientId={settlementParams.recipientId}
        defaultAmountMinor={settlementParams.amountMinor}
        defaultGroupId={settlementParams.groupId}
      />

      <CreateGroupModal
        isOpen={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
      />

      <TransactionDetailDrawer
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
      />

      <ReceiptScannerModal
        isOpen={receiptScannerOpen}
        onClose={() => setReceiptScannerOpen(false)}
      />
    </div>
  );
}
