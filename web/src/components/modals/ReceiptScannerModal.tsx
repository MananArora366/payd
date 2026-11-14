'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  X,
  Check,
  Receipt,
  ScanLine,
  ShieldCheck,
  AlertCircle,
  RotateCcw,
  RotateCw,
  Edit3,
  Plus,
  Trash2,
  Share2,
  Copy,
} from 'lucide-react';
import { usePayd } from '@/lib/store/PaydContext';
import {
  ReceiptScanResult,
  calculateItemizedShares,
  ReceiptItem,
} from '@/lib/ai/receipt-scan';
import { splitEqual, formatMinorUnits, parseMajorToMinor } from '@/lib/ledger';
import { LensCameraViewer } from './LensCameraViewer';
import { useDialog } from '@/lib/hooks/useDialog';

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Turns ledger/internal errors into plain language for the user. */
function friendlySaveError(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  if (/invariant|split sum|participants/i.test(msg)) {
    return "The split doesn't add up to the receipt total. Check the items and participants, then try again.";
  }
  return "Couldn't save this receipt. Please check the amounts and try again.";
}

function blankManualReceipt(): ReceiptScanResult {
  return {
    merchant_name: '',
    date: new Date().toISOString().split('T')[0],
    currency: 'AED',
    trn: null,
    subtotal_minor: 0,
    vat_minor: 0,
    charges_minor: 0,
    total_minor: 0,
    category: 'Food and dining',
    line_items: [],
    confidence: 1,
    warnings: [],
    notes: 'Entered manually.',
    engine: 'manual',
  };
}

