'use client';

import { usePayd } from '@/lib/store/PaydContext';
import { Group } from '@/types/database';

/** Groups the current user belongs to (membership-filtered by PaydContext). */
export function useVisibleGroups(): Group[] {
  return usePayd().visibleGroups;
}
