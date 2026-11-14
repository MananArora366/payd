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
              ? 'text-silver-400 font-bold'
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
              ? 'text-silver-400 font-bold'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          title="Active Groups"
        >
          <Users className={`w-5 h-5 transition-transform ${activeTab === 'groups' ? 'scale-110' : ''}`} />
          <span className="text-[10px] mt-0.5 font-medium tracking-tight">Groups</span>
        </button>

        {/* Center Floating FAB: Voice AI / Quick Action */}
        <div className="relative -top-4 flex items-center justify-center">
          <button
            onClick={() => {
              if (onTriggerVoice) {
                onTriggerVoice();
              } else {
                // Dispatch event or fall back to voice
                const micBtn = document.getElementById('payd-voice-mic-trigger');
                if (micBtn) micBtn.click();
              }
            }}
            className="group relative w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-silver-100 hover:bg-white text-zinc-900 flex items-center justify-center ring-4 ring-[#09090b] active:scale-95 transition-all duration-200"
            title="Speak an expense"
            aria-label="Speak an expense"
          >
            <Mic className="w-6 h-6 relative z-10" />
          </button>
        </div>

        {/* Tab 3: Settlements */}
        <button
          onClick={() => onTabChange('settlements')}
          aria-current={activeTab === 'settlements' ? 'page' : undefined}
          className={`relative flex flex-col items-center justify-center w-14 py-1 transition ${
            activeTab === 'settlements'
              ? 'text-silver-400 font-bold'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          title="Smart Settlements"
        >
          <div className="relative">
            <HandCoins className={`w-5 h-5 transition-transform ${activeTab === 'settlements' ? 'scale-110' : ''}`} />
            {hasSettlementBadge && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" />
            )}
          </div>
          <span className="text-[10px] mt-0.5 font-medium tracking-tight">Settle</span>
        </button>

        {/* Tab 4: Transactions / Activity */}
        <button
          onClick={() => onTabChange('transactions')}
          aria-current={activeTab === 'transactions' ? 'page' : undefined}
          className={`flex flex-col items-center justify-center w-14 py-1 transition ${
            activeTab === 'transactions'
              ? 'text-silver-400 font-bold'
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
