import { describe, it, expect } from 'vitest';
import {
  formatMinorUnits,
  parseMajorToMinor,
  tryParseMajorToMinor,
  MAX_MAJOR_AMOUNT,
} from '../currency';

// Deterministic PRNG so property tests are reproducible.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('parseMajorToMinor: valid input', () => {
  it.each([
    ['100', 10000],
    ['100.00', 10000],
    ['100.50', 10050],
    ['100.5', 10050],
    ['0.05', 5],
    ['19.99', 1999],
    ['.5', 50],
    ['5.', 500],
    ['007.10', 710],
    ['  42  ', 4200],
    ['+3', 300],
    ['0', 0],
    ['-0', 0],
    ['1,250.50', 125050],
    ['1,234,567.89', 123456789],
    ['AED 12.50', 1250],
    ['aed12.50', 1250],
    ['12.50 AED', 1250],
  ])('%j -> %i', (input, expected) => {
    expect(parseMajorToMinor(input, 'AED')).toBe(expected);
  });

  it('rounds half-up to 2dp without float error', () => {
    expect(parseMajorToMinor('1.005')).toBe(101);
    expect(parseMajorToMinor('12.345')).toBe(1235);
    expect(parseMajorToMinor('12.344999')).toBe(1234);
    expect(parseMajorToMinor('0.004')).toBe(0);
    expect(parseMajorToMinor('0.005')).toBe(1);
    expect(parseMajorToMinor('9.995')).toBe(1000);
    expect(parseMajorToMinor('99.999')).toBe(10000);
    // Negative values round away from zero on magnitude.
    expect(parseMajorToMinor('-1.005')).toBe(-101);
  });

  it('keeps the sign for negatives so callers can reject them', () => {
    expect(parseMajorToMinor('-5')).toBe(-500);
    expect(parseMajorToMinor('-0.01')).toBe(-1);
    expect(parseMajorToMinor('AED -5')).toBe(-500);
    expect(parseMajorToMinor('-1,000')).toBe(-100000);
  });

  it('accepts number inputs using their shortest decimal form', () => {
    expect(parseMajorToMinor(19.99)).toBe(1999);
    expect(parseMajorToMinor(1.005)).toBe(101);
    expect(parseMajorToMinor(0.1 + 0.2)).toBe(30);
    expect(parseMajorToMinor(100)).toBe(10000);
    expect(parseMajorToMinor(-2.5)).toBe(-250);
    expect(parseMajorToMinor(1e-7)).toBe(0);
    expect(Object.is(parseMajorToMinor(-0), 0)).toBe(true);
  });

  it('accepts exactly the cap and rejects anything above it', () => {
    expect(parseMajorToMinor('1000000000000')).toBe(MAX_MAJOR_AMOUNT * 100);
    expect(parseMajorToMinor('1,000,000,000,000.00')).toBe(MAX_MAJOR_AMOUNT * 100);
    expect(parseMajorToMinor('1000000000000.01')).toBe(0);
    expect(parseMajorToMinor('999999999999.995')).toBe(MAX_MAJOR_AMOUNT * 100); // rounds up to the cap
    expect(parseMajorToMinor('1000000000000.005')).toBe(0); // rounds over the cap
    expect(parseMajorToMinor('99999999999999999999')).toBe(0);
    expect(parseMajorToMinor(1e13)).toBe(0);
    expect(parseMajorToMinor(-1e13)).toBe(0);
  });

  it('respects currency decimals', () => {
    expect(parseMajorToMinor('12.34', 'USD')).toBe(1234);
    expect(parseMajorToMinor('$12.34', 'USD')).toBe(1234);
    // Unknown currencies default to 2 decimals.
    expect(parseMajorToMinor('1.239', 'XYZ')).toBe(124);
  });
});

describe('parseMajorToMinor: invalid input returns 0', () => {
  it.each([
    '1e3',
    '1E3',
    '1e21',
    '1.5e2',
    '1.2.3',
    '1..2',
    '--5',
    '5-',
    '1-2',
    '-',
    '+',
    '.',
    '',
    '   ',
    'abc',
    '12abc',
    'NaN',
    'Infinity',
    '1,25',
    '12,34.5',
    ',100',
    '1 000',
    '$5', // wrong symbol for AED
    'AED',
  ])('%j -> 0', (input) => {
    expect(parseMajorToMinor(input, 'AED')).toBe(0);
  });

  it('rejects non-finite numbers', () => {
    expect(parseMajorToMinor(NaN)).toBe(0);
    expect(parseMajorToMinor(Infinity)).toBe(0);
    expect(parseMajorToMinor(-Infinity)).toBe(0);
  });

  it('returns 0 for non-string, non-number runtime input', () => {
    expect(parseMajorToMinor(undefined as unknown as string)).toBe(0);
    expect(parseMajorToMinor(null as unknown as string)).toBe(0);
  });
});

