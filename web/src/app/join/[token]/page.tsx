'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePayd } from '@/lib/store/PaydContext';
import { Users, CheckCircle2, ArrowRight, ShieldCheck } from 'lucide-react';

export default function JoinGroupPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const { groups, currentUser, joinGroupByToken } = usePayd();
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Find preview
  const group =
    groups.find((g) => g.id === token) ||
    (token.includes('marina') ? groups.find((g) => g.name.includes('Flatmates')) : null) ||
    (token.includes('hatta') ? groups.find((g) => g.name.includes('Hatta')) : null) ||
    groups[0];

  const handleJoin = () => {
    const res = joinGroupByToken(token);
    if (res.success) {
      setJoined(true);
      setTimeout(() => {
        router.push('/');
      }, 1500);
    } else {
      setError(res.error || 'Failed to join group');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 flex items-center justify-center text-white mx-auto shadow-lg shadow-emerald-500/30">
          <Users className="w-8 h-8" />
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
            Group Invitation
          </span>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            Join {group?.name || 'Shared Group'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">{group?.description}</p>
        </div>

        {error && (
          <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-xl">
            {error}
          </div>
        )}

        {joined ? (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            <span>Joined group! Redirecting to dashboard...</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-xl text-xs text-slate-600 dark:text-slate-400">
              Joining as <strong className="text-slate-900 dark:text-white">{currentUser.name}</strong> ({currentUser.email})
            </div>

            <button
              onClick={handleJoin}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition"
            >
              <span>Accept & Join Group</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="pt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Payd Voice-First Shared Expense Ledger</span>
        </div>
      </div>
    </div>
  );
}
