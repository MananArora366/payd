'use client';

import React, { useCallback, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { BottomNav } from '@/components/BottomNav';
import { HomeView } from '@/components/home/HomeView';
import { TransactionsView } from '@/components/transactions/TransactionsView';
import { GroupsView } from '@/components/groups/GroupsView';
import { SettlementsView } from '@/components/settlements/SettlementsView';
import { ProfileView } from '@/components/profile/ProfileView';
import { FloatingMicrophone } from '@/components/voice/FloatingMicrophone';
import { AddExpenseModal, type AddExpensePrefill } from '@/components/modals/AddExpenseModal';
import { RecordSettlementModal } from '@/components/modals/RecordSettlementModal';
import { CreateGroupModal } from '@/components/modals/CreateGroupModal';
import { TransactionDetailDrawer } from '@/components/modals/TransactionDetailDrawer';
import { ReceiptScannerModal } from '@/components/modals/ReceiptScannerModal';
import { FairPayerRouletteModal } from '@/components/modals/FairPayerRouletteModal';
import { CareemPayModal } from '@/components/modals/CareemPayModal';
import { CareemSplitPrompt } from '@/components/careem/CareemSplitPrompt';
import { useCareemEvents, type CareemEvent } from '@/lib/careem/useCareemEvents';
import { Transaction } from '@/types/database';
import { SimplifiedDebt } from '@/lib/ledger';

export default function AppHome() {
  const [activeTab, setActiveTab] = useState('home');
  // Group to preselect when the Groups tab opens (e.g. tapping a group card on Home)
  const [focusGroupId, setFocusGroupId] = useState<string | null>(null);

  // Modal States
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [addExpenseType, setAddExpenseType] = useState<'expense' | 'income'>('expense');
  const [addExpenseGroupId, setAddExpenseGroupId] = useState<string | null>(null);
  const [addExpensePrefill, setAddExpensePrefill] = useState<AddExpensePrefill | null>(null);

  const [settlementOpen, setSettlementOpen] = useState(false);
  const [settlementParams, setSettlementParams] = useState<{
    senderId?: string;
    recipientId?: string;
    amountMinor?: number;
    groupId?: string | null;
  }>({});

  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [receiptScannerOpen, setReceiptScannerOpen] = useState(false);
  const [rouletteOpen, setRouletteOpen] = useState(false);
  const [careemPayOpen, setCareemPayOpen] = useState(false);
  const [careemPayParams, setCareemPayParams] = useState<{
    senderId?: string;
    recipientId?: string;
    amountMinor?: number;
    reference?: string;
    groupId?: string | null;
  }>({});
  const [rouletteGroupId, setRouletteGroupId] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // Careem order/ride -> "Split this with others?" prompt
  const careem = useCareemEvents();
  const { decide: decideCareem } = careem;

  const handleCareemSplit = useCallback((event: CareemEvent) => {
    void decideCareem(event.id, 'split');
    const categoryHint =
      event.service === 'ride' ? 'Transportation'
      : event.service === 'groceries' ? 'Groceries'
      : event.service === 'food' ? 'Food and dining'
      : 'box';
    const notes = [
      event.merchant ? `Careem · ${event.merchant}` : 'Careem',
      event.reference ? `ref ${event.reference}` : null,
    ].filter(Boolean).join(' · ');
    setAddExpensePrefill({
      title: event.title || event.merchant || 'Careem order',
      amountMinor: event.amount_minor,
      notes,
      categoryName: categoryHint,
      paymentMethod: 'Careem Pay',
      items: (event.items || []).map((i) => ({
        name: i.quantity > 1 ? `${i.name} x${i.quantity}` : i.name,
        amountMinor: i.amount_minor,
      })),
    });
    setAddExpenseType('expense');
    setAddExpenseGroupId(null);
    setAddExpenseOpen(true);
  }, [decideCareem]);

  const handleCareemDismiss = useCallback((event: CareemEvent) => {
    void decideCareem(event.id, 'dismiss');
  }, [decideCareem]);

  const anyModalOpen =
    addExpenseOpen || settlementOpen || createGroupOpen || receiptScannerOpen ||
    rouletteOpen || careemPayOpen || !!selectedTransaction;

  const handleOpenRoulette = (groupId: string | null = null) => {
    setRouletteGroupId(groupId);
    setRouletteOpen(true);
  };

  const handleOpenCareemPay = (params?: {
    senderId?: string;
    recipientId?: string;
    amountMinor?: number;
    reference?: string;
    groupId?: string | null;
  }) => {
    setCareemPayParams(params || {});
    setCareemPayOpen(true);
  };

  const handleOpenAddExpense = (type: 'expense' | 'income' = 'expense', groupId: string | null = null) => {
    // Manual opens never carry a stale Careem prefill; the modal resets itself on every open.
    setAddExpensePrefill(null);
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
    <div className="min-h-screen flex flex-col bg-[#09090b] text-[#f4f4f5] font-body selection:bg-silver-600 selection:text-white transition-colors">
      <Navbar
        onOpenReceiptScanner={() => setReceiptScannerOpen(true)}
        onOpenAddExpense={() => handleOpenAddExpense('expense')}
        onNavigateTab={(tab) => setActiveTab(tab)}
        activeTab={activeTab}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 pt-4 sm:pt-6">
        {activeTab === 'home' && (
          <HomeView
            onOpenAddExpense={(type?: 'expense' | 'income', groupId?: string | null) =>
              handleOpenAddExpense(type || 'expense', groupId ?? null)
            }
            onOpenReceiptScanner={() => setReceiptScannerOpen(true)}
            onOpenRoulette={() => handleOpenRoulette(null)}
            onOpenCareemPay={() => handleOpenCareemPay()}
            onSelectTransaction={(txn) => setSelectedTransaction(txn)}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onOpenGroup={(groupId) => {
              setFocusGroupId(groupId);
              setActiveTab('groups');
            }}
          />
        )}

        {activeTab === 'transactions' && (
          <TransactionsView
            onOpenAddExpense={(type?: 'expense' | 'income', groupId?: string | null) =>
              handleOpenAddExpense(type || 'expense', groupId ?? null)
            }
            onSelectTransaction={(txn) => setSelectedTransaction(txn)}
          />
        )}

        {activeTab === 'groups' && (
          <GroupsView
            initialGroupId={focusGroupId}
            onOpenCreateGroup={() => setCreateGroupOpen(true)}
            onOpenAddExpenseForGroup={(groupId) => handleOpenAddExpense('expense', groupId)}
            onOpenSettlementForDebt={handleOpenSettlementForDebt}
            onOpenCareemPay={handleOpenCareemPay}
            onSelectTransaction={(txn) => setSelectedTransaction(txn)}
            onOpenRoulette={(gid) => handleOpenRoulette(gid || null)}
          />
        )}

        {activeTab === 'settlements' && (
          <SettlementsView
            onOpenRecordSettlement={(params) => handleOpenRecordSettlement(params)}
            onOpenCareemPay={(params) => handleOpenCareemPay(params)}
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
        onClose={() => {
          setAddExpenseOpen(false);
          setAddExpensePrefill(null);
        }}
        defaultType={addExpenseType}
        defaultGroupId={addExpenseGroupId}
        onOpenReceiptScanner={() => setReceiptScannerOpen(true)}
        prefill={addExpensePrefill}
      />

      <CareemSplitPrompt
        event={anyModalOpen ? null : careem.current}
        pendingCount={careem.pendingCount}
        onSplit={handleCareemSplit}
        onDismiss={handleCareemDismiss}
      />

      <RecordSettlementModal
        isOpen={settlementOpen}
        onClose={() => setSettlementOpen(false)}
        defaultSenderId={settlementParams.senderId}
        defaultRecipientId={settlementParams.recipientId}
        defaultAmountMinor={settlementParams.amountMinor}
        defaultGroupId={settlementParams.groupId}
      />

      <CareemPayModal
        isOpen={careemPayOpen}
        onClose={() => setCareemPayOpen(false)}
        senderId={careemPayParams.senderId}
        recipientId={careemPayParams.recipientId}
        amountMinor={careemPayParams.amountMinor}
        groupId={careemPayParams.groupId}
        reference={careemPayParams.reference}
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

      <FairPayerRouletteModal
        isOpen={rouletteOpen}
        onClose={() => setRouletteOpen(false)}
        defaultGroupId={rouletteGroupId}
      />
    </div>
  );
}
