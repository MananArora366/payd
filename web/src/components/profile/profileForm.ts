import { tryParseMajorToMinor } from '@/lib/ledger/currency';

// Payd's ledger is AED-only for now (see README); multi-currency is not supported yet.
export const LEDGER_CURRENCY = 'AED';

/** Validates the profile form. Returns field errors (empty object when valid) and the parsed budget. */
export function validateProfileForm(
  name: string,
  budgetMajor: string
): { errors: { name?: string; budget?: string }; budgetMinor: number } {
  const errors: { name?: string; budget?: string } = {};
  const trimmed = name.trim();
  if (!trimmed) errors.name = 'Please enter a display name.';
  else if (trimmed.length > 60) errors.name = 'Display name must be 60 characters or fewer.';

  let budgetMinor = 0;
  const parsed = tryParseMajorToMinor(budgetMajor, LEDGER_CURRENCY);
  if (!parsed.ok) {
    errors.budget = budgetMajor.trim() ? parsed.error : 'Please enter a monthly budget.';
  } else if (parsed.value <= 0) {
    errors.budget = 'Your monthly budget must be more than AED 0.';
  } else {
    budgetMinor = parsed.value;
  }
  return { errors, budgetMinor };
}
