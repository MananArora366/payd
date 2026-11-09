'use client';

import React from 'react';
import { Home, Receipt, Users, HandCoins, User } from 'lucide-react';
import { usePayd } from '@/lib/store/PaydContext';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { userIOwe, userOwedToMe } = usePayd();
  const hasSettlementBadge = userIOwe > 0 || userOwedToMe > 0;

  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'transactions', label: 'History', icon: Receipt },
    { id: 'groups', label: 'Groups', icon: Users },
    { id: 'settlements', label: 'Settlements', icon: HandCoins, badge: hasSettlementBadge },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/90 dark:bg-slate-925/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center w-14 py-1 transition ${
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {tab.badge && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </div>
              <span className="text-[10px] mt-1 tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
