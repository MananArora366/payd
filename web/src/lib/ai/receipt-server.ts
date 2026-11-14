import { GoogleGenAI, Type } from '@google/genai';
import {
  ReceiptScanResult,
  ReceiptScanSchema,
  ReceiptItem,
} from './receipt-scan';
import { runLocalOcrDetailed } from './local-ocr';
import { isBedrockConfigured } from './bedrock';
import { readReceiptWithClaude } from './receipt-claude';

/** Thrown when an upload cannot be turned into a trustworthy receipt. */
export class ReceiptScanError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 422, code = 'unreadable') {
    super(message);
    this.name = 'ReceiptScanError';
    this.status = status;
    this.code = code;
  }
}

const UNREADABLE_MESSAGE =
  "We couldn't read a receipt in this image. Try a sharper, well-lit photo, or enter the bill manually.";

// ---------------------------------------------------------------------------
// Amount helpers (integer fils only, no floats)
// ---------------------------------------------------------------------------

// "1,250.50", "13.50", "13,50" (comma decimal). Lookarounds stop us matching
// inside longer digit runs such as TRNs, phone numbers or "1.250.50".
const AMOUNT_RE =
  /(?<![\d.,])(-)?\s?(?:AED|DHS?|د\.إ)?\s?((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}|\d+,\d{2})(?![\d.,]*\d)/gi;

const MAX_RECEIPT_MINOR = 100_000_000; // AED 1,000,000 sanity ceiling

function amountTextToMinor(raw: string): number {
  const normalized = raw.includes('.') ? raw.replace(/,/g, '') : raw.replace(',', '.');
  const [whole, frac = '00'] = normalized.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0').slice(0, 2));
}

interface FoundAmount {
  minor: number;
  index: number;
  end: number;
}

