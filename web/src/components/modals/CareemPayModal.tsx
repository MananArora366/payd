'use client';

import React, { useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits } from '@/lib/ledger';
import {
  X,
  Zap,
  CheckCircle2,
  Copy,
  Check,
  Share2,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  ArrowRight,
} from 'lucide-react';

interface CareemPayModalProps {
  isOpen: boolean;
  onClose: () => void;
  senderId?: string;
  recipientId?: string;
  amountMinor?: number;
  groupId?: string | null;
  reference?: string;
}

export function CareemPayModal({
  isOpen,
  onClose,
  senderId,
  recipientId,
  amountMinor = 0,
  groupId = null,
  reference = 'Group settlement',
}: CareemPayModalProps) {
  const { currentUser, users, recordSettlement } = usePayd();
  const [copiedLink, setCopiedLink] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const actualSenderId = senderId || currentUser.id;
  const actualRecipientId =
    recipientId || users.find((u) => u.id !== currentUser.id)?.id || '';

  const senderUser = users.find((u) => u.id === actualSenderId);
  const recipientUser = users.find((u) => u.id === actualRecipientId);

  const formattedAmount = formatMinorUnits(amountMinor, 'AED');
  const careemTag = `@${(recipientUser?.name || 'payd').toLowerCase().replace(/\s+/g, '')}.careem`;
  const paymentLink = `https://careem.me/pay?tag=${encodeURIComponent(careemTag)}&amount=${(amountMinor / 100).toFixed(2)}&currency=AED`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(paymentLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Salam ${recipientUser?.name || ''}! 👋\n\n` +
      `Here is the settlement for ${reference}:\n` +
      `💰 Amount: ${formattedAmount}\n` +
      `⚡ Pay via Careem Pay / Aani: ${paymentLink}\n\n` +
      `Tracked instantly on Payd Ledger 💚`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleConfirmSettlement = () => {
    setIsProcessing(true);
    setTimeout(() => {
      try {
        recordSettlement({
          group_id: groupId || null,
          sender_id: actualSenderId,
          recipient_id: actualRecipientId,
          amount_minor: amountMinor,
          currency: 'AED',
          method: 'Careem Pay / Aani',
          reference: `Careem Pay: ${reference}`,
          allowOverpayment: false,
        });
        setIsProcessing(false);
        setIsSuccess(true);
        setTimeout(() => {
          setIsSuccess(false);
          onClose();
        }, 1600);
      } catch (err: any) {
        setIsProcessing(false);
        alert(err.message || 'Failed to record settlement');
      }
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#18181b] border border-white/10 rounded-3xl shadow-2xl p-6 text-white font-body space-y-5">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Success Splash */}
        {isSuccess ? (
          <div className="py-10 text-center space-y-3 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="font-heading text-lg text-white">
              SETTLEMENT CONFIRMED!
            </h3>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto font-body">
              {formattedAmount} successfully settled between {senderUser?.name} and{' '}
              {recipientUser?.name}. Ledger updated.
            </p>
          </div>
        ) : (
          <>
            {/* Header Badge */}
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-[#00ea80]/20 text-[#00ea80] flex items-center justify-center">
                <Zap className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-heading text-base text-white tracking-wide">
                    CAREEM PAY & AANI
                  </h3>
                  <span className="text-[9px] font-heading px-2 py-0.5 rounded-full bg-[#00ea80]/20 text-[#00ea80] border border-[#00ea80]/30">
                    INSTANT UAE
                  </span>
                </div>
                <p className="text-xs text-zinc-400 font-body">
                  Zero-fee UAE peer-to-peer instant bank settlement
                </p>
              </div>
            </div>

            {/* Bill / Transfer Amount Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-[#00ea80]/15 via-emerald-950/20 to-[#18181b] border border-emerald-500/20 space-y-2 text-center">
              <div className="text-[10px] font-heading text-zinc-400">
                AMOUNT TO SETTLE
              </div>
              <div className="text-3xl font-bold text-white tracking-tight">
                {formattedAmount}
              </div>
              <div className="text-xs text-zinc-400 flex items-center justify-center gap-2">
                <span className="font-medium text-white">{senderUser?.name || 'You'}</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#00ea80]" />
                <span className="font-medium text-white">{recipientUser?.name || 'Friend'}</span>
              </div>
            </div>

            {/* Simulated Dynamic Aani QR Code */}
            <div className="p-4 bg-[#202025] rounded-2xl border border-white/8 flex flex-col items-center space-y-3">
              <div className="relative p-3 bg-white rounded-xl shadow-inner flex items-center justify-center">
                {/* SVG QR Code Pattern */}
                <svg
                  className="w-36 h-36"
                  viewBox="0 0 120 120"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect width="120" height="120" fill="white" />
                  {/* Top-left position block */}
                  <rect x="10" y="10" width="30" height="30" rx="4" fill="#09090b" />
                  <rect x="15" y="15" width="20" height="20" rx="2" fill="white" />
                  <rect x="20" y="20" width="10" height="10" rx="1" fill="#00ea80" />

                  {/* Top-right position block */}
                  <rect x="80" y="10" width="30" height="30" rx="4" fill="#09090b" />
                  <rect x="85" y="15" width="20" height="20" rx="2" fill="white" />
                  <rect x="90" y="20" width="10" height="10" rx="1" fill="#00ea80" />

                  {/* Bottom-left position block */}
                  <rect x="10" y="80" width="30" height="30" rx="4" fill="#09090b" />
                  <rect x="15" y="85" width="20" height="20" rx="2" fill="white" />
                  <rect x="20" y="90" width="10" height="10" rx="1" fill="#00ea80" />

                  {/* Dynamic Pattern Pixels */}
                  <rect x="48" y="12" width="6" height="6" fill="#09090b" />
                  <rect x="62" y="12" width="6" height="6" fill="#09090b" />
                  <rect x="54" y="22" width="10" height="6" fill="#09090b" />
                  <rect x="48" y="32" width="6" height="10" fill="#09090b" />
                  <rect x="62" y="36" width="8" height="6" fill="#09090b" />

                  <rect x="14" y="48" width="6" height="10" fill="#09090b" />
                  <rect x="28" y="52" width="8" height="6" fill="#09090b" />
                  <rect x="44" y="48" width="10" height="10" rx="2" fill="#00ea80" />
                  <rect x="64" y="48" width="12" height="6" fill="#09090b" />
                  <rect x="84" y="48" width="8" height="12" fill="#09090b" />
                  <rect x="100" y="54" width="6" height="6" fill="#09090b" />

                  <rect x="12" y="66" width="12" height="6" fill="#09090b" />
                  <rect x="32" y="66" width="6" height="6" fill="#09090b" />
                  <rect x="48" y="64" width="8" height="12" fill="#09090b" />
                  <rect x="64" y="62" width="8" height="8" fill="#00ea80" />
                  <rect x="80" y="68" width="12" height="6" fill="#09090b" />
                  <rect x="100" y="66" width="8" height="10" fill="#09090b" />

                  <rect x="48" y="82" width="6" height="10" fill="#09090b" />
                  <rect x="62" y="86" width="12" height="6" fill="#09090b" />
                  <rect x="82" y="82" width="8" height="6" fill="#09090b" />
                  <rect x="96" y="86" width="12" height="10" fill="#09090b" />

                  <rect x="48" y="100" width="12" height="8" fill="#09090b" />
                  <rect x="70" y="98" width="8" height="10" fill="#09090b" />
                  <rect x="86" y="100" width="10" height="8" fill="#00ea80" />
                </svg>

                {/* Center Badge */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-8 h-8 rounded-lg bg-[#00ea80] border-2 border-white flex items-center justify-center text-black font-black text-xs shadow-md">
                    C
                  </div>
                </div>
              </div>

              <div className="text-center font-body">
                <div className="text-xs font-bold text-white">
                  Scan to Pay with Careem or UAE Bank
                </div>
                <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                  Aani ID: {careemTag}
                </div>
              </div>
            </div>

            {/* Quick Actions Row */}
            <div className="grid grid-cols-2 gap-2 text-xs font-body">
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="py-2.5 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                className="py-2.5 px-3 rounded-xl bg-[#27272a] hover:bg-[#3f3f46] text-zinc-200 font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Link Copied!' : 'Copy Pay Link'}</span>
              </button>
            </div>

            {/* Confirm & Log Settlement in Ledger */}
            <div className="space-y-2 pt-1 font-body">
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmSettlement}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-heading text-xs tracking-wider shadow-lg shadow-emerald-500/25 transition flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
              >
                {isProcessing ? (
                  <span>Logging Settlement to Ledger...</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Confirm Settlement (Instant Ledger Update)</span>
                  </>
                )}
              </button>

              <p className="text-[10px] text-center text-zinc-400">
                In compliance with Invariant 4: Updates bilateral ledger and reduces liability without skewing expense budgets.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