describe('tryParseMajorToMinor', () => {
  it('returns ok with the value for valid input', () => {
    expect(tryParseMajorToMinor('1,250.50')).toEqual({ ok: true, value: 125050 });
    expect(tryParseMajorToMinor('0')).toEqual({ ok: true, value: 0 });
  });

  it('returns friendly, specific error messages', () => {
    const err = (s: string | number) => {
      const r = tryParseMajorToMinor(s);
      expect(r.ok).toBe(false);
      return r.ok ? '' : r.error;
    };
    expect(err('')).toMatch(/enter an amount/i);
    expect(err('1e3')).toMatch(/scientific notation/i);
    expect(err('1.2.3')).toMatch(/one decimal point/i);
    expect(err('5-')).toMatch(/minus/i);
    expect(err('1,25')).toMatch(/thousands separators/i);
    expect(err('abc')).toMatch(/numbers only/i);
    expect(err('2000000000000')).toMatch(/too large.*AED 1,000,000,000,000/i);
    expect(err(NaN)).toMatch(/valid amount/i);
    for (const s of ['', '1e3', 'abc', '1.2.3']) {
      expect(err(s)).not.toMatch(/invariant/i);
    }
  });
});

describe('parseMajorToMinor: properties', () => {
  it('always returns a safe integer, and 0 for anything tryParse rejects (fuzz)', () => {
    const rnd = makeRng(42);
    const alphabet = '0123456789.,-+eE aAD$';
    for (let i = 0; i < 20000; i++) {
      const len = Math.floor(rnd() * 12);
      let s = '';
      for (let j = 0; j < len; j++) s += alphabet[Math.floor(rnd() * alphabet.length)];
      const v = parseMajorToMinor(s);
      expect(Number.isSafeInteger(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(MAX_MAJOR_AMOUNT * 100);
      const r = tryParseMajorToMinor(s);
      if (!r.ok) expect(v).toBe(0);
      else expect(v).toBe(r.value);
    }
  });

  it('round-trips with formatMinorUnits for random amounts', () => {
    const rnd = makeRng(7);
    for (let i = 0; i < 20000; i++) {
      const minor = Math.floor(rnd() * (rnd() < 0.5 ? 100000 : MAX_MAJOR_AMOUNT * 100));
      const formatted = formatMinorUnits(minor, 'AED');
      expect(parseMajorToMinor(formatted, 'AED')).toBe(minor);
      // Plain decimal string with no separators too.
      const plain = `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
      expect(parseMajorToMinor(plain)).toBe(minor);
    }
  });

  it('matches exact half-up rounding of 3-decimal strings', () => {
    const rnd = makeRng(99);
    for (let i = 0; i < 20000; i++) {
      const thousandths = Math.floor(rnd() * 1e12); // up to AED 1e9 with 3dp
      const s = `${Math.floor(thousandths / 1000)}.${String(thousandths % 1000).padStart(3, '0')}`;
      const expected = Math.floor(thousandths / 10) + (thousandths % 10 >= 5 ? 1 : 0);
      expect(parseMajorToMinor(s)).toBe(expected);
    }
  });
});

describe('formatMinorUnits', () => {
  it('formats integer minor units', () => {
    expect(formatMinorUnits(10000, 'AED')).toBe('AED 100.00');
    expect(formatMinorUnits(125050, 'AED')).toBe('AED 1,250.50');
    expect(formatMinorUnits(-1, 'AED')).toBe('-AED 0.01');
    expect(formatMinorUnits(5, 'USD')).toBe('$0.05');
    expect(formatMinorUnits(BigInt(123456789), 'AED')).toBe('AED 1,234,567.89');
  });

  it('rounds non-integer input instead of producing "AED 0.12.5"', () => {
    expect(formatMinorUnits(12.5, 'AED')).toBe('AED 0.13');
    expect(formatMinorUnits(12.4, 'AED')).toBe('AED 0.12');
    expect(formatMinorUnits(-12.5, 'AED')).toBe('-AED 0.13');
    expect(formatMinorUnits(1 / 3, 'AED')).toBe('AED 0.00');
  });

  it('never shows negative zero', () => {
    expect(formatMinorUnits(-0, 'AED')).toBe('AED 0.00');
    expect(formatMinorUnits(-0.4, 'AED')).toBe('AED 0.00');
  });

  it('shows an em dash for non-finite input', () => {
    expect(formatMinorUnits(NaN, 'AED')).toBe('AED —');
    expect(formatMinorUnits(Infinity, 'AED')).toBe('AED —');
    expect(formatMinorUnits(-Infinity, 'USD')).toBe('$—');
  });

  it('never contains more than one decimal point (fuzz)', () => {
    const rnd = makeRng(3);
    for (let i = 0; i < 5000; i++) {
      const n = (rnd() - 0.5) * 10 ** Math.floor(rnd() * 16);
      const out = formatMinorUnits(n, 'AED');
      expect(out).toMatch(/^-?AED \d{1,3}(,\d{3})*\.\d{2}$/);
    }
  });
});
