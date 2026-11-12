'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  Camera,
  Mic,
  Dices,
  Zap,
  Cpu,
  ChevronRight,
  X,
  Trophy,
} from 'lucide-react';

interface DemoTourBannerProps {
  onOpenReceiptScanner: () => void;
  onOpenRoulette: () => void;
  onOpenMcp: () => void;
  onOpenCareemPay: () => void;
}

export function DemoTourBanner({
  onOpenReceiptScanner,
  onOpenRoulette,
  onOpenMcp,
  onOpenCareemPay,
}: DemoTourBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 border border-emerald-500/30 p-4 sm:p-5 shadow-xl text-white">
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 shadow-md">
              <Trophy className="w-4 h-4 font-black" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                  Careem Builders &apos;26 Hackathon
                </span>
                <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  Live Showcase
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Explore Payd&apos;s standout features built for Dubai & the UAE super-app ecosystem
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsDismissed(true)}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition"
            title="Dismiss showcase banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 5 Feature Quick-Launcher Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <button
            type="button"
            onClick={onOpenReceiptScanner}
            className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-500/40 text-left transition group"
          >
            <div className="flex items-center justify-between text-emerald-400 mb-1">
              <Camera className="w-4 h-4 group-hover:scale-110 transition" />
              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-emerald-500/20">
                Vision
              </span>
            </div>
            <div className="text-xs font-bold text-white group-hover:text-emerald-300 transition">
              Payd Lens OCR
            </div>
            <div className="text-[10px] text-slate-400">LuLu & UAE 5% VAT</div>
          </button>

          <button
            type="button"
            onClick={onOpenRoulette}
            className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-500/40 text-left transition group"
          >
            <div className="flex items-center justify-between text-amber-400 mb-1">
              <Dices className="w-4 h-4 group-hover:scale-110 transition" />
              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-amber-500/20">
                Fair
              </span>
            </div>
            <div className="text-xs font-bold text-white group-hover:text-amber-300 transition">
              Coffee Roulette
            </div>
            <div className="text-[10px] text-slate-400">Debt-weighted spin</div>
          </button>

          <button
            type="button"
            onClick={onOpenCareemPay}
            className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#00ea80]/40 text-left transition group"
          >
            <div className="flex items-center justify-between text-[#00ea80] mb-1">
              <Zap className="w-4 h-4 group-hover:scale-110 transition" />
              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-[#00ea80]/20">
                Aani
              </span>
            </div>
            <div className="text-xs font-bold text-white group-hover:text-[#00ea80] transition">
              Careem Pay & Aani
            </div>
            <div className="text-[10px] text-slate-400">Instant UAE settlement</div>
          </button>

          <button
            type="button"
            onClick={onOpenMcp}
            className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-400/40 text-left transition group"
          >
            <div className="flex items-center justify-between text-cyan-400 mb-1">
              <Cpu className="w-4 h-4 group-hover:scale-110 transition" />
              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-cyan-500/20">
                Agent
              </span>
            </div>
            <div className="text-xs font-bold text-white group-hover:text-cyan-300 transition">
              MCP Tools
            </div>
            <div className="text-[10px] text-slate-400">Claude & Cursor server</div>
          </button>
        </div>
      </div>
    </div>
  );
}
