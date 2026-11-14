import { describe, it, expect } from 'vitest';
import { validateProfileForm } from './profileForm';

describe('validateProfileForm', () => {
  it('accepts a trimmed name and positive budget', () => {
    const r = validateProfileForm('  Manan  ', '5,000.50');
    expect(r.errors).toEqual({});
    expect(r.budgetMinor).toBe(500050);
  });
  it('rejects empty / whitespace names', () => {
    expect(validateProfileForm('   ', '100').errors.name).toBeTruthy();
  });
  it('rejects blank, zero, negative and malformed budgets', () => {
    for (const b of ['', '0', '-5', '1e3', 'abc', '1.2.3']) {
      expect(validateProfileForm('A', b).errors.budget, b).toBeTruthy();
    }
  });
});