export function ReceiptScannerModal({ isOpen, onClose }: ReceiptScannerModalProps) {
  const { currentUser, users, groups, categories, addTransaction, getGroupMembers, aiEnabled } = usePayd();

  const [isScanning, setIsScanning] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('image/jpeg');
  const [scanFailed, setScanFailed] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReadyToScan, setIsReadyToScan] = useState(false);
  const [scannedReceipt, setScannedReceipt] = useState<ReceiptScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editing state for scanned receipt
  const [isEditingReceipt, setIsEditingReceipt] = useState(false);

  // Split state
  const [payerId, setPayerId] = useState<string>(currentUser.id);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(
    groups.length > 0 ? groups[0].id : null
  );
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    users.map((u) => u.id)
  );
  const [splitMode, setSplitMode] = useState<'equal' | 'itemized'>('itemized');
  const [itemAssignments, setItemAssignments] = useState<Record<number, string[]>>({});
  const [copiedBreakdown, setCopiedBreakdown] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Group membership is enforced: a group offers only its members; "Personal" offers everyone.
  const participantPool = React.useMemo(
    () => (selectedGroup ? getGroupMembers(selectedGroup) : users),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedGroup, users, groups]
  );

  const defaultGroupId = () =>
    groups.find((g) => getGroupMembers(g.id).some((m) => m.id === currentUser.id))?.id ??
    groups[0]?.id ??
    null;

  const applyGroup = (groupId: string | null) => {
    const pool = groupId ? getGroupMembers(groupId) : users;
    const ids = pool.map((u) => u.id);
    setSelectedGroup(groupId);
    setSelectedUserIds(ids);
    setPayerId(ids.includes(currentUser.id) ? currentUser.id : ids[0] ?? currentUser.id);
    setItemAssignments((prev) => {
      const next: Record<number, string[]> = {};
      Object.keys(prev).forEach((k) => {
        next[Number(k)] = [...ids];
      });
      return next;
    });
  };

  // Fresh state every time the modal opens (prevents re-saving a receipt that was already saved).
  useEffect(() => {
    if (!isOpen) return;
    setIsScanning(false);
    setImagePreview(null);
    setImageMime('image/jpeg');
    setIsReadyToScan(false);
    setScannedReceipt(null);
    setError(null);
    setScanFailed(false);
    setIsSaved(false);
    setIsSaving(false);
    setIsEditingReceipt(false);
    setSplitMode('itemized');
    setItemAssignments({});
    setCopiedBreakdown(false);
    applyGroup(defaultGroupId());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const closeRef = useRef<() => void>(onClose);
  const { dialogProps, titleId } = useDialog(isOpen, () => closeRef.current());

  const handleClose = () => {
    setScannedReceipt(null);
    setImagePreview(null);
    setIsReadyToScan(false);
    setIsSaving(false);
    onClose();
  };
  closeRef.current = handleClose;

  const startManualEntry = () => {
    setError(null);
    setScanFailed(false);
    setIsReadyToScan(false);
    setIsSaved(false);
    setScannedReceipt(blankManualReceipt());
    setItemAssignments({});
    setIsEditingReceipt(true);
  };

  /** Keeps VAT and service charges when items change: total = items + VAT + charges. */
  const withItems = (receipt: ReceiptScanResult, items: ReceiptItem[]): ReceiptScanResult => {
    const itemsSum = items.reduce((acc, it) => acc + it.price_minor, 0);
    if (itemsSum <= 0) return { ...receipt, line_items: items };
    return {
      ...receipt,
      line_items: items,
      subtotal_minor: itemsSum,
      total_minor: itemsSum + (receipt.vat_minor || 0) + (receipt.charges_minor || 0),
      warnings: [],
    };
  };

  // Rotate base64 image via HTML5 Canvas
  const handleRotateImage = (degrees: number) => {
    if (!imagePreview) return;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (Math.abs(degrees) === 90 || Math.abs(degrees) === 270) {
        canvas.width = img.height;
        canvas.height = img.width;
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      const rotatedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      setImagePreview(rotatedDataUrl);
      setImageMime('image/jpeg');
    };
    img.src = imagePreview;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so choosing the same file again re-triggers onChange
    e.target.value = '';
    if (!file) return;

    setError(null);
    setScanFailed(false);
    if (file.type && !file.type.startsWith('image/')) {
      setError('Please choose a photo of the receipt (JPEG, PNG, WebP or HEIC).');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('That photo is too large. Please use one under 8 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
      setImageMime(file.type || 'image/jpeg');
      setIsReadyToScan(true);
      setScannedReceipt(null);
      setIsSaved(false);
    };
    reader.onerror = () => setError("Couldn't read that file. Please try another photo.");
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = (dataUrl: string) => {
    setError(null);
    setScanFailed(false);
    setImagePreview(dataUrl);
    setImageMime('image/jpeg');
    setIsReadyToScan(true);
    setScannedReceipt(null);
    setIsSaved(false);
  };

  const executeReceiptScan = async () => {
    if (!imagePreview) return;

    setError(null);
    setScanFailed(false);
    setIsScanning(true);
    setIsReadyToScan(false);

    try {
      const res = await fetch('/api/ai/receipt-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imagePreview,
          mimeType: imageMime,
          aiEnabled,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.receipt) {
        setIsSaved(false);
        setScannedReceipt({ ...data.receipt, currency: 'AED' });
        const initialAssign: Record<number, string[]> = {};
        data.receipt.line_items.forEach((_: any, idx: number) => {
          initialAssign[idx] = [...selectedUserIds];
        });
        setItemAssignments(initialAssign);
      } else {
        throw new Error(
          typeof data.error === 'string' && data.error
            ? data.error
            : "We couldn't read this receipt. Try a clearer photo or enter it manually."
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setError(
        msg && !/fetch|network|json/i.test(msg)
          ? msg
          : "We couldn't reach Payd Lens. Check your connection, or enter the receipt manually."
      );
      setScanFailed(true);
      setIsReadyToScan(true);
    } finally {
      setIsScanning(false);
    }
  };

  const toggleUserSelection = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      if (selectedUserIds.length === 1) return;
      const updated = selectedUserIds.filter((id) => id !== userId);
      setSelectedUserIds(updated);
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
      if (current.length === 1) return;
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

  // Editing handlers for line items
  const handleUpdateItemName = (idx: number, newName: string) => {
    if (!scannedReceipt) return;
    const updated = [...scannedReceipt.line_items];
    updated[idx] = { ...updated[idx], name: newName };
    setScannedReceipt({ ...scannedReceipt, line_items: updated });
  };

  const handleUpdateItemPrice = (idx: number, aedStr: string) => {
    if (!scannedReceipt) return;
    const minor = Math.max(0, parseMajorToMinor(aedStr, 'AED'));
    const updated = [...scannedReceipt.line_items];
    updated[idx] = { ...updated[idx], price_minor: minor };
    setScannedReceipt(withItems(scannedReceipt, updated));
  };

  const handleDeleteItem = (idx: number) => {
    if (!scannedReceipt) return;
    const updated = scannedReceipt.line_items.filter((_, i) => i !== idx);
    setScannedReceipt(withItems(scannedReceipt, updated));

    // Shift assignments of the items after the deleted one down by one.
    const newAssignments: Record<number, string[]> = {};
    updated.forEach((_, i) => {
      const from = i < idx ? i : i + 1;
      newAssignments[i] = itemAssignments[from] || [...selectedUserIds];
    });
    setItemAssignments(newAssignments);
  };

  const handleAddItem = () => {
    if (!scannedReceipt) return;
    const newItem: ReceiptItem = {
      name: 'Custom Item',
      quantity: 1,
      price_minor: 1000, // 10.00 AED
    };
    const updated = [...scannedReceipt.line_items, newItem];
    const newIdx = updated.length - 1;
    setScannedReceipt(withItems(scannedReceipt, updated));
    setItemAssignments({
      ...itemAssignments,
      [newIdx]: [...selectedUserIds],
    });
  };

  // Compute final shares based on mode
  const computedShares: Record<string, number> = React.useMemo(() => {
    if (!scannedReceipt || scannedReceipt.total_minor <= 0 || selectedUserIds.length === 0) return {};
    try {
      if (splitMode === 'equal') {
        return splitEqual(scannedReceipt.total_minor, selectedUserIds);
      }
      // Only count assignments to people who are still participants.
      const assignments: Record<number, string[]> = {};
      Object.entries(itemAssignments).forEach(([k, uids]) => {
        assignments[Number(k)] = uids.filter((u) => selectedUserIds.includes(u));
      });
      return calculateItemizedShares(
        scannedReceipt.total_minor,
        scannedReceipt.line_items,
        assignments,
        selectedUserIds
      );
    } catch {
      return {};
    }
  }, [scannedReceipt, splitMode, selectedUserIds, itemAssignments]);

  const canSave =
    !!scannedReceipt &&
    !isSaved &&
    !isSaving &&
    scannedReceipt.total_minor > 0 &&
    Object.keys(computedShares).length > 0;

  const getReceiptBreakdownText = () => {
    if (!scannedReceipt) return '';
    const payerName = users.find((u) => u.id === payerId)?.name || 'Payer';
    let text = `🧾 *${scannedReceipt.merchant_name}* (${formatMinorUnits(scannedReceipt.total_minor, 'AED')})\n`;
    if (scannedReceipt.trn) text += `TRN: ${scannedReceipt.trn}\n`;
    text += `Paid by: ${payerName}\n\n*Split Breakdown:*\n`;
    Object.entries(computedShares).forEach(([uid, shareMinor]) => {
      const u = users.find((user) => user.id === uid);
      text += `• ${u?.name || 'Member'}: ${formatMinorUnits(shareMinor, 'AED')}\n`;
    });
    text += `\nTracked with Payd Lens • Settle via Careem Pay! 💚`;
    return text;
  };

  const handleShareReceiptWhatsApp = () => {
    const text = encodeURIComponent(getReceiptBreakdownText());
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleCopyReceiptBreakdown = () => {
    navigator.clipboard.writeText(getReceiptBreakdownText());
    setCopiedBreakdown(true);
    setTimeout(() => setCopiedBreakdown(false), 2000);
  };

  const handleSaveToLedger = () => {
    if (!scannedReceipt || !canSave) return;
    setIsSaving(true);
    setError(null);

    try {
      const splits = Object.entries(computedShares).map(([userId, shareMinor]) => ({
        user_id: userId,
        share_minor: shareMinor,
      }));

      const matchedCat =
        categories.find(
          (c) => c.name.toLowerCase() === (scannedReceipt.category || '').toLowerCase()
        ) || categories[0];

      addTransaction({
        type: 'expense',
        title: scannedReceipt.merchant_name.trim() || 'Receipt Expense',
        amount_minor: scannedReceipt.total_minor,
        currency: 'AED',
        category_id: matchedCat?.id || null,
        payer_id: payerId,
        group_id: selectedGroup,
        payment_method: 'Card',
        occurred_at:
          scannedReceipt.date && /^\d{4}-\d{2}-\d{2}$/.test(scannedReceipt.date)
            ? new Date(`${scannedReceipt.date}T12:00:00`).toISOString()
            : undefined,
        notes: `Payd Lens OCR • TRN: ${scannedReceipt.trn || 'N/A'} • 5% VAT: ${formatMinorUnits(scannedReceipt.vat_minor || 0, 'AED')}`,
        splits,
      });

      setIsSaved(true);
      setIsSaving(false);
      handleClose();
    } catch (err: unknown) {
      setIsSaving(false);
      setError(friendlySaveError(err));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div {...dialogProps} className="focus:outline-none relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#18181b] border border-white/10 shadow-2xl p-6 text-white font-body">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-zinc-700 text-white">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id={titleId} className="font-heading text-lg text-white">Payd Lens</h2>
                <span className="text-[10px] uppercase font-heading px-2 py-0.5 rounded-full bg-silver-500/20 text-silver-300 border border-silver-500/30">
                  UAE OCR &bull; 5% VAT
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-body">
                Snap a receipt and split it item by item
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close Payd Lens"
              className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs space-y-2"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            {scanFailed && !scannedReceipt && (
              <div className="flex flex-wrap gap-2 pl-6">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setScanFailed(false);
                    setImagePreview(null);
                    setIsReadyToScan(false);
                  }}
                  className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-zinc-200 font-semibold"
                >
                  Try another photo
                </button>
                <button
                  type="button"
                  onClick={startManualEntry}
                  className="px-3 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 font-semibold"
                >
                  Enter manually
                </button>
              </div>
            )}
          </div>
        )}

        {/* State 1: Choose or Snap File */}
        {!scannedReceipt && !isScanning && !isReadyToScan && (
          <div className="mt-6 space-y-6">
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <LensCameraViewer
                onCapture={handleCameraCapture}
                onUploadClick={() => fileInputRef.current?.click()}
              />
              <p className="text-xs text-center text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Point at any UAE restaurant or grocery bill. Payd Lens extracts merchant, TRN, line items, and 5% VAT.
              </p>
              <div className="text-center">
                <button
                  type="button"
                  onClick={startManualEntry}
                  className="text-xs font-semibold text-emerald-500 hover:underline"
                >
                  No photo? Enter the bill manually
                </button>
              </div>
            </div>
          </div>
        )}

        {/* State 1.5: Image Orientation & Confirmation Stage */}
        {isReadyToScan && imagePreview && !isScanning && (
          <div className="mt-6 space-y-4">
            <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950 flex items-center justify-center max-h-80">
              <img
                src={imagePreview}
                alt="Receipt Preview"
                className="max-h-80 w-auto object-contain transition-transform duration-200"
              />
              <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-md px-2 py-1 rounded-xl border border-white/10 text-white text-xs">
                <button
                  type="button"
                  onClick={() => handleRotateImage(-90)}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition"
                  title="Rotate Left 90°"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <span className="text-[10px] text-slate-300">Rotate</span>
                <button
                  type="button"
                  onClick={() => handleRotateImage(90)}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition"
                  title="Rotate Right 90°"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            <p className="text-xs text-center text-slate-500 dark:text-slate-400">
              Is the receipt upright? Use the rotate buttons above if taken sideways or upside-down.
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setImagePreview(null);
                  setIsReadyToScan(false);
                }}
                className="flex-1 py-3 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-200 dark:hover:bg-slate-750 transition"
              >
                Retake
              </button>
              <button
                type="button"
                onClick={executeReceiptScan}
                className="flex-[2] py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center justify-center gap-2"
              >
                <ScanLine className="w-4 h-4" /> Scan receipt
              </button>
            </div>
          </div>
        )}

        {/* State 2: Scanning Loading Animation */}
        {isScanning && (
          <div className="mt-8 py-12 text-center space-y-4">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 rounded-2xl bg-emerald-500/20 animate-ping" />
              <div className="relative w-20 h-20 rounded-2xl bg-emerald-500 flex items-center justify-center text-white">
                <Receipt className="w-10 h-10 animate-pulse" />
              </div>
            </div>
            <div>
              <h3 className="font-bold text-base">Payd Lens Scanning Receipt...</h3>
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
                <div className="flex-1 pr-4">
                  {isEditingReceipt ? (
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Merchant Name</label>
                      <input
                        type="text"
                        value={scannedReceipt.merchant_name}
                        placeholder="e.g. Blue Oasis Bistro"
                        onChange={(e) =>
                          setScannedReceipt({ ...scannedReceipt, merchant_name: e.target.value })
                        }
                        className="w-full px-2.5 py-1 text-sm font-bold rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                  ) : (
                    <div>
                      <h3 className="font-semibold text-base text-slate-900 dark:text-white">
                        {scannedReceipt.merchant_name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {scannedReceipt.trn && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            TRN: {scannedReceipt.trn}
                          </span>
                        )}
                        {scannedReceipt.date && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            {scannedReceipt.date}
                          </span>
                        )}
                        {scannedReceipt.engine !== 'manual' &&
                          (scannedReceipt.warnings && scannedReceipt.warnings.length > 0 ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                              Needs review &bull; {Math.round((scannedReceipt.confidence ?? 0) * 100)}% confidence
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                              Totals reconcile &bull; {Math.round((scannedReceipt.confidence ?? 0) * 100)}% confidence
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="text-right">
                  {isEditingReceipt ? (
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Total AED</label>
                      <input
                        type="number"
                        step="0.01"
                        value={(scannedReceipt.total_minor / 100).toFixed(2)}
                        onChange={(e) => {
                          const minor = Math.max(0, parseMajorToMinor(e.target.value, 'AED'));
                          // Keep the printed VAT/charges; the subtotal absorbs the change.
                          const vat = Math.min(scannedReceipt.vat_minor || 0, minor);
                          setScannedReceipt({
                            ...scannedReceipt,
                            total_minor: minor,
                            vat_minor: vat,
                            subtotal_minor: Math.max(0, minor - vat - (scannedReceipt.charges_minor || 0)),
                          });
                        }}
                        className="w-24 px-2 py-1 text-right text-base font-semibold rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-emerald-600"
                      />
                    </div>
                  ) : (
                    <div>
                      <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatMinorUnits(scannedReceipt.total_minor, 'AED')}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Subtotal: {formatMinorUnits(scannedReceipt.subtotal_minor, 'AED')} • VAT: {formatMinorUnits(scannedReceipt.vat_minor, 'AED')}
                        {scannedReceipt.charges_minor ? (
                          <> • Charges: {formatMinorUnits(scannedReceipt.charges_minor, 'AED')}</>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {scannedReceipt.warnings && scannedReceipt.warnings.length > 0 && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-600 dark:text-amber-400 space-y-1">
                  {scannedReceipt.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Group & Payer Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-200 dark:border-slate-700/60 text-xs">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Payer (Who paid)</label>
                  <select
                    value={payerId}
                    onChange={(e) => setPayerId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {participantPool.map((u) => (
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
                    onChange={(e) => applyGroup(e.target.value || null)}
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

            {/* Split Mode Selector & Edit Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Split Strategy
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingReceipt(!isEditingReceipt)}
                  className={`px-3 py-1 text-xs font-semibold rounded-xl border flex items-center gap-1.5 transition ${
                    isEditingReceipt
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-600'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEditingReceipt ? 'Done Editing' : 'Edit Items'}</span>
                </button>

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
            </div>

            {/* Participants Selector */}
            <div>
              <span className="text-xs text-slate-400 block mb-2 font-medium">
                Include Participants ({selectedUserIds.length})
              </span>
              <div className="flex flex-wrap gap-2">
                {participantPool.map((u) => {
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
            {splitMode === 'itemized' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Line Items ({scannedReceipt.line_items.length})
                  </span>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    {isEditingReceipt && (
                      <button
                        type="button"
                        onClick={handleAddItem}
                        className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 font-semibold hover:bg-emerald-500/20 transition flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add Item
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const newAssignments: Record<number, string[]> = {};
                        scannedReceipt.line_items.forEach((_, idx) => {
                          newAssignments[idx] = [...selectedUserIds];
                        });
                        setItemAssignments(newAssignments);
                      }}
                      className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-emerald-500 font-medium transition"
                    >
                      Split All Equally
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const newAssignments: Record<number, string[]> = {};
                        scannedReceipt.line_items.forEach((_, idx) => {
                          newAssignments[idx] = [payerId];
                        });
                        setItemAssignments(newAssignments);
                      }}
                      className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-emerald-500 font-medium transition"
                    >
                      All to Payer
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {scannedReceipt.line_items.map((item, idx) => {
                    const assigned = itemAssignments[idx] || [];
                    const fraction =
                      assigned.length > 1
                        ? `¹/${assigned.length} (${formatMinorUnits(Math.round(item.price_minor / assigned.length), 'AED')} each)`
                        : '';

                    return (
                      <div
                        key={idx}
                        className="p-3 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs transition hover:bg-slate-50/50 dark:hover:bg-slate-850/50"
                      >
                        <div className="flex-1">
                          {isEditingReceipt ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => handleUpdateItemName(idx, e.target.value)}
                                className="flex-1 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium text-xs"
                              />
                              <div className="flex items-center gap-1">
                                <span className="text-slate-400 text-[11px]">AED</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={(item.price_minor / 100).toFixed(2)}
                                  onChange={(e) => handleUpdateItemPrice(idx, e.target.value)}
                                  className="w-16 px-1.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-right font-bold text-xs"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(idx)}
                                className="p-1 text-rose-400 hover:text-rose-600 rounded-lg"
                                title="Delete Item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                  {item.quantity > 1 ? `${item.quantity}x ` : ''}
                                  {item.name}
                                </span>
                                {fraction && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                                    {fraction}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                Subtotal: {formatMinorUnits(item.price_minor, 'AED')}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Assignee badges */}
                        {!isEditingReceipt && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-slate-400 font-medium">Claimed by:</span>
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
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition flex items-center gap-1 ${
                                      isAssigned
                                        ? 'bg-emerald-600 text-white font-bold shadow-xs'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                    }`}
                                  >
                                    {isAssigned && <Check className="w-3 h-3 stroke-[3]" />}
                                    <span>{u.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-850/70 border border-slate-200/50 dark:border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
                  <span>5% UAE VAT & unlisted tips are auto-distributed proportionally to individual item totals.</span>
                </div>
              </div>
            )}

            {/* Final Shares Ledger Summary */}
            <div className="p-4 rounded-2xl bg-silver-950/30 border border-silver-500/20 space-y-2 font-body">
              <div className="flex items-center justify-between text-xs font-heading text-silver-300">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> EACH PERSON PAYS
                </span>
                <span>Sum: {formatMinorUnits(scannedReceipt.total_minor, 'AED')}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {Object.entries(computedShares).map(([uid, share]) => {
                  const u = users.find((usr) => usr.id === uid);
                  return (
                    <div
                      key={uid}
                      className="p-2.5 rounded-xl bg-[#202025] border border-white/8"
                    >
                      <div className="text-[11px] text-zinc-400">{u?.name || 'User'}</div>
                      <div className="text-sm font-bold text-white font-body">
                        {formatMinorUnits(share, 'AED')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Share Row */}
            <div className="grid grid-cols-2 gap-2 font-body">
              <button
                type="button"
                onClick={handleShareReceiptWhatsApp}
                className="py-2.5 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={handleCopyReceiptBreakdown}
                className="py-2.5 px-3 rounded-xl bg-[#27272a] hover:bg-[#3f3f46] text-zinc-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                {copiedBreakdown ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedBreakdown ? 'Copied to Clipboard!' : 'Copy Summary'}</span>
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2 font-body">
              <button
                type="button"
                onClick={() => {
                  setScannedReceipt(null);
                  setImagePreview(null);
                  setIsReadyToScan(false);
                  setIsSaved(false);
                  setIsEditingReceipt(false);
                  setItemAssignments({});
                  setError(null);
                }}
                className="flex-1 py-3 px-4 rounded-2xl bg-[#27272a] hover:bg-[#3f3f46] text-zinc-200 font-semibold text-sm transition active:scale-95"
              >
                Scan Another
              </button>

              <button
                type="button"
                onClick={handleSaveToLedger}
                disabled={!canSave}
                className="flex-[2] py-3 px-4 rounded-2xl bg-silver-100 hover:bg-white text-zinc-900 font-semibold text-sm transition flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                <Check className="w-4 h-4 stroke-[3]" />{' '}
                {isSaved ? 'Saved' : isSaving ? 'Saving…' : 'Save Receipt to Ledger'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
