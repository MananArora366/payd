'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits, parseMajorToMinor, splitEqual } from '@/lib/ledger';
import { X, Coffee, Sparkles, ShieldCheck, RotateCw, Trophy, Users, Dices } from 'lucide-react';

interface FairPayerRouletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGroupId?: string | null;
}

const SLICE_COLORS = [
  '#10b981', // emerald-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#8b5cf6', // purple-500
  '#f59e0b', // amber-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
];

export function FairPayerRouletteModal({
  isOpen,
  onClose,
  defaultGroupId = null,
}: FairPayerRouletteModalProps) {
  const { currentUser, users, groups, addTransaction, getGroupBalances, userOwedToMe } = usePayd();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(defaultGroupId || groups[0]?.id || null);
  const [amountStr, setAmountStr] = useState('45.00');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(users.map((u) => u.id));
  const [mode, setMode] = useState<'debt_weighted' | 'equal'>('debt_weighted');

  const [isSpinning, setIsSpinning] = useState(false);
  const [currentRotation, setCurrentRotation] = useState(0);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Group balances for weighting
  const groupBalances = selectedGroupId ? getGroupBalances(selectedGroupId) : {};

  // Compute probability weights for each selected user
  const participants = users.filter((u) => selectedUserIds.includes(u.id));

  // Compute slice weights
  const sliceWeights = React.useMemo(() => {
    if (participants.length === 0) return [];

    if (mode === 'equal') {
      return participants.map((p) => ({ user: p, weight: 1 }));
    }

    // Debt-weighted: users who owe money (negative balance) get more weight!
    // Minimum base weight of 1 for everyone
    return participants.map((p) => {
      const net = groupBalances[p.id] ?? 0;
      // If user owes 100 AED, net is -10000. Give them extra weight!
      const debtWeight = net < 0 ? Math.min(10, Math.ceil(Math.abs(net) / 2500)) : 0;
      return {
        user: p,
        weight: 1 + debtWeight,
      };
    });
  }, [participants, mode, groupBalances]);

  const totalWeight = sliceWeights.reduce((acc, s) => acc + s.weight, 0);

  // Draw the roulette wheel on canvas
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const radius = center - 8;

    ctx.clearRect(0, 0, size, size);

    if (sliceWeights.length === 0) return;

    let startAngle = 0;

    sliceWeights.forEach((slice, idx) => {
      const sliceAngle = (slice.weight / totalWeight) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;

      // Slice fill
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = SLICE_COLORS[idx % SLICE_COLORS.length];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();

      // Slice text
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(startAngle + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Inter, system-ui, sans-serif';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 4;
      const text = slice.user.name.split(' ')[0];
      ctx.fillText(text, radius - 18, 4);

      if (mode === 'debt_weighted' && slice.weight > 1) {
        ctx.font = 'bold 9px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#fef08a';
        ctx.fillText(`+${slice.weight - 1}x`, radius - 18, 16);
      }

      ctx.restore();

      startAngle = endAngle;
    });

    // Center hub
    ctx.beginPath();
    ctx.arc(center, center, 24, 0, 2 * Math.PI);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    // Center icon text
    ctx.fillStyle = '#38bdf8';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('☕', center, center);
  }, [isOpen, sliceWeights, totalWeight, mode]);

  if (!isOpen) return null;

  const toggleUser = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      if (selectedUserIds.length <= 2) return; // Keep at least 2 for roulette
      setSelectedUserIds(selectedUserIds.filter((id) => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
    setWinnerId(null);
    setShowCelebration(false);
  };

  const handleSpin = () => {
    if (isSpinning || sliceWeights.length < 2) return;

    setIsSpinning(true);
    setWinnerId(null);
    setShowCelebration(false);

    // Pick random target index weighted by sliceWeights
    const rand = Math.random() * totalWeight;
    let accumulated = 0;
    let selectedIndex = 0;

    for (let i = 0; i < sliceWeights.length; i++) {
      accumulated += sliceWeights[i].weight;
      if (rand <= accumulated) {
        selectedIndex = i;
        break;
      }
    }

    // Compute target angle for selectedIndex
    // Canvas 0 radians is at 3 o'clock. The pointer is at 12 o'clock (270 degrees / 1.5 * PI).
    let angleBeforeSelected = 0;
    for (let i = 0; i < selectedIndex; i++) {
      angleBeforeSelected += (sliceWeights[i].weight / totalWeight) * 360;
    }
    const selectedSliceSpan = (sliceWeights[selectedIndex].weight / totalWeight) * 360;
    const targetSliceMid = angleBeforeSelected + selectedSliceSpan / 2;

    // Pointer is at top (270°). To bring targetSliceMid to 270°:
    const neededRotation = (270 - targetSliceMid + 360) % 360;

    // Add 6 to 9 full spins (360 * spins)
    const extraSpins = 360 * (6 + Math.floor(Math.random() * 3));
    const nextRotation = currentRotation + extraSpins + neededRotation - (currentRotation % 360);

    setCurrentRotation(nextRotation);

    setTimeout(() => {
      setIsSpinning(false);
      setWinnerId(sliceWeights[selectedIndex].user.id);
      setShowCelebration(true);
    }, 4000);
  };

  const handleRecordTransaction = () => {
    if (!winnerId) return;

    const totalMinor = parseMajorToMinor(amountStr, currentUser.default_currency);
    const splitObj = splitEqual(totalMinor, selectedUserIds);
    const splits = Object.entries(splitObj).map(([uid, share]) => ({
      user_id: uid,
      share_minor: share,
    }));

    const winner = users.find((u) => u.id === winnerId);

    addTransaction({
      type: 'expense',
      title: `Coffee & Treats Round (Covered by ${winner?.name?.split(' ')[0]})`,
      amount_minor: totalMinor,
      currency: currentUser.default_currency,
      category_id: 'c0000001-0000-0000-0000-000000000001', // Food and dining
      payer_id: winnerId,
      group_id: selectedGroupId || null,
      payment_method: 'Card / Apple Pay',
      notes: `Fair Payer Roulette round • ${mode === 'debt_weighted' ? 'Debt-Weighted Fairness' : 'Pure Random'}`,
      splits,
    });

    onClose();
  };

  const winnerUser = winnerId ? users.find((u) => u.id === winnerId) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                Fair Payer Roulette
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold uppercase">
                  Mini-Game
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">Who covers coffee or lunch today?</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Amount & Mode Selector */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Bill Amount</span>
            <div className="flex items-center gap-1">
              {['25.00', '45.00', '80.00', '150.00'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmountStr(preset)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition ${
                    amountStr === preset
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  AED {preset.split('.')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <input
              type="number"
              step="0.01"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full px-4 py-2 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-2xl text-slate-900 dark:text-white font-extrabold focus:outline-none focus:ring-2 focus:ring-amber-500 pr-14 text-center"
            />
            <span className="absolute right-4 top-2.5 text-xs text-slate-400 font-bold pointer-events-none">
              AED
            </span>
          </div>

          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-850 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode('debt_weighted')}
              className={`py-1.5 rounded-lg transition flex items-center justify-center gap-1.5 ${
                mode === 'debt_weighted'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs font-bold'
                  : 'text-slate-500'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Smart Debt-Weighted</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('equal')}
              className={`py-1.5 rounded-lg transition flex items-center justify-center gap-1.5 ${
                mode === 'equal'
                  ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-xs font-bold'
                  : 'text-slate-500'
              }`}
            >
              <Dices className="w-3.5 h-3.5" />
              <span>Pure Chance</span>
            </button>
          </div>

          {mode === 'debt_weighted' && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2 rounded-xl text-center">
              ⚖️ Members with negative balances (who owe the group money) receive a wider slice!
            </p>
          )}
        </div>

        {/* Interactive Roulette Wheel */}
        <div className="relative flex flex-col items-center justify-center py-2">
          {/* Top Pointer Arrow */}
          <div className="z-10 -mb-3 flex flex-col items-center">
            <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[16px] border-t-amber-500 drop-shadow-md" />
          </div>

          {/* Spinning Wheel */}
          <div
            className="transition-transform duration-[4000ms] cubic-bezier(0.15, 0.9, 0.2, 1)"
            style={{
              transform: `rotate(${currentRotation}deg)`,
            }}
          >
            <canvas ref={canvasRef} width={260} height={260} className="rounded-full shadow-2xl" />
          </div>

          {/* Winner Display Badge */}
          {winnerUser && showCelebration && (
            <div className="mt-3 p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/20 via-emerald-500/20 to-amber-500/20 border border-amber-500/40 text-center animate-in zoom-in-95 duration-200 w-full">
              <div className="flex items-center justify-center gap-1.5 text-xs font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                <Trophy className="w-4 h-4" /> Winner Covers The Bill!
              </div>
              <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                {winnerUser.name}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pays AED {amountStr} • Split equally among {selectedUserIds.length} friends
              </p>
            </div>
          )}
        </div>

        {/* Participants Selector */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>In the Wheel ({selectedUserIds.length})</span>
            <span className="text-[10px]">Tap to include/exclude</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {users.map((u) => {
              const inWheel = selectedUserIds.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleUser(u.id)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition ${
                    inWheel
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}
                >
                  <img src={u.avatar_url || ''} alt={u.name} className="w-3.5 h-3.5 rounded-full object-cover" />
                  <span>{u.name.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2">
          {!winnerUser || !showCelebration ? (
            <button
              type="button"
              onClick={handleSpin}
              disabled={isSpinning || sliceWeights.length < 2}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-400 text-white font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 transition active:scale-98 disabled:opacity-50"
            >
              <RotateCw className={`w-4 h-4 ${isSpinning ? 'animate-spin' : ''}`} />
              <span>{isSpinning ? 'Spinning...' : 'Spin The Wheel!'}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSpin}
                className="py-3 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 transition"
              >
                Re-spin
              </button>
              <button
                type="button"
                onClick={handleRecordTransaction}
                className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/25 transition"
              >
                Record {winnerUser.name.split(' ')[0]}&apos;s Bill to Ledger
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
