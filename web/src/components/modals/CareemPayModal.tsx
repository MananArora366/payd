'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { formatMinorUnits } from '@/lib/ledger';
import { careemPayLink, careemPayTag } from '@/lib/mcp/careemPayLink';
import { CareemPayReceipt, parseCareemPayResponse, runCareemPaySettlement } from './careemPaySettle';
import {
  X,
  Zap,
  CheckCircle2,
  Copy,
  Check,
  Share2,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useDialog } from '@/lib/hooks/useDialog';

/**
 * Calls the careem_pay_settle_debt tool over Payd's JSON-RPC MCP endpoint.
 * Only called after the user pressed Settle, so confirmed_by_user is true.
 * Sends schema fields only (the tool rejects unknown arguments).
 */
async function settleViaCareemMcp(args: {
  recipientTag: string;
  recipientName?: string;
  amountMinor: number;
  note: string;
}): Promise<CareemPayReceipt> {
  const res = await fetch('/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'careem_pay_settle_debt',
        arguments: {
          recipientTag: args.recipientTag,
          ...(args.recipientName ? { recipientName: args.recipientName.slice(0, 100) } : {}),
          amountMinor: args.amountMinor,
          note: args.note.slice(0, 300),
          confirmed_by_user: true,
        },
      },
    }),
  });
  const data = await res.json().catch(() => null);
  return parseCareemPayResponse(res.ok, res.status, data, args.amountMinor);
}

/**
 * Receipts for transfers that Careem Pay charged but Payd could not record yet,
 * keyed by settlement. Module-level so closing/reopening the modal can never
 * lead to a second charge for the same settlement.
 */
