'use client';

import React from 'react';
import { Home, Receipt, Users, HandCoins, Mic } from 'lucide-react';
import { usePayd } from '@/lib/store/PaydContext';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onTriggerVoice?: () => void;
}

export function BottomNav({ activeTab, onTabChange, onTriggerVoice }: BottomNavProps) {
  const { userIOwe, userOwedToMe } = usePayd();
  const hasSettlementBadge = userIOwe > 0 || userOwedToMe > 0;

  return (
    <nav className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-[440px] z-40">
      <div className="bg-[#18181b]/95 backdrop-blur-2xl border border-white/10 rounded-full px-3 h-16 shadow-2xl shadow-black/80 flex items-center justify-between">
        {/* Tab 1: Home / Dashboard */}
        <button
          onClick={() => onTabChange('home')}
          aria-current={activeTab === 'home' ? 'page' : undefined}
          className={`flex flex-col items-center justify-center w-14 py-1 transition ${
            activeTab === 'home'
              ? 'text-brand-400 font-bold'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          title="Home Dashboard"
        >
          <Home className={`w-5 h-5 transition-transform ${activeTab === 'home' ? 'scale-110' : ''}`} />
          <span className="text-[10px] mt-0.5 font-medium tracking-tight">Home</span>
        </button>

        {/* Tab 2: Groups */}
        <button
          onClick={() => onTabChange('groups')}
          aria-current={activeTab === 'groups' ? 'page' : undefined}
          className={`flex flex-col items-center justify-center w-14 py-1 transition ${
            activeTab === 'groups'
              ? 'text-brand-400 font-bold'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          title="Active Groups"
        >
          <Users className={`w-5 h-5 transition-transform ${activeTab === 'groups' ? 'scale-110' : ''}`} />
          <span className="text-[10px] mt-0.5 font-medium tracking-tight">Groups</span>
        </button>

        {/* Center Floating FAB: voice input */}
        <div className="relative -top-4 flex items-center justify-center">
          {/* Soft animated green halo behind the FAB */}
          <span
            aria-hidden="true"
            className="payd-mic-halo pointer-events-none absolute inset-0 -m-1.5 rounded-full bg-brand-400/40 blur-md animate-pulse motion-reduce:animate-none"
          />
          <button
            onClick={() => {
              if (onTriggerVoice) {
                onTriggerVoice();
              } else {
                const micBtn = document.getElementById('payd-voice-mic-trigger');
                if (micBtn) micBtn.click();
              }
            }}
            className="payd-mic-fab relative shrink-0 w-[52px] h-[52px] sm:w-14 sm:h-14 rounded-full bg-brand-400 hover:bg-brand-300 text-zinc-950 flex items-center justify-center ring-4 ring-[#09090b] shadow-[0_0_20px_4px_rgba(74,222,128,0.55)] hover:shadow-[0_0_26px_6px_rgba(74,222,128,0.65)] active:shadow-[0_0_14px_3px_rgba(74,222,128,0.5)] active:scale-95 transition-all duration-200"
            title="Speak an expense"
            aria-label="Speak an expense"
          >
            <Mic className="w-6 h-6" />
          </button>
        </div>

        {/* Tab 3: Settle up, the core feature: always tinted green, with a badge for open balances */}
        <button
          onClick={() => onTabChange('settlements')}
          aria-current={activeTab === 'settlements' ? 'page' : undefined}
          aria-label={hasSettlementBadge ? 'Settle up (open balances)' : 'Settle up'}
          className={`relative flex flex-col items-center justify-center w-14 py-1 transition ${
            activeTab === 'settlements' ? 'text-brand-300 font-bold' : 'text-brand-400 hover:text-brand-300 font-semibold'
          }`}
          title="Settle up"
        >
          <div className="relative">
            <HandCoins className={`w-5 h-5 transition-transform ${activeTab === 'settlements' ? 'scale-110' : ''}`} />
            {hasSettlementBadge && (
              <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-[#18181b]" />
            )}
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight whitespace-nowrap">Settle up</span>
        </button>

        {/* Tab 4: Transactions / Activity */}
        <button
          onClick={() => onTabChange('transactions')}
          aria-current={activeTab === 'transactions' ? 'page' : undefined}
          className={`flex flex-col items-center justify-center w-14 py-1 transition ${
            activeTab === 'transactions'
              ? 'text-brand-400 font-bold'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          title="Expense Activity"
        >
          <Receipt className={`w-5 h-5 transition-transform ${activeTab === 'transactions' ? 'scale-110' : ''}`} />
          <span className="text-[10px] mt-0.5 font-medium tracking-tight">Activity</span>
        </button>
      </div>
    </nav>
  );
}
