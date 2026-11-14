'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits, splitEqual } from '@/lib/ledger';
import { useVisibleGroups } from '@/components/groups/useVisibleGroups';
import {
  computeRouletteWeights,
  parseAmountInput,
  pickWeightedIndex,
  ROULETTE_FILS_PER_EXTRA_SLICE,
  ROULETTE_MAX_EXTRA_SLICES,
} from '@/components/groups/groupLogic';
import { X, Coffee, Scale, ShieldCheck, RotateCw, Trophy, Users, Dices } from 'lucide-react';
import { useDialog } from '@/lib/hooks/useDialog';

interface FairPayerRouletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGroupId?: string | null;
}

const SLICE_COLORS = [
  '#10b981', // emerald-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#8b5cf6', // silver-500
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
  const { users, addTransaction, getGroupBalances, getGroupMembers } = usePayd();
  const groups = useVisibleGroups();

  const pickInitialGroupId = () =>
    (defaultGroupId && groups.some((g) => g.id === defaultGroupId) ? defaultGroupId : groups[0]?.id) || null;

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(pickInitialGroupId);
  const [amountStr, setAmountStr] = useState('45.00');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(() => {
    const gid = pickInitialGroupId();
    return gid ? getGroupMembers(gid).map((u) => u.id) : [];
  });
  const [mode, setMode] = useState<'debt_weighted' | 'equal'>('debt_weighted');
  const [error, setError] = useState<string | null>(null);

  const [isSpinning, setIsSpinning] = useState(false);
  const [currentRotation, setCurrentRotation] = useState(0);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSpinTimer = () => {
    if (spinTimerRef.current) {
      clearTimeout(spinTimerRef.current);
      spinTimerRef.current = null;
    }
  };

  const resetRound = () => {
    clearSpinTimer();
    setIsSpinning(false);
    setWinnerId(null);
    setShowCelebration(false);
    setError(null);
  };

  const selectGroup = (groupId: string | null) => {
    setSelectedGroupId(groupId);
    setSelectedUserIds(groupId ? getGroupMembers(groupId).map((u) => u.id) : []);
    resetRound();
  };

  // Reset everything each time the modal opens
  useEffect(() => {
    if (!isOpen) {
      clearSpinTimer();
      return;
    }
    selectGroup(pickInitialGroupId());
    setAmountStr('45.00');
    setMode('debt_weighted');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultGroupId]);

  useEffect(() => () => clearSpinTimer(), []);

  // Only members of the selected group can be in the wheel
  const groupMembers = selectedGroupId ? getGroupMembers(selectedGroupId) : [];
  const groupBalances = selectedGroupId ? getGroupBalances(selectedGroupId) : {};
  const participants = groupMembers.filter((u) => selectedUserIds.includes(u.id));
  const participantKey = participants.map((p) => p.id).join(',');
  const balanceKey = participants.map((p) => groupBalances[p.id] ?? 0).join(',');

  // Compute slice weights (debt-weighted uses this group's balances only)
  const sliceWeights = React.useMemo(() => {
    const weights = computeRouletteWeights(
      participants.map((p) => p.id),
      groupBalances,
      mode
    );
    return weights.map((w, i) => ({ user: participants[i], weight: w.weight }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantKey, balanceKey, mode]);

  const totalWeight = sliceWeights.reduce((acc, s) => acc + s.weight, 0);
  const amountCheck = parseAmountInput(amountStr);

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

  const { dialogProps, titleId } = useDialog(isOpen, onClose);

  if (!isOpen) return null;

  const toggleUser = (userId: string) => {
    if (isSpinning) return;
    if (selectedUserIds.includes(userId)) {
      if (participants.length <= 2) {
        setError('Keep at least 2 people in the wheel.');
        return;
      }
      setSelectedUserIds(selectedUserIds.filter((id) => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
    resetRound();
  };

  const handleSpin = () => {
    if (isSpinning || sliceWeights.length < 2) return;
    if (!amountCheck.ok) {
      setError(amountCheck.error);
      return;
    }

    setError(null);
    setIsSpinning(true);
    setWinnerId(null);
    setShowCelebration(false);

    // Pick random target index weighted by sliceWeights
    const selectedIndex = Math.max(0, pickWeightedIndex(sliceWeights.map((s) => s.weight), Math.random()));

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

    const winner = sliceWeights[selectedIndex].user.id;
    clearSpinTimer();
    spinTimerRef.current = setTimeout(() => {
      spinTimerRef.current = null;
      setIsSpinning(false);
      setWinnerId(winner);
      setShowCelebration(true);
    }, 4000);
  };

  const handleRecordTransaction = () => {
    if (!winnerId || !selectedGroupId) return;
    setError(null);

    const parsed = parseAmountInput(amountStr);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const memberIds = new Set(groupMembers.map((m) => m.id));
    const splitIds = participants.map((p) => p.id).filter((id) => memberIds.has(id));
    if (splitIds.length < 2 || !memberIds.has(winnerId)) {
      setError('Pick at least 2 group members and spin again.');
      return;
    }

    const winner = users.find((u) => u.id === winnerId);

    try {
      const splitObj = splitEqual(parsed.value, splitIds);
      const splits = Object.entries(splitObj).map(([uid, share]) => ({
        user_id: uid,
        share_minor: share,
      }));

      addTransaction({
        type: 'expense',
        title: `Coffee & Treats Round (Covered by ${winner?.name?.split(' ')[0] || 'Winner'})`,
        amount_minor: parsed.value,
        currency: 'AED',
        category_id: 'c0000001-0000-0000-0000-000000000001', // Food and dining
        payer_id: winnerId,
        group_id: selectedGroupId,
        payment_method: 'Card / Apple Pay',
        notes: `Fair Payer Roulette round • ${mode === 'debt_weighted' ? 'Debt-Weighted Fairness' : 'Pure Random'}`,
        splits,
      });
    } catch {
      setError("We couldn't record this round. Check the amount and try again.");
      return;
    }

    onClose();
  };

  const winnerUser = winnerId ? users.find((u) => u.id === winnerId) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div {...dialogProps} className="focus:outline-none w-full max-w-md bg-[#18181b] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto text-white font-body">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-white/8">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <h3 id={titleId} className="font-heading text-base text-white flex items-center gap-1.5">
                Fair payer roulette
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-heading border border-amber-500/30">
                  Mini-game
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400 font-body">Who covers coffee or lunch today?</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-full text-zinc-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Group Picker */}
        {groups.length === 0 ? (
          <div className="p-3 text-xs text-zinc-400 bg-[#09090b] border border-white/10 rounded-xl text-center">
            Join or create a group to play Fair Payer Roulette.
          </div>
        ) : (
          <div>
            <label htmlFor="roulette-group" className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Group
            </label>
            <select
              id="roulette-group"
              value={selectedGroupId || ''}
              disabled={isSpinning}
              onChange={(e) => selectGroup(e.target.value || null)}
              className="w-full mt-1 px-3 py-2 text-sm bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-amber-500 text-white"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <div role="alert" className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl">
            {error}
          </div>
        )}

        {/* Amount & Mode Selector */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Bill Amount</span>
            <div className="flex items-center gap-1">
              {['25.00', '45.00', '80.00', '150.00'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setAmountStr(preset);
                    setError(null);
                  }}
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
              type="text"
              inputMode="decimal"
              aria-label="Bill amount in AED"
              value={amountStr}
              onChange={(e) => {
                setAmountStr(e.target.value);
                setError(null);
              }}
              className="w-full px-4 py-2 text-sm bg-[#09090b] border border-white/10 rounded-2xl text-white font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 pr-14 text-center"
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
              <Scale className="w-3.5 h-3.5" />
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
              ⚖️ Members who owe this group get +1 slice per AED {ROULETTE_FILS_PER_EXTRA_SLICE / 100} owed (up to +{ROULETTE_MAX_EXTRA_SLICES}). Everyone else gets 1 slice.
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
            className="transition-transform duration-[4000ms]"
            style={{
              transform: `rotate(${currentRotation}deg)`,
              transitionTimingFunction: 'cubic-bezier(0.15, 0.9, 0.2, 1)',
            }}
          >
            <canvas ref={canvasRef} width={260} height={260} className="rounded-full shadow-2xl" />
          </div>

          {/* Winner Display Badge */}
          {winnerUser && showCelebration && (
            <div className="mt-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-center animate-in zoom-in-95 duration-200 w-full">
              <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                <Trophy className="w-4 h-4" /> Winner Covers The Bill!
              </div>
              <div className="text-lg font-semibold text-slate-900 dark:text-white mt-0.5">
                {winnerUser.name}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pays {amountCheck.ok ? formatMinorUnits(amountCheck.value, 'AED') : 'the bill'} • Split equally among {participants.length} friends
              </p>
            </div>
          )}
        </div>

        {/* Participants Selector */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>In the Wheel ({participants.length})</span>
            <span className="text-[10px]">Tap to include/exclude</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {groupMembers.length < 2 && (
              <span className="text-[11px] text-zinc-500">
                This group needs at least 2 members to spin.
              </span>
            )}
            {groupMembers.map((u) => {
              const inWheel = selectedUserIds.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleUser(u.id)}
                  aria-pressed={inWheel}
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
              className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm flex items-center justify-center gap-2 transition active:scale-98 disabled:opacity-50"
            >
              <RotateCw className={`w-4 h-4 ${isSpinning ? 'animate-spin' : ''}`} />
              <span>{isSpinning ? 'Spinning...' : 'Spin The Wheel!'}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSpin}
                disabled={isSpinning}
                className="py-3 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 transition"
              >
                Re-spin
              </button>
              <button
                type="button"
                onClick={handleRecordTransaction}
                className="flex-1 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition"
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
