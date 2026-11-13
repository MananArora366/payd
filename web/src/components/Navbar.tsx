'use client';

import React, { useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { ChevronDown, Check, Camera, Cpu, Plus, Sparkles, User } from 'lucide-react';

interface NavbarProps {
  onOpenReceiptScanner?: () => void;
  onOpenMcp?: () => void;
  onOpenAddExpense?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export function Navbar({ onOpenReceiptScanner, onOpenMcp, onOpenAddExpense, onNavigateTab }: NavbarProps = {}) {
  const { currentUser, users, switchUser } = usePayd();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-[#09090b]/85 border-b border-white/8 transition-colors">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand with authentic Zen Dots typography and gradient dot */}
        <div 
          onClick={() => onNavigateTab ? onNavigateTab('home') : null}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="flex items-baseline gap-1">
            <span className="font-logo text-2xl sm:text-3xl text-white tracking-wide transition-opacity group-hover:opacity-90">
              payd
            </span>
            <span className="w-2 h-2 rounded-full bg-gradient-to-tr from-[#A78BFA] to-[#7C3AED] shadow-sm shadow-violet-500/50 inline-block mb-0.5 animate-pulse" />
          </div>
          <span className="hidden md:inline-flex items-center text-[10px] font-heading px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20">
            Careem &bull; Voice Ledger
          </span>
        </div>

        {/* Right side controls matching iOS Prototype */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {onOpenAddExpense && (
            <button
              onClick={onOpenAddExpense}
              className="w-9 h-9 rounded-full bg-gradient-to-tr from-violet-600 to-violet-400 hover:from-violet-500 hover:to-violet-300 text-white flex items-center justify-center shadow-lg shadow-violet-600/30 transition hover:scale-105 active:scale-95"
              title="Add Expense"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}

          {onOpenReceiptScanner && (
            <button
              onClick={onOpenReceiptScanner}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#18181b] hover:bg-[#27272a] text-slate-200 border border-white/10 hover:border-violet-500/40 transition text-xs font-bold shadow-xs active:scale-95"
              title="Scan receipt with Payd Lens"
            >
              <Camera className="w-3.5 h-3.5 text-violet-400" />
              <span className="hidden sm:inline">Payd Lens</span>
            </button>
          )}

          {onOpenMcp && (
            <button
              onClick={onOpenMcp}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#18181b] hover:bg-[#27272a] text-slate-200 border border-white/10 hover:border-violet-500/40 transition text-xs font-bold shadow-xs active:scale-95"
              title="Open MCP Financial Agent Tools"
            >
              <Cpu className="w-3.5 h-3.5 text-violet-400" />
              <span className="hidden sm:inline">MCP Tools</span>
            </button>
          )}

          {/* User Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-[#18181b] hover:bg-[#27272a] border border-white/10 hover:border-violet-500/40 transition text-xs text-white"
              title="Switch demo persona"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-[11px] font-bold text-white shadow-xs">
                {currentUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
              </div>
              <span className="font-medium hidden sm:inline">{currentUser.name}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {userDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setUserDropdownOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-60 rounded-2xl bg-[#18181b] border border-white/10 shadow-2xl py-2 z-50 animate-in fade-in-50 zoom-in-95">
                  <div className="px-3.5 py-2 border-b border-white/8">
                    <span className="text-[10px] font-heading text-violet-400 tracking-wider">
                      Switch Active Persona
                    </span>
                  </div>
                  {users.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => {
                        switchUser(user.id);
                        setUserDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-left text-xs transition ${
                        user.id === currentUser.id
                          ? 'bg-violet-500/15 text-violet-300 font-bold'
                          : 'text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
                          {user.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-semibold leading-none">{user.name}</div>
                          <div className="text-[10px] text-slate-400 mt-1">{user.email}</div>
                        </div>
                      </div>
                      {user.id === currentUser.id && <Check className="w-4 h-4 text-violet-400" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
