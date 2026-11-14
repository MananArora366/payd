import { describe, it, expect } from 'vitest';
import {
  extractInviteToken,
  resolveInviteGroup,
  getGroupEmoji,
  sumBalances,
  parseAmountInput,
  computeRouletteWeights,
  pickWeightedIndex,
  filterGroupsForUser,
} from '../groupLogic';
import { Group, GroupMember } from '@/types/database';

const g = (id: string, name: string): Group => ({
  id,
  name,
  description: '',
  currency: 'AED',
  creator_id: 'u1',
  created_at: new Date().toISOString(),
});

const groups = [
  g('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Dubai Flatmates'),
  g('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Hatta Road Trip'),
];

describe('invite tokens', () => {
  it('extracts the token from full URLs, paths and bare tokens', () => {
    expect(extractInviteToken('http://localhost:3000/join/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toBe(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    );
    expect(extractInviteToken('  https://payd.app/join/dubai-marina-2026/?ref=wa#x ')).toBe('dubai-marina-2026');
    expect(extractInviteToken('/join/hatta-camp-2026')).toBe('hatta-camp-2026');
    expect(extractInviteToken('dubai-marina-2026')).toBe('dubai-marina-2026');
    expect(extractInviteToken('')).toBe('');
  });

  it('resolves only exact matches (group id or demo token)', () => {
    expect(resolveInviteGroup('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', groups)?.name).toBe('Dubai Flatmates');
    expect(resolveInviteGroup('dubai-marina-2026', groups)?.name).toBe('Dubai Flatmates');
    expect(resolveInviteGroup('http://x/join/hatta-camp-2026', groups)?.name).toBe('Hatta Road Trip');
    // Previously /join/<anything> previewed the first group
    expect(resolveInviteGroup('anything', groups)).toBeNull();
    expect(resolveInviteGroup('marina', groups)).toBeNull();
    expect(resolveInviteGroup('', groups)).toBeNull();
  });
});

describe('groups', () => {
  it('filters groups to those the user belongs to', () => {
    const members: GroupMember[] = [
      { group_id: groups[0].id, user_id: 'priya', role: 'member', joined_at: '' } as GroupMember,
    ];
    expect(filterGroupsForUser(groups, members, 'priya').map((x) => x.name)).toEqual(['Dubai Flatmates']);
    expect(filterGroupsForUser(groups, members, 'nobody')).toEqual([]);
  });

  it('picks sensible emojis', () => {
    expect(getGroupEmoji('Dubai Flatmates')).toBe('🏙️');
    expect(getGroupEmoji('Hatta Road Trip')).toBe('🏕️');
    expect(getGroupEmoji('Supper Club')).toBe('🍷');
    expect(getGroupEmoji('Random')).toBe('👥');
  });

  it('sums balances', () => {
    expect(sumBalances({ a: 500, b: -300, c: -200 })).toBe(0);
    expect(sumBalances({ a: 500, b: -300 })).toBe(200);
    expect(sumBalances({})).toBe(0);
  });
});

describe('roulette', () => {
  it('validates amounts without throwing', () => {
    expect(parseAmountInput('45.00')).toEqual({ ok: true, value: 4500 });
    expect(parseAmountInput('-5').ok).toBe(false);
    expect(parseAmountInput('0').ok).toBe(false);
    expect(parseAmountInput('').ok).toBe(false);
    expect(parseAmountInput('abc').ok).toBe(false);
    expect(parseAmountInput('1e3').ok).toBe(false);
    expect(parseAmountInput('1.2.3').ok).toBe(false);
    expect(parseAmountInput('1,250.50')).toEqual({ ok: true, value: 125050 });
  });

  it('weights debtors by +1 per AED 25 owed, capped at +10', () => {
    const w = computeRouletteWeights(['a', 'b', 'c', 'd'], { a: -2500, b: 5000, c: -100000 }, 'debt_weighted');
    expect(w.map((x) => x.weight)).toEqual([2, 1, 11, 1]);
    expect(computeRouletteWeights(['a', 'c'], { a: -2500, c: -100000 }, 'equal').map((x) => x.weight)).toEqual([1, 1]);
  });

  it('picks weighted indices across the full range', () => {
    expect(pickWeightedIndex([1, 1], 0)).toBe(0);
    expect(pickWeightedIndex([1, 1], 0.49)).toBe(0);
    expect(pickWeightedIndex([1, 1], 0.5)).toBe(1);
    expect(pickWeightedIndex([1, 3], 0.3)).toBe(1);
    expect(pickWeightedIndex([], 0.3)).toBe(-1);
  });
});
