'use client';

import React, { useState, useRef } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import {
  ReceiptScanResult,
  SAMPLE_UAE_RECEIPTS,
  calculateItemizedShares,
} from '@/lib/ai/receipt-scan';
import { formatMinorUnits, splitEqual } from '@/lib/ledger';
import {
  Camera,
  Upload,
  Sparkles,
  X,
  Check,
  Receipt,
  ShieldCheck,
  Users,
  AlertCircle,
  FileText,
  Clock,
  Layers,
} from 'lucide-react';

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReceiptScannerModal({ isOpen, onClose }: ReceiptScannerModalProps) {
  const { currentUser, users, groups, categories, addTransaction } = usePayd();

  const [isScanning, setIsScanning] = useState(false);
  const [scannedReceipt, setScannedReceipt] = useState<ReceiptScanResult | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Split Configuration State
  const [splitMode, setSplitMode] = useState<'equal' | 'itemized'>('equal');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(groups[0]?.id || null);
  const [payerId, setPayerId] = useState(currentUser.id);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    users.slice(0, 3).map((u) => u.id)
  );

  // Itemized assignments: itemIndex -> array of userIds
  const [itemAssignments, setItemAssignments] = useState<Record<number, string[]>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsScanning(true);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setImagePreview(base64);

      try {
        const res = await fetch('/api/ai/receipt-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64,
            mimeType: file.type || 'image/jpeg',
          }),
        });

        const data = await res.json();
        if (data.success && data.receipt) {
          setScannedReceipt(data.receipt);
          // Initialize item assignments equally across selected users
          const initialAssign: Record<number, string[]> = {};
          data.receipt.line_items.forEach((_: any, idx: number) => {
            initialAssign[idx] = [...selectedUserIds];
          });
          setItemAssignments(initialAssign);
        } else {
          throw new Error(data.error || 'Failed to scan receipt');
        }
      } catch (err: any) {
        setError(err.message || 'Error processing receipt');
      } finally {
        setIsScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLoadSample = async (sampleKey: 'al_safadi' | 'carrefour' | 'zaatar') => {
    setError(null);
    setIsScanning(true);
    setImagePreview(null);

    try {
      const res = await fetch('/api/ai/receipt-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample: sampleKey }),
      });

      const data = await res.json();
      if (data.success && data.receipt) {
        setScannedReceipt(data.receipt);
        const initialAssign: Record<number, string[]> = {};
        data.receipt.line_items.forEach((_: any, idx: number) => {
          initialAssign[idx] = [...selectedUserIds];
        });
        setItemAssignments(initialAssign);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading sample');
    } finally {
      setIsScanning(false);
    }
  };

  const toggleUserSelection = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      if (selectedUserIds.length === 1) return;
      const updated = selectedUserIds.filter((id) => id !== userId);
      setSelectedUserIds(updated);
      // Clean item assignments
      const newAssignments: Record<number, string[]> = {};
      Object.entries(itemAssignments).forEach(([idx, uids]) => {
        newAssignments[Number(idx)] = uids.filter((id) => id !== userId);
      });
      setItemAssignments(newAssignments);
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const toggleItemUser = (itemIndex: number, userId: string) => {
    const current = itemAssignments[itemIndex] || [];
    if (current.includes(userId)) {
      if (current.length === 1) return; // Keep at least one person assigned
      setItemAssignments({
        ...itemAssignments,
        [itemIndex]: current.filter((id) => id !== userId),
      });
    } else {
      setItemAssignments({
        ...itemAssignments,
        [itemIndex]: [...current, userId],
      });
    }
  };

  // Compute final shares based on mode
  const computedShares: Record<string, number> = React.useMemo(() => {
    if (!scannedReceipt) return {};
    if (splitMode === 'equal') {
      return splitEqual(scannedReceipt.total_minor, selectedUserIds);
    } else {
      return calculateItemizedShares(
        scannedReceipt.total_minor,
        scannedReceipt.line_items,
        itemAssignments,
        selectedUserIds
      );
    }
  }, [scannedReceipt, splitMode, selectedUserIds, itemAssignments]);

  const handleSaveToLedger = () => {
    if (!scannedReceipt) return;

    try {
      const splits = Object.entries(computedShares).map(([userId, shareMinor]) => ({
        user_id: userId,
        share_minor: shareMinor,
      }));

      // Find or assign matching category
      const matchedCat =
        categories.find(
          (c) => c.name.toLowerCase() === (scannedReceipt.category || '').toLowerCase()
        ) || categories[0];

      addTransaction({
        type: 'expense',
        title: scannedReceipt.merchant_name || 'Receipt Expense',
        amount_minor: scannedReceipt.total_minor,
        currency: 'AED',
        category_id: matchedCat?.id || null,
        payer_id: payerId,
        group_id: selectedGroup,
        payment_method: 'Card',
        notes: `Payd Lens OCR • TRN: ${scannedReceipt.trn || 'N/A'} • 5% VAT: ${formatMinorUnits(scannedReceipt.vat_minor || 0, 'AED')}`,
        splits,
      });

      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to persist transaction');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-slate-900 dark:text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-lg shadow-emerald-500/20">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Payd Lens</h2>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  UAE 5% VAT Compliant
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                AI Vision receipt scanner with deterministic itemized ledger splits
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* State 1: Capture or Preset Selection */}
        {!scannedReceipt && !isScanning && (
          <div className="mt-6 space-y-6">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500/50 rounded-3xl p-8 text-center cursor-pointer transition hover:bg-emerald-500/5 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-105 transition">
                <Upload className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-sm sm:text-base">Take a Photo or Upload Receipt</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                Snap any UAE restaurant or grocery bill. Gemini Vision extracts the TRN, line items, and 5% VAT in real-time.
              </p>
            </div>

            {/* Quick Demo UAE Presets for Hackathon Demos */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Instant Demo UAE Receipts (1-Click)
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => handleLoadSample('al_safadi')}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-emerald-500/50 hover:bg-emerald-500/5 text-left transition group"
                >
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-500 transition">
                    Al Safadi Restaurant
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">AED 260.00 • 6 items</div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-2 inline-block font-semibold">
                    TRN: 100345678900003
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLoadSample('carrefour')}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-emerald-500/50 hover:bg-emerald-500/5 text-left transition group"
                >
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-500 transition">
                    Carrefour Marina
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">AED 100.00 • Groceries</div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-2 inline-block font-semibold">
                    5% VAT Itemized
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLoadSample('zaatar')}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-emerald-500/50 hover:bg-emerald-500/5 text-left transition group"
                >
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-500 transition">
                    Careem DineOut
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">AED 124.00 • Zaatar w Zeit</div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-2 inline-block font-semibold">
                    Super App Split
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* State 2: Scanning Loading Animation */}
        {isScanning && (
          <div className="mt-8 py-12 text-center space-y-4">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 rounded-3xl bg-emerald-500/20 animate-ping" />
              <div className="relative w-20 h-20 rounded-3xl bg-emerald-500 flex items-center justify-center text-white shadow-xl shadow-emerald-500/30">
                <Receipt className="w-10 h-10 animate-pulse" />
              </div>
            </div>
            <div>
              <h3 className="font-bold text-base">Gemini Vision Scanning...</h3>
              <p className="text-xs text-slate-400 mt-1">
                Reading line items, merchant TRN, and verifying UAE 5% VAT calculations.
              </p>
            </div>
          </div>
        )}

        {/* State 3: Scanned Receipt Confirmation & Itemized Splitter */}
        {scannedReceipt && !isScanning && (
          <div className="mt-6 space-y-6">
            {/* Merchant & Tax Card */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                    {scannedReceipt.merchant_name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {scannedReceipt.trn && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        TRN: {scannedReceipt.trn}
                      </span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                      FTA 5% VAT Verified
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {formatMinorUnits(scannedReceipt.total_minor, 'AED')}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Subtotal: {formatMinorUnits(scannedReceipt.subtotal_minor, 'AED')} • VAT: {formatMinorUnits(scannedReceipt.vat_minor, 'AED')}
                  </div>
                </div>
              </div>

              {/* Group & Payer Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-200 dark:border-slate-700/60 text-xs">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Payer (Who paid)</label>
                  <select
                    value={payerId}
                    onChange={(e) => setPayerId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} {u.id === currentUser.id ? '(You)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Group Ledger</label>
                  <select
                    value={selectedGroup || ''}
                    onChange={(e) => setSelectedGroup(e.target.value || null)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Personal (No group)</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Split Mode Selector */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Split Strategy
              </span>
              <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
                <button
                  type="button"
                  onClick={() => setSplitMode('equal')}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                    splitMode === 'equal'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  Split Equally
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode('itemized')}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                    splitMode === 'itemized'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  Itemized (&quot;Who Had What?&quot;)
                </button>
              </div>
            </div>

            {/* Participants Selector */}
            <div>
              <span className="text-xs text-slate-400 block mb-2 font-medium">
                Include Participants ({selectedUserIds.length})
              </span>
              <div className="flex flex-wrap gap-2">
                {users.map((u) => {
                  const isSelected = selectedUserIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleUserSelection(u.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                        isSelected
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-400'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500'
                      }`}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-current" />
                      <span>{u.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Line Items Table (For Itemized Mode) */}
            {splitMode === 'itemized' && scannedReceipt.line_items.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Itemized Line Items (Tap member to assign)
                </span>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {scannedReceipt.line_items.map((item, idx) => {
                    const assigned = itemAssignments[idx] || [];
                    return (
                      <div
                        key={idx}
                        className="p-3 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex-1">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {item.quantity > 1 ? `${item.quantity}x ` : ''}
                            {item.name}
                          </span>
                          <span className="text-slate-400 ml-2">
                            {formatMinorUnits(item.price_minor, 'AED')}
                          </span>
                        </div>

                        {/* Assignee badges */}
                        <div className="flex flex-wrap gap-1">
                          {selectedUserIds.map((uid) => {
                            const u = users.find((usr) => usr.id === uid);
                            if (!u) return null;
                            const isAssigned = assigned.includes(uid);
                            return (
                              <button
                                key={uid}
                                type="button"
                                onClick={() => toggleItemUser(idx, uid)}
                                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition ${
                                  isAssigned
                                    ? 'bg-emerald-500 text-white font-semibold'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                {u.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Final Shares Ledger Summary */}
            <div className="p-4 rounded-2xl bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> Deterministic Ledger Shares
                </span>
                <span>Sum: {formatMinorUnits(scannedReceipt.total_minor, 'AED')}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {Object.entries(computedShares).map(([uid, share]) => {
                  const u = users.find((usr) => usr.id === uid);
                  return (
                    <div
                      key={uid}
                      className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800"
                    >
                      <div className="text-[11px] text-slate-400">{u?.name || 'User'}</div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        {formatMinorUnits(share, 'AED')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setScannedReceipt(null)}
                className="flex-1 py-3 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-200 dark:hover:bg-slate-750 transition"
              >
                Scan Another
              </button>

              <button
                type="button"
                onClick={handleSaveToLedger}
                className="flex-[2] py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" /> Save Receipt to Ledger
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