function findAmounts(line: string): FoundAmount[] {
  const out: FoundAmount[] = [];
  for (const m of line.matchAll(AMOUNT_RE)) {
    const minor = amountTextToMinor(m[2]);
    if (!Number.isSafeInteger(minor) || minor > MAX_RECEIPT_MINOR) continue;
    out.push({ minor: m[1] ? -minor : minor, index: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}

/** Returns the amount if the line holds nothing but a price (Vision's "price column"). */
function amountOnly(line: string): number | null {
  const amounts = findAmounts(line);
  if (amounts.length === 0) return null;
  let rest = line;
  for (const a of [...amounts].reverse()) rest = rest.slice(0, a.index) + rest.slice(a.end);
  rest = rest.replace(/\b(?:AED|DHS?)\b|د\.إ|[:=*\-\s]/gi, '');
  return rest.length === 0 ? amounts[amounts.length - 1].minor : null;
}

// ---------------------------------------------------------------------------
// Line classification
// ---------------------------------------------------------------------------

export type ReceiptRowKind =
  | 'item'
  | 'subtotal'
  | 'vat'
  | 'total'
  | 'charge'
  | 'discount'
  | 'payment';

const METADATA_RE =
  /\b(?:trn|tin|vat\s*(?:reg|no|number|id)|tax\s*reg\w*|date|time|tel|phone|mob(?:ile)?|fax|invoice|inv\s*no|bill\s*no|receipt\s*(?:no|#)|order\s*(?:no|#)|table|cashier|server|waiter|guests?|covers?|terminal|thank\s*you|thanks|welcome|visit\s*again|www|https?|e-?mail)\b|@/i;

function hasLetters(s: string): boolean {
  return /\p{L}{2,}/u.test(s);
}

export function classifyReceiptLabel(label: string): ReceiptRowKind {
  const l = label.toLowerCase();
  if (/sub\s*-?\s*total|excl\.?\s*(?:of\s*)?(?:vat|tax)|before\s*(?:vat|tax)/.test(l)) return 'subtotal';
  const isTotal =
    /\b(?:grand\s*total|total|amount\s*due|balance\s*due|net\s*payable|amount\s*payable|net\s*amount|incl\.?\s*(?:vat|tax))\b/.test(l) &&
    !/\b(?:total\s*(?:vat|tax)|(?:vat|tax)\s*(?:amount|total)|total\s*(?:items?|qty|quantity|savings?|discounts?|pieces?))\b/.test(l);
  if (isTotal) return 'total';
  if (/\b(?:vat|tax|gst)\b/.test(l)) return 'vat';
  if (/\b(?:service|svc|tips?|gratuity|delivery|municipality|tourism|fees?|charges?|rounding|round\s*off)\b/.test(l)) return 'charge';
  if (/\b(?:discount|disc|promo|coupon|savings?|offer|voucher)\b/.test(l)) return 'discount';
  if (/\b(?:cash|change|card|visa|mastercard|amex|tender(?:ed)?|paid|payment|apple\s*pay)\b/.test(l)) return 'payment';
  return 'item';
}

function totalPriority(label: string): number {
  const l = label.toLowerCase();
  if (/grand\s*total|amount\s*due|balance\s*due|total\s*due|payable/.test(l)) return 3;
  if (/incl\.?\s*(?:vat|tax)/.test(l)) return 2;
  return 1;
}

function cleanLabel(raw: string): string {
  return raw
    .replace(/\b(?:AED|DHS?)\b|د\.إ/gi, ' ')
    .replace(/[:=*]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-.]+|[\s\-.]+$/g, '')
    .trim();
}

function titleCaseIfShouting(s: string): string {
  if (s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
  return s
    .toLowerCase()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function splitQuantity(label: string): { name: string; quantity: number } {
  const patterns: Array<[RegExp, number, number]> = [
    [/^(\d{1,3})\s*[x×]\s+(.+)$/i, 2, 1],
    [/^(.+?)\s+(\d{1,3})\s*[x×]$/i, 1, 2],
    [/^(.+?)\s+[x×]\s*(\d{1,3})$/i, 1, 2],
    [/^(.+?)\s+qty\.?\s*(\d{1,3})$/i, 1, 2],
  ];
  for (const [re, nameIdx, qtyIdx] of patterns) {
    const m = label.match(re);
    if (m) {
      const q = Number(m[qtyIdx]);
      if (q >= 1) return { name: m[nameIdx].trim(), quantity: q };
    }
  }
  return { name: label, quantity: 1 };
}

// ---------------------------------------------------------------------------
// Date + TRN
// ---------------------------------------------------------------------------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function isoIfValid(y: number, m: number, d: number, now: Date): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  // Allow one day of clock/time-zone skew; anything further ahead is a misread.
  if (dt.getTime() > now.getTime() + 36 * 3600 * 1000) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function extractReceiptDate(lines: string[], now: Date = new Date()): string | null {
  // Lines that say "date" first, then everything else.
  const ordered = [...lines.filter((l) => /date/i.test(l)), ...lines.filter((l) => !/date/i.test(l))];
  for (const line of ordered) {
    let m = line.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (m) {
      const iso = isoIfValid(+m[1], +m[2], +m[3], now);
      if (iso) return iso;
    }
    m = line.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/);
    if (m) {
      const a = +m[1];
      const b = +m[2];
      // UAE receipts are day-first; only flip when day-first is impossible.
      const iso = isoIfValid(+m[3], b, a, now) ?? (a <= 12 ? isoIfValid(+m[3], a, b, now) : null);
      if (iso) return iso;
    }
    m = line.match(/\b(\d{1,2})[\s\-]*([a-z]{3})[a-z]*[\s\-,]*(\d{4}|\d{2})\b/i);
    if (m && MONTHS.includes(m[2].toLowerCase())) {
      const iso = isoIfValid(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1], now);
      if (iso) return iso;
    }
    m = line.match(/\b([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i);
    if (m && MONTHS.includes(m[1].toLowerCase())) {
      const iso = isoIfValid(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2], now);
      if (iso) return iso;
    }
  }
  return null;
}

export function extractTrn(lines: string[]): string | null {
  for (const line of lines) {
    if (/\b(?:TRN|TIN|VAT\s*(?:REG|NO)|TAX\s*REG)/i.test(line)) {
      const digits = line.replace(/\D/g, '');
      const m = digits.match(/1\d{14}/);
      if (m) return m[0];
    }
  }
  for (const line of lines) {
    const m = line.replace(/[\s-]/g, '').match(/(?<!\d)(1\d{14})(?!\d)/);
    if (m) return m[1];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reconciliation / confidence
// ---------------------------------------------------------------------------

function fmt(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}AED ${Math.floor(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Cross-checks items, subtotal, VAT, charges and total. Returns human readable
 * warnings and a confidence that drops when the numbers don't reconcile.
 */
export function assessReceipt(
  r: Pick<ReceiptScanResult, 'line_items' | 'subtotal_minor' | 'vat_minor' | 'total_minor'> & {
    charges_minor?: number;
  },
  baseConfidence: number,
  extraWarnings: string[] = []
): { confidence: number; warnings: string[] } {
  const warnings = [...extraWarnings];
  let confidence = baseConfidence;
  const charges = r.charges_minor ?? 0;
  const itemsSum = r.line_items.reduce((acc, it) => acc + it.price_minor, 0);

  if (r.line_items.length === 0) {
    warnings.push('No line items detected. Add them manually or split the total equally.');
    confidence -= 0.2;
  } else {
    if (r.subtotal_minor > 0 && itemsSum !== r.subtotal_minor) {
      warnings.push(`Line items add up to ${fmt(itemsSum)} but the receipt subtotal is ${fmt(r.subtotal_minor)}.`);
      confidence -= 0.25;
    }
    if (itemsSum + r.vat_minor + charges !== r.total_minor) {
      warnings.push(
        `Items + VAT${charges ? ' + charges' : ''} = ${fmt(itemsSum + r.vat_minor + charges)}, but the total is ${fmt(r.total_minor)}. Please check the amounts.`
      );
      confidence -= 0.25;
    }
  }
  if (r.subtotal_minor > 0 && r.subtotal_minor + r.vat_minor + charges !== r.total_minor) {
    warnings.push(`Subtotal + VAT doesn't equal the total (${fmt(r.total_minor)}).`);
    confidence -= 0.15;
  }
  if (r.total_minor > 0 && r.vat_minor > r.total_minor * 0.2) {
    warnings.push('VAT looks unusually high for UAE 5% VAT.');
    confidence -= 0.15;
  }
  confidence = Math.min(0.97, Math.max(0.05, Math.round(confidence * 100) / 100));
  return { confidence, warnings };
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

interface Row {
  label: string;
  minor: number;
  line: number;
  kind: ReceiptRowKind;
}

/**
 * Turns Apple Vision OCR lines into a structured receipt.
 *
 * Vision often returns a receipt as two columns: all the labels first, then all
 * the prices. payd-ocr gives no geometry, so labels and prices are paired by
 * order: each run of price-only lines is matched to the label-only lines that
 * preceded it, aligned from the end (header lines such as the merchant name and
 * address sit at the start of the label run and stay unpaired).
 *
 * Throws ReceiptScanError when there's nothing that looks like a receipt.
 */
export function parseRawReceiptTextLines(rawLines: string[], now: Date = new Date()): ReceiptScanResult {
  const lines = rawLines.map((l) => String(l ?? '').trim()).filter((l) => l.length > 0);
  if (lines.length === 0) throw new ReceiptScanError(UNREADABLE_MESSAGE);

  const rows: Row[] = [];
  const strayAmounts: number[] = [];
  let pending: { label: string; line: number }[] = [];
  let block: { minor: number; line: number }[] = [];

  const pushRow = (label: string, minor: number, line: number) => {
    const cleaned = cleanLabel(label);
    if (!hasLetters(cleaned)) {
      strayAmounts.push(minor);
      return;
    }
    rows.push({ label: cleaned, minor, line, kind: classifyReceiptLabel(cleaned) });
  };

  const flush = () => {
    if (block.length === 0) return;
    const m = Math.min(block.length, pending.length);
    const labels = pending.slice(pending.length - m);
    const amounts = block.slice(block.length - m);
    block.slice(0, block.length - m).forEach((a) => strayAmounts.push(a.minor));
    labels.forEach((lab, i) => pushRow(lab.label, amounts[i].minor, lab.line));
    pending = [];
    block = [];
  };

  lines.forEach((line, i) => {
    const solo = amountOnly(line);
    if (solo !== null) {
      block.push({ minor: solo, line: i });
      return;
    }
    flush();
    if (!hasLetters(line)) return;
    const amounts = findAmounts(line);
    if (amounts.length > 0) {
      const before = line.slice(0, amounts[0].index);
      const after = line.slice(amounts[amounts.length - 1].end);
      const label = hasLetters(before) ? before : after;
      if (METADATA_RE.test(label) && classifyReceiptLabel(label) === 'item') return;
      pending = [];
      pushRow(label, amounts[amounts.length - 1].minor, i);
      return;
    }
    // Label-only line: metadata (TRN, date, phone, "thank you") never takes a price.
    if (METADATA_RE.test(line) && classifyReceiptLabel(line) === 'item') return;
    pending.push({ label: line, line: i });
  });
  flush();

  // --- Summary rows -------------------------------------------------------
  const firstSummaryLine = rows
    .filter((r) => r.kind === 'subtotal' || r.kind === 'total' || r.kind === 'vat')
    .reduce((min, r) => Math.min(min, r.line), Number.POSITIVE_INFINITY);

  const totalRows = rows.filter((r) => r.kind === 'total' && r.minor > 0);
  const totalRow = totalRows.sort(
    (a, b) => totalPriority(b.label) - totalPriority(a.label) || b.minor - a.minor || b.line - a.line
  )[0];
  const subtotalRow = rows.find((r) => r.kind === 'subtotal' && r.minor > 0);
  const vatRow = rows.find((r) => r.kind === 'vat' && r.minor >= 0);
  const charges =
    rows.filter((r) => r.kind === 'charge').reduce((acc, r) => acc + r.minor, 0) -
    rows.filter((r) => r.kind === 'discount').reduce((acc, r) => acc + Math.abs(r.minor), 0);

  const lineItems: ReceiptItem[] = rows
    .filter((r) => r.kind === 'item' && r.minor > 0 && r.line < firstSummaryLine)
    .map((r) => {
      const { name, quantity } = splitQuantity(r.label);
      return { name: titleCaseIfShouting(name) || 'Item', quantity, price_minor: r.minor };
    });
  const itemsSum = lineItems.reduce((acc, it) => acc + it.price_minor, 0);

  const notes: string[] = [];
  let baseConfidence = 0.95;
  let vatMinor = vatRow ? vatRow.minor : 0;
  let totalMinor = totalRow?.minor ?? 0;

  if (!totalMinor) {
    baseConfidence -= 0.25;
    if (subtotalRow) totalMinor = subtotalRow.minor + vatMinor + charges;
    else if (itemsSum > 0) totalMinor = itemsSum + vatMinor + charges;
    else {
      const all = [...rows.map((r) => r.minor), ...strayAmounts].filter((a) => a > 0);
      if (all.length === 0) throw new ReceiptScanError(UNREADABLE_MESSAGE);
      totalMinor = Math.max(...all);
    }
    notes.push('No TOTAL line found; total was inferred. Please verify.');
  }
  if (totalMinor <= 0) throw new ReceiptScanError(UNREADABLE_MESSAGE);

  if (!vatRow) {
    const base = subtotalRow?.minor ?? 0;
    const diff = totalMinor - base - charges;
    if (base > 0 && diff >= 0 && diff <= totalMinor * 0.2) vatMinor = diff;
    else notes.push('VAT not itemised on the receipt.');
    baseConfidence -= 0.05;
  }
  if (vatMinor >= totalMinor) vatMinor = 0;

  const subtotalMinor = subtotalRow?.minor ?? (itemsSum > 0 ? itemsSum : Math.max(0, totalMinor - vatMinor - charges));

  // --- Merchant + category -------------------------------------------------
  const merchantLine = lines
    .slice(0, 6)
    .find(
      (l) =>
        hasLetters(l) &&
        findAmounts(l).length === 0 &&
        !METADATA_RE.test(l) &&
        classifyReceiptLabel(l) === 'item' &&
        l.replace(/[^\p{L}]/gu, '').length >= 3
    );
  const merchant = merchantLine ? titleCaseIfShouting(cleanLabel(merchantLine)) : 'Receipt';
  const lower = lines.join('\n').toLowerCase();
  const category = /carrefour|lulu|spinneys|choithram|waitrose|union\s*coop|grocer|supermarket|hypermarket|\bmarket\b/.test(lower)
    ? 'Groceries'
    : 'Food and dining';

  const draft = {
    line_items: lineItems,
    subtotal_minor: subtotalMinor,
    vat_minor: vatMinor,
    total_minor: totalMinor,
    charges_minor: charges,
  };
  const { confidence, warnings } = assessReceipt(draft, baseConfidence);

  return {
    merchant_name: merchant,
    date: extractReceiptDate(lines, now),
    currency: 'AED',
    trn: extractTrn(lines),
    ...draft,
    category,
    confidence,
    warnings,
    notes: ['Scanned on-device with Apple Vision OCR. Check the items before saving.', ...notes].join(' '),
    engine: 'local_ocr',
  };
}

// ---------------------------------------------------------------------------
// Upload validation
// ---------------------------------------------------------------------------

export const MAX_RECEIPT_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'image/bmp', 'image/tiff']);

function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (buf.toString('ascii', 0, 2) === 'BM') return 'image/bmp';
  if (buf.toString('ascii', 0, 4) === 'II*\0' || buf.toString('ascii', 0, 4) === 'MM\0*') return 'image/tiff';
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (/^(?:heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return 'image/heic';
  }
  return null;
}

/**
 * Validates an uploaded image (data URL or bare base64). Rejects bad base64,
 * non-image MIME types, non-image bytes and oversize uploads.
 */
export function decodeReceiptImage(
  image: string,
  declaredMime?: string | null
): { base64: string; mimeType: string; bytes: Buffer } {
  let base64 = image.trim();
  let mime = typeof declaredMime === 'string' ? declaredMime.trim().toLowerCase() : '';
  const dataUrl = base64.match(/^data:([^;,]*)(;[^,]*)?,/i);
  if (dataUrl) {
    if (!/;base64/i.test(dataUrl[2] || '')) {
      throw new ReceiptScanError('The image must be base64-encoded.', 400, 'invalid_image');
    }
    mime = dataUrl[1].toLowerCase() || mime;
    base64 = base64.slice(dataUrl[0].length);
  }
  if (mime && !ALLOWED_MIME.has(mime)) {
    throw new ReceiptScanError('Please upload a photo of a receipt (JPEG, PNG, WebP or HEIC).', 400, 'unsupported_type');
  }
  base64 = base64.replace(/\s+/g, '');
  if (!base64 || base64.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new ReceiptScanError("That file isn't a valid image.", 400, 'invalid_image');
  }
  if (Math.floor((base64.length * 3) / 4) > MAX_RECEIPT_IMAGE_BYTES + 3) {
    throw new ReceiptScanError('That image is too large. Please use a photo under 8 MB.', 413, 'too_large');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_RECEIPT_IMAGE_BYTES) {
    throw new ReceiptScanError('That image is too large. Please use a photo under 8 MB.', 413, 'too_large');
  }
  const sniffed = sniffImageMime(bytes);
  if (!sniffed) {
    throw new ReceiptScanError('Please upload a photo of a receipt (JPEG, PNG, WebP or HEIC).', 400, 'unsupported_type');
  }
  return { base64, mimeType: sniffed, bytes };
}

/**
 * Process receipt using Gemini 2.0/2.5 Vision or high-speed local Apple Vision OCR.
 * Strict Invariant 2: Vision model extracts text/entities only. Math & splits happen in ledger.
 */
/**
 * Validates a vision model's JSON into a ReceiptScanResult and runs the same
 * reconciliation checks as local OCR. Returns null when no total was read.
 */
export function finalizeVisionReceipt(
  parsedJson: Record<string, unknown>,
  engine: string,
  defaultConfidence: number
): ReceiptScanResult | null {
  const total = Math.round(Number(parsedJson.total_minor) || 0);
  if (total <= 0) return null;
  const charges = Math.round(Number(parsedJson.charges_minor) || 0);
  const validated = ReceiptScanSchema.parse({
    ...parsedJson,
    currency: 'AED', // AED-only ledger
    total_minor: total,
    vat_minor: Math.max(0, Math.round(Number(parsedJson.vat_minor) || 0)),
    subtotal_minor: Math.max(0, Math.round(Number(parsedJson.subtotal_minor) || 0)),
    charges_minor: charges !== 0 ? charges : undefined,
    line_items: Array.isArray(parsedJson.line_items)
      ? parsedJson.line_items
          .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
          .map((i) => ({
            name: String(i.name ?? 'Item').trim() || 'Item',
            quantity: Math.max(1, Math.round(Number(i.quantity) || 1)),
            price_minor: Math.max(0, Math.round(Number(i.price_minor) || 0)),
          }))
      : [],
    date: extractReceiptDate([String(parsedJson.date ?? '')]),
    notes: typeof parsedJson.notes === 'string' ? parsedJson.notes : null,
    engine,
  });
  const reported = Number(parsedJson.confidence);
  const { confidence, warnings } = assessReceipt(
    validated,
    Number.isFinite(reported) && reported > 0 ? Math.min(reported, 0.95) : defaultConfidence
  );
  return { ...validated, confidence, warnings };
}

export async function parseReceiptImage(
  imageBase64: string,
  mimeType: string = 'image/jpeg',
  customApiKey?: string,
  options: { allowAi?: boolean } = {}
): Promise<ReceiptScanResult> {
  // The user's AI toggle; when false only on-device OCR is used.
  const allowAi = options.allowAi !== false;
  // Throws ReceiptScanError (400/413) for bad base64, non-images and oversize uploads.
  const decoded = decodeReceiptImage(imageBase64, mimeType);
  const apiKey = !allowAi
    ? null
    : customApiKey && customApiKey.trim() !== ''
      ? customApiKey.trim()
      : process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your-gemini-api-key'
        ? process.env.GEMINI_API_KEY.trim()
        : null;

  // 1. Claude vision on AWS Bedrock (opt-in via BEDROCK_ENABLED). Handles blurred,
  //    low-light and angled photos that local OCR can't read.
  if (allowAi && isBedrockConfigured()) {
    try {
      const parsedJson = await readReceiptWithClaude(decoded.bytes, decoded.mimeType);
      const receipt = parsedJson ? finalizeVisionReceipt(parsedJson, 'claude_bedrock_vision', 0.9) : null;
      if (receipt) return receipt;
      console.warn('Claude could not read a receipt in the image; trying the next engine.');
    } catch (err) {
      console.warn('Claude vision (Bedrock) error, falling back:', err);
    }
  }

  // 2. Gemini Vision when an API key is available
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });

      const systemInstruction = `You are Payd Lens, an expert UAE receipt OCR and tax parser.
Extract structured financial information from receipt images with extreme precision.
RULES:
1. Base Currency is strictly AED (United Arab Emirates Dirham).
2. The image might be rotated (90 degrees, 180 degrees, or tilted). Always orient and read the text in its natural reading orientation.
3. All monetary amounts must be converted into integer minor units (1 AED = 100 fils). E.g., 29.55 AED -> 2955 fils, 3.00 AED -> 300 fils, 41.30 AED -> 4130 fils.
4. Detect Tax Registration Number (TRN), standard UAE 5% VAT, subtotal, and grand total.
5. If line items are visible, extract their exact names, quantities, and prices in fils.
6. Report the subtotal, VAT and total exactly as printed. If VAT is not printed, set vat_minor to 0. Never invent amounts or items.
7. If the image is not a receipt, is blank or is unreadable, return total_minor 0, an empty line_items array and confidence 0.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: decoded.mimeType,
                  data: decoded.base64,
                },
              },
              {
                text: 'Extract merchant name, date, TRN, subtotal, 5% UAE VAT, total in AED fils, and all itemized line items.',
              },
            ],
          },
        ],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              merchant_name: { type: Type.STRING },
              date: { type: Type.STRING, nullable: true },
              currency: { type: Type.STRING },
              trn: { type: Type.STRING, nullable: true },
              subtotal_minor: { type: Type.INTEGER },
              vat_minor: { type: Type.INTEGER },
              total_minor: { type: Type.INTEGER },
              category: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              notes: { type: Type.STRING, nullable: true },
              line_items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    quantity: { type: Type.INTEGER },
                    price_minor: { type: Type.INTEGER },
                  },
                  required: ['name', 'price_minor'],
                },
              },
            },
            required: ['merchant_name', 'total_minor', 'currency'],
          },
        },
      });

      const parsedJson = JSON.parse(response.text?.trim() || '{}');
      const receipt = finalizeVisionReceipt(parsedJson, 'gemini_2_flash_vision', 0.85);
      if (receipt) return receipt;
      console.warn('Gemini could not read a receipt in the image; trying local OCR.');
    } catch (err) {
      console.warn('Gemini vision API error, falling back to local OCR engine:', err);
    }
  }

  // Fallback: Run local Apple Vision OCR. Never fabricate a receipt.
  const ocr = await runLocalOcrDetailed(decoded.base64);
  if (ocr.status === 'unavailable') {
    throw new ReceiptScanError(
      'Receipt scanning is not available on this server right now. You can enter the bill manually.',
      503,
      'ocr_unavailable'
    );
  }
  return parseRawReceiptTextLines(ocr.lines);
}