const pendingCharges = new Map<string, CareemPayReceipt>();

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
  const { currentUser, users, groups, recordSettlement, validateSettlement } = usePayd();
  const [copiedLink, setCopiedLink] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CareemPayReceipt | null>(null);
  const inFlight = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const actualSenderId = senderId || currentUser.id;
  const actualRecipientId =
    recipientId || users.find((u) => u.id !== currentUser.id)?.id || '';
  const settlementKey = `${actualSenderId}|${actualRecipientId}|${amountMinor}|${groupId || ''}`;

  const clearTimers = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    closeTimer.current = null;
    copyTimer.current = null;
  };

  // Fresh state every time the modal opens (and cancel any pending auto-close).
  useEffect(() => {
    clearTimers();
    if (!isOpen) return;
    const pending = pendingCharges.get(settlementKey) || null;
    setCopiedLink(false);
    setIsProcessing(false);
    setIsSuccess(false);
    setError(null);
    setReceipt(pending);
    setWarning(
      pending
        ? `A Careem Pay transfer for this settlement already went through (ref ${pending.transaction_ref}) but wasn't saved. Tap "Retry saving" — you won't be charged again.`
        : null
    );
    inFlight.current = false;
  }, [isOpen, settlementKey]);

  // Cancel timers on unmount.
  useEffect(() => clearTimers, []);

  // Esc closes through handleClose (defined below, after the early return).
  const closeRef = useRef<() => void>(onClose);
  const { dialogProps } = useDialog(isOpen, () => closeRef.current());

  if (!isOpen) return null;

  const handleClose = () => {
    clearTimers();
    setIsSuccess(false);
    setError(null);
    onClose();
  };
  closeRef.current = handleClose;

  const senderUser = users.find((u) => u.id === actualSenderId);
  const recipientUser = users.find((u) => u.id === actualRecipientId);
  const groupName = groupId ? groups.find((g) => g.id === groupId)?.name : null;

  const formattedAmount = formatMinorUnits(amountMinor, 'AED');
  const careemTag = careemPayTag(recipientUser?.name);
  const paymentLink = careemPayLink(careemTag, amountMinor);

  const pendingReceipt = !isSuccess && receipt ? receipt : null;
  // Same check the ledger runs, against the same debt the UI showed. Done before charging.
  const preCheck = validateSettlement({
    sender_id: actualSenderId,
    recipient_id: actualRecipientId,
    amount_minor: amountMinor,
    group_id: groupId || null,
  });
  const canSettle = !isSuccess && (pendingReceipt ? true : preCheck.ok);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(paymentLink);
      setCopiedLink(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setError(`Couldn't copy automatically. Here's the link: ${paymentLink}`);
    }
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Salam ${recipientUser?.name || ''}! 👋\n\n` +
      `Here is the settlement for ${reference}:\n` +
      `💰 Amount: ${formattedAmount}\n` +
      `⚡ Pay via Careem Pay: ${paymentLink}\n\n` +
      `Tracked instantly on Payd Ledger 💚`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleConfirmSettlement = async () => {
    if (!canSettle || inFlight.current || isSuccess) return;
    inFlight.current = true;
    setIsProcessing(true);
    setError(null);
    try {
      const outcome = await runCareemPaySettlement(
        {
          validate: () =>
            validateSettlement({
              sender_id: actualSenderId,
              recipient_id: actualRecipientId,
              amount_minor: amountMinor,
              group_id: groupId || null,
            }),
          charge: () =>
            settleViaCareemMcp({
              recipientTag: careemTag,
              recipientName: recipientUser?.name,
              amountMinor,
              note: reference,
            }),
          record: (r) => {
            recordSettlement({
              group_id: groupId || null,
              sender_id: actualSenderId,
              recipient_id: actualRecipientId,
              amount_minor: amountMinor,
              currency: 'AED',
              method: 'Careem Pay',
              reference: `Careem Pay ${r.transaction_ref}: ${reference}`,
              // Validated before charging; the money has moved, so the ledger must reflect it.
              allowOverpayment: true,
            });
          },
        },
        pendingReceipt
      );

      if (outcome.kind === 'invalid' || outcome.kind === 'charge_failed') {
        setError(outcome.message);
      } else if (outcome.kind === 'charged_not_recorded') {
        pendingCharges.set(settlementKey, outcome.receipt);
        setReceipt(outcome.receipt);
        setWarning(outcome.message);
      } else {
        pendingCharges.delete(settlementKey);
        setReceipt(outcome.receipt);
        setWarning(null);
        setIsSuccess(true);
        clearTimers();
        closeTimer.current = setTimeout(handleClose, 2400);
      }
    } finally {
      inFlight.current = false;
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div {...dialogProps} aria-labelledby={undefined} aria-label="Settle with Careem Pay" className="focus:outline-none relative w-full max-w-md bg-[#18181b] border border-white/10 rounded-2xl shadow-2xl p-6 text-white font-body space-y-5">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="absolute top-5 right-5 p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Success Splash */}
        {isSuccess ? (
          <div className="py-10 text-center space-y-3 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="font-heading text-lg text-white">
              SETTLEMENT CONFIRMED!
            </h3>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto font-body">
              {formattedAmount} successfully settled between {senderUser?.name} and{' '}
              {recipientUser?.name} via Careem Pay. Ledger updated.
            </p>
            {receipt && (
              <p className="text-[10px] font-mono text-zinc-500">
                Ref {receipt.transaction_ref}
                {receipt.simulated ? ' · sandbox (no real money moved)' : ''}
              </p>
            )}
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
                    Careem pay
                  </h3>
                  <span className="text-[9px] font-heading px-2 py-0.5 rounded-full bg-[#00ea80]/20 text-[#00ea80] border border-[#00ea80]/30">
                    Instant UAE
                  </span>
                </div>
                <p className="text-xs text-zinc-400 font-body">
                  Instant settlement with Careem Pay
                </p>
              </div>
            </div>

            {/* Bill / Transfer Amount Card */}
            <div className="p-4 rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/20 space-y-2 text-center">
              <div className="text-[10px] font-heading text-zinc-400">
                Amount to settle
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

            {/* Recipient Careem Pay account */}
            <div className="p-4 bg-[#202025] rounded-2xl border border-white/8 flex items-center gap-3">
              <div className="w-10 h-10 shrink-0 rounded-xl bg-[#00ea80] flex items-center justify-center text-black font-semibold text-sm">
                C
              </div>
              <div className="min-w-0 font-body">
                <div className="text-xs font-bold text-white truncate">
                  Paying {recipientUser?.name || 'Friend'} on Careem Pay
                </div>
                <div className="text-[10px] text-zinc-400 font-mono mt-0.5 truncate">{careemTag}</div>
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

            {/* Confirm: settle via Careem MCP, then log in ledger */}
            <div className="space-y-2 pt-1 font-body">
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                  <span>{error}</span>
                </div>
              )}
              {warning && (
                <div role="status" className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                  <span>{warning}</span>
                </div>
              )}
              {!pendingReceipt && !preCheck.ok && amountMinor > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-zinc-500/10 border border-white/10 text-zinc-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                  <span>{preCheck.reason}</span>
                </div>
              )}
              <button
                type="button"
                disabled={isProcessing || !canSettle}
                onClick={handleConfirmSettlement}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{pendingReceipt ? 'Saving...' : 'Settling via Careem Pay...'}</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      {pendingReceipt
                        ? 'Retry saving to Payd'
                        : canSettle
                          ? `Settle ${formattedAmount} with Careem Pay`
                          : amountMinor > 0
                            ? "Can't settle this amount"
                            : 'Nothing to settle'}
                    </span>
                  </>
                )}
              </button>

              <p className="text-[10px] text-center text-zinc-400">
                {groupName ? `Recorded in ${groupName}. ` : ''}Your balances update as soon as Careem Pay confirms the transfer.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
