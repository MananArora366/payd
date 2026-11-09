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
 */
export function formatMinorUnits(
  amountMinor: number | bigint,
  currency: string = DEFAULT_CURRENCY,
  options?: { showSymbol?: boolean; spaceBeforeSymbol?: boolean }
): string {
  const config = getCurrencyConfig(currency);
  const minorVal = Number(amountMinor);
  const isNegative = minorVal < 0;
  const absMinor = Math.abs(minorVal);

  const factor = Math.pow(10, config.decimals);
  const whole = Math.floor(absMinor / factor);
  const frac = absMinor % factor;

  const paddedFrac = frac.toString().padStart(config.decimals, '0');
  const formattedAmount = `${whole.toLocaleString('en-US')}.${paddedFrac}`;

  const prefix = isNegative ? '-' : '';
  const sym = config.symbol;

  // Format styles: AED 100.00 vs $100.00
  if (sym.length > 1) {
    return `${prefix}${sym} ${formattedAmount}`;
  }
  return `${prefix}${sym}${formattedAmount}`;
}

/**
 * Parses a major currency string or number to integer minor units without float arithmetic errors.
 * Example: "100.50" -> 10050, "100" -> 10000, "0.05" -> 5
 */
export function parseMajorToMinor(amountMajor: string | number, currency: string = DEFAULT_CURRENCY): number {
  const config = getCurrencyConfig(currency);
  const rawStr = typeof amountMajor === 'number' ? amountMajor.toFixed(config.decimals) : amountMajor.trim();

  // Strip currency symbols and commas
  const sanitized = rawStr.replace(/[^0-9.-]/g, '');
  if (!sanitized || sanitized === '-' || sanitized === '.') {
    return 0;
  }

  const isNegative = sanitized.startsWith('-');
  const unsignedStr = isNegative ? sanitized.slice(1) : sanitized;

  const parts = unsignedStr.split('.');
  const wholePart = parts[0] || '0';
  let fracPart = parts[1] || '';

  if (fracPart.length > config.decimals) {
    // Truncate/round to decimals
    fracPart = fracPart.slice(0, config.decimals);
  } else {
    fracPart = fracPart.padEnd(config.decimals, '0');
  }

  const whole = parseInt(wholePart, 10) || 0;
  const frac = parseInt(fracPart, 10) || 0;

  const totalMinor = whole * Math.pow(10, config.decimals) + frac;
  return isNegative ? -totalMinor : totalMinor;
}

/**
 * Converts integer minor units to a major float for display/input fields only.
 */
export function minorToMajor(amountMinor: number, currency: string = DEFAULT_CURRENCY): number {
  const config = getCurrencyConfig(currency);
  return Number((amountMinor / Math.pow(10, config.decimals)).toFixed(config.decimals));
}
