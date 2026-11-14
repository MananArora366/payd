/**
 * Pure helpers for recurring bill periods. Used to guard "Post Split Now"
 * against posting the same bill twice in one billing period.
 */
import { RecurringFrequency } from '@/types/database';

export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** ISO-8601 week number and week-year for a date (local time). */
function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day + 3); // Thursday of this week
  const year = d.getFullYear();
  const firstThursday = new Date(year, 0, 4);
  const firstDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return { year, week };
}

/** A key identifying the calendar billing period a date falls in. */
export function getPeriodKey(date: Date, frequency: RecurringFrequency): string {
  if (frequency === 'weekly') {
    const { year, week } = isoWeek(date);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }
  if (frequency === 'yearly') return `${date.getFullYear()}`;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** True when the bill was already posted in the period containing `now`. */
export function isPostedInCurrentPeriod(
  bill: { frequency: RecurringFrequency; last_posted_at?: string | null },
  now: Date = new Date()
): boolean {
  if (!bill.last_posted_at) return false;
  const last = new Date(bill.last_posted_at);
  if (Number.isNaN(last.getTime())) return false;
  return getPeriodKey(last, bill.frequency) === getPeriodKey(now, bill.frequency);
}

/** Human label for the period, e.g. "November 2026", "week 46 of 2026", "2026". */
export function describePeriod(date: Date, frequency: RecurringFrequency): string {
  if (frequency === 'weekly') {
    const { year, week } = isoWeek(date);
    return `week ${week} of ${year}`;
  }
  if (frequency === 'yearly') return `${date.getFullYear()}`;
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Valid due_day range: 1-7 (Mon-Sun) for weekly, 1-31 otherwise. */
export function dueDayRange(frequency: RecurringFrequency): { min: number; max: number } {
  return frequency === 'weekly' ? { min: 1, max: 7 } : { min: 1, max: 31 };
}

export function clampDueDay(day: number, frequency: RecurringFrequency): number {
  const { min, max } = dueDayRange(frequency);
  if (!Number.isFinite(day)) return min;
  return Math.min(max, Math.max(min, Math.round(day)));
}

/** Display string for a bill's due day. */
export function formatDueDay(dueDay: number, frequency: RecurringFrequency): string {
  if (frequency === 'weekly') {
    return `Every ${WEEKDAY_NAMES[clampDueDay(dueDay, 'weekly') - 1]}`;
  }
  const n = clampDueDay(dueDay, frequency);
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return frequency === 'yearly' ? `Yearly on the ${n}${suffix}` : `Due on the ${n}${suffix}`;
}
