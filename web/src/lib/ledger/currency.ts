// Invariant 1: Integer Minor Units. All monetary values are strictly stored as amount_minor.
// No floating-point math in financial calculations.

export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  decimals: number;
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyConfig> = {
  AED: { code: 'AED', symbol: 'AED', name: 'UAE Dirham', decimals: 2 },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2 },
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2 },
  SAR: { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', decimals: 2 },
  CAD: { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', decimals: 2 },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
};

export const DEFAULT_CURRENCY = 'AED';

export function getCurrencyConfig(currency: string = DEFAULT_CURRENCY): CurrencyConfig {
  const upper = currency.toUpperCase();
  return SUPPORTED_CURRENCIES[upper] || { code: upper, symbol: upper, name: upper, decimals: 2 };
}

export function getCurrencySymbol(currency: string = DEFAULT_CURRENCY): string {
  return getCurrencyConfig(currency).symbol;
}

/**
 * Formats integer minor units (fils/cents) to a human-readable currency string.
 * Example: 10000 AED -> "AED 100.00"
 *
 * Defensive behaviour (display must never look corrupted):
 * - Non-integer input is rounded to the nearest minor unit (half away from zero).
 * - Non-finite input (NaN, Infinity) renders as an em dash, e.g. "AED —".
 * - Zero is never shown with a minus sign.
 */
export function formatMinorUnits(
  amountMinor: number | bigint,
  currency: string = DEFAULT_CURRENCY,
  options?: { showSymbol?: boolean; spaceBeforeSymbol?: boolean }
): string {
  const config = getCurrencyConfig(currency);
  const sym = config.symbol;
  const withSymbol = (body: string) => (sym.length > 1 ? `${sym} ${body}` : `${sym}${body}`);

  let minor: bigint;
  if (typeof amountMinor === 'bigint') {
    minor = amountMinor;
  } else {
    const n = Number(amountMinor);
    if (!Number.isFinite(n)) return withSymbol('—');
    // Math.round rounds -0.5 towards +inf; round magnitude instead for symmetry.
    const rounded = n < 0 ? -Math.round(-n) : Math.round(n);
    minor = BigInt(rounded);
  }

  const isNegative = minor < BigInt(0);
  const absMinor = isNegative ? -minor : minor;
  const factor = BigInt(10) ** BigInt(config.decimals);
  const whole = absMinor / factor;
  const frac = absMinor % factor;

  const wholeStr = whole.toLocaleString('en-US');
  const formattedAmount =
    config.decimals > 0 ? `${wholeStr}.${frac.toString().padStart(config.decimals, '0')}` : wholeStr;

  // Format styles: AED 100.00 vs $100.00
  return `${isNegative ? '-' : ''}${withSymbol(formattedAmount)}`;
}

/** Largest accepted magnitude, in major units (e.g. AED 1,000,000,000,000). */
export const MAX_MAJOR_AMOUNT = 1e12;

export type ParseMajorResult = { ok: true; value: number } | { ok: false; error: string };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parses a major-unit amount (string or number) to integer minor units, with a reason on failure.
 *
 * Accepted: "12", "12.5", "12.", ".5", "+12", "-5", "1,250.50" (correct 3-digit grouping only),
 * optionally prefixed or suffixed by the currency code/symbol ("AED 12.50", "$5", "12 AED").
 * Rejected: empty input, exponent notation ("1e3"), more than one dot, stray/misplaced minus
 * signs, letters, NaN/Infinity, bad comma grouping, and magnitudes above MAX_MAJOR_AMOUNT.
 * Extra decimals are rounded half-up (away from zero) on the decimal digits, so there is no
 * float error: "1.005" -> 101, "12.345" -> 1235. Numbers are converted via their shortest
 * decimal representation, so 1.005 (the JS literal) also yields 101.
 */
export function tryParseMajorToMinor(
  amountMajor: string | number,
  currency: string = DEFAULT_CURRENCY
): ParseMajorResult {
  const config = getCurrencyConfig(currency);
  const decimals = config.decimals;
  const maxLabel = `${config.code} ${MAX_MAJOR_AMOUNT.toLocaleString('en-US')}`;

  let str: string;
  if (typeof amountMajor === 'number') {
    if (!Number.isFinite(amountMajor)) return { ok: false, error: 'Please enter a valid amount.' };
    if (Math.abs(amountMajor) > MAX_MAJOR_AMOUNT) {
      return { ok: false, error: `That amount is too large. The maximum is ${maxLabel}.` };
    }
    str = String(amountMajor);
    // Tiny numbers stringify with an exponent (e.g. 1e-7); expand them.
    if (/e/i.test(str)) str = amountMajor.toFixed(20);
  } else if (typeof amountMajor === 'string') {
    str = amountMajor;
  } else {
    return { ok: false, error: 'Please enter a valid amount.' };
  }

  str = str.trim();
  if (str === '') return { ok: false, error: 'Please enter an amount.' };

  // Optional sign, then optional currency code/symbol, or symbol/code after the number.
  let sign = '';
  if (str[0] === '-' || str[0] === '+') {
    sign = str[0];
    str = str.slice(1).trimStart();
  }
  const markers = [config.code, config.symbol].filter(Boolean).map(escapeRegExp).join('|');
  const prefix = new RegExp(`^(?:${markers})\\s*`, 'i');
  const suffix = new RegExp(`\\s*(?:${markers})$`, 'i');
  str = str.replace(prefix, '');
  if (!sign && (str[0] === '-' || str[0] === '+')) {
    // e.g. "AED -5"
    sign = str[0];
    str = str.slice(1);
  }
  str = str.replace(suffix, '');

  if (/[eE]/.test(str) && /\d/.test(str)) {
    return { ok: false, error: 'Please enter a plain number like 12.50 (no scientific notation).' };
  }
  if ((str.match(/\./g) || []).length > 1) {
    return { ok: false, error: 'An amount can only have one decimal point.' };
  }
  if (/[-+]/.test(str)) {
    return { ok: false, error: 'Please enter a valid amount (misplaced minus or plus sign).' };
  }

  const m = /^(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d*))?$/.exec(str);
  if (!m || (m[1] === '' && !m[2])) {
    if (/,/.test(str) && /^[\d,.]+$/.test(str)) {
      return { ok: false, error: 'Please check the thousands separators, e.g. 1,250.50.' };
    }
    return { ok: false, error: 'Please enter a valid amount using numbers only, e.g. 12.50.' };
  }

  const wholeDigits = m[1].replace(/,/g, '').replace(/^0+(?=\d)/, '') || '0';
  const fracDigits = m[2] || '';

  // Length guard before any numeric conversion (1e12 has 13 digits).
  if (wholeDigits.length > String(MAX_MAJOR_AMOUNT).length) {
    return { ok: false, error: `That amount is too large. The maximum is ${maxLabel}.` };
  }

  const keptFrac = fracDigits.slice(0, decimals).padEnd(decimals, '0');
  const roundUp = fracDigits.length > decimals && fracDigits.charCodeAt(decimals) >= 53; // '5'
  let magnitude = Number(wholeDigits + keptFrac);
  if (roundUp) magnitude += 1;

  if (!Number.isSafeInteger(magnitude) || magnitude > MAX_MAJOR_AMOUNT * Math.pow(10, decimals)) {
    return { ok: false, error: `That amount is too large. The maximum is ${maxLabel}.` };
  }

  const value = sign === '-' && magnitude !== 0 ? -magnitude : magnitude;
  return { ok: true, value };
}

/**
 * Parses a major currency string or number to integer minor units without float arithmetic errors.
 * Example: "100.50" -> 10050, "100" -> 10000, "0.05" -> 5, "1,250.50" -> 125050, "-5" -> -500.
 * Always returns a safe integer; returns 0 for ANY invalid input (see tryParseMajorToMinor for
 * the rules and for a user-facing error message). Callers must reject values <= 0.
 */
export function parseMajorToMinor(amountMajor: string | number, currency: string = DEFAULT_CURRENCY): number {
  const res = tryParseMajorToMinor(amountMajor, currency);
  return res.ok ? res.value : 0;
}

/**
 * Converts integer minor units to a major float for display/input fields only.
 */
export function minorToMajor(amountMinor: number, currency: string = DEFAULT_CURRENCY): number {
  const config = getCurrencyConfig(currency);
  return Number((amountMinor / Math.pow(10, config.decimals)).toFixed(config.decimals));
}
