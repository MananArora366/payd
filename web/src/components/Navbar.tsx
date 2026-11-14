'use client';

import React from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { Camera, Plus } from 'lucide-react';

interface NavbarProps {
  onOpenReceiptScanner?: () => void;
  onOpenAddExpense?: () => void;
  onNavigateTab?: (tab: string) => void;
  /** Highlights the avatar while the Profile screen (not part of the bottom tabs) is shown. */
  activeTab?: string;
}

export function Navbar({ onOpenReceiptScanner, onOpenAddExpense, onNavigateTab, activeTab }: NavbarProps = {}) {
  const onProfile = activeTab === 'profile';
  const { currentUser } = usePayd();

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-[#09090b]/85 border-b border-white/8 transition-colors">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand with authentic Zen Dots typography and gradient dot */}
        <button
          type="button"
          onClick={() => onNavigateTab?.('home')}
          aria-label="Payd home"
          className="flex items-center gap-2 cursor-pointer group text-left"
        >
          <img
            src="/brand/payd-logo-96.png"
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            className="w-8 h-8 sm:w-9 sm:h-9 transition-opacity group-hover:opacity-90"
          />
          <div className="flex items-baseline gap-1">
            <span className="font-logo text-2xl sm:text-3xl text-white tracking-wide transition-opacity group-hover:opacity-90">
              payd
            </span>
            <span className="w-2 h-2 rounded-full bg-silver-gradient inline-block mb-0.5" />
          </div>
        </button>

        {/* Right side controls matching iOS Prototype */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {onOpenAddExpense && (
            <button
              onClick={onOpenAddExpense}
              aria-label="Add expense"
              className="w-9 h-9 rounded-full bg-silver-100 hover:bg-white text-zinc-900 flex items-center justify-center transition active:scale-95"
              title="Add Expense"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}

          {onOpenReceiptScanner && (
            <button
              onClick={onOpenReceiptScanner}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#18181b] hover:bg-[#27272a] text-slate-200 border border-white/10 hover:border-silver-500/40 transition text-xs font-bold shadow-xs active:scale-95"
              title="Scan receipt with Payd Lens"
            >
              <Camera className="w-3.5 h-3.5 text-silver-400" />
              <span className="hidden sm:inline">Payd Lens</span>
            </button>
          )}

          {/* Profile */}
          <button
            type="button"
            onClick={() => onNavigateTab?.(onProfile ? 'home' : 'profile')}
            aria-current={onProfile ? 'page' : undefined}
            aria-label={onProfile ? 'Close profile and go home' : 'Your profile'}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-[#18181b] hover:bg-[#27272a] border transition text-xs text-white ${
              onProfile ? 'border-silver-500 ring-2 ring-silver-500/40' : 'border-white/10 hover:border-silver-500/40'
            }`}
            title={onProfile ? 'Back to home' : 'Your profile'}
          >
            <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[11px] font-bold text-white shadow-xs">
              {currentUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </div>
            <span className="font-medium hidden sm:inline">{currentUser.name}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
