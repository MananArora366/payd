import { describe, it, expect } from 'vitest';
import { buildNewSplit, previewNewSplit, remainingForMethod, type NewSplitDraft } from './newSplitLogic';

const names: Record<string, string> = { a: 'Alice', b: 'Bob', c: 'Cara' };
const nameOf = (id: string) => names[id] ?? id;

const draft = (over: Partial<NewSplitDraft> = {}): NewSplitDraft => ({
  title: 'Dinner',
  amountInput: '100.00',
  payerId: 'a',
  groupId: 'g1',
  participantIds: ['a', 'b', 'c'],
  method: 'equal',
  values: {},
  ...over,
});

const sumSplits = (splits: { share_minor: number }[]) => splits.reduce((s, x) => s + x.share_minor, 0);

function expectError(d: NewSplitDraft, pattern: RegExp) {
  const r = buildNewSplit(d, nameOf);
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.error).toMatch(pattern);
    expect(r.error).not.toMatch(/invariant|minor units/i);
  }
}

describe('buildNewSplit: output shape', () => {
  it('builds a full transaction input', () => {
    const r = buildNewSplit(
      draft({ title: '  Dinner  ', notes: '  at Zuma ', categoryId: 'food', amountInput: '120.50', participantIds: ['a', 'b'] }),
      nameOf
    );
    expect(r).toEqual({
      ok: true,
      input: {
        type: 'expense',
        title: 'Dinner',
        amount_minor: 12050,
        currency: 'AED',
        payer_id: 'a',
        group_id: 'g1',
        category_id: 'food',
        notes: 'at Zuma',
        splits: [
          { user_id: 'a', share_minor: 6025 },
          { user_id: 'b', share_minor: 6025 },
        ],
      },
    });
  });

  it('defaults optional fields to null', () => {
    const r = buildNewSplit(draft({ groupId: null, notes: '   ' }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.group_id).toBeNull();
      expect(r.input.category_id).toBeNull();
      expect(r.input.notes).toBeNull();
    }
  });

  it('allows the payer to not be a participant', () => {
    const r = buildNewSplit(draft({ participantIds: ['b'] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.splits).toEqual([{ user_id: 'b', share_minor: 10000 }]);
  });

  it('dedupes participants', () => {
    const r = buildNewSplit(draft({ participantIds: ['a', 'b', 'b', 'a'] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.splits.map((s) => s.user_id)).toEqual(['a', 'b']);
      expect(sumSplits(r.input.splits)).toBe(10000);
    }
  });
});

describe('buildNewSplit: equal', () => {
  it('splits 100.00 three ways and sums exactly', () => {
    const r = buildNewSplit(draft());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(sumSplits(r.input.splits)).toBe(10000);
      expect(r.input.splits.map((s) => s.share_minor).sort()).toEqual([3333, 3333, 3334]);
    }
  });

  it('rejects an amount too small for everyone to owe something', () => {
    expectError(draft({ amountInput: '0.02' }), /too small to split between 3 people/);
  });

  it('ignores values', () => {
    const r = buildNewSplit(draft({ values: { a: 'junk' } }));
    expect(r.ok).toBe(true);
  });
});

describe('buildNewSplit: exact', () => {
  it('accepts amounts that sum to the total', () => {
    const r = buildNewSplit(draft({ method: 'exact', values: { a: '50', b: '30.25', c: '19.75' } }), nameOf);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.splits).toEqual([
        { user_id: 'a', share_minor: 5000 },
        { user_id: 'b', share_minor: 3025 },
        { user_id: 'c', share_minor: 1975 },
      ]);
    }
  });

  it('says how much is short', () => {
    expectError(draft({ method: 'exact', values: { a: '50', b: '30', c: '10' } }), /short by .*10\.00/);
  });

  it('says how much is over', () => {
    expectError(draft({ method: 'exact', values: { a: '50', b: '30', c: '20.01' } }), /over by .*0\.01/);
  });

  it('names the person with a missing amount', () => {
    expectError(draft({ method: 'exact', values: { a: '50', b: '50' } }), /Enter an amount for Cara/);
  });

  it('rejects invalid per-person amounts', () => {
    expectError(draft({ method: 'exact', values: { a: '50', b: 'abc', c: '50' } }), /valid amount for Bob/);
    expectError(draft({ method: 'exact', values: { a: '50', b: '-1', c: '51' } }), /Bob/);
    expectError(draft({ method: 'exact', values: { a: '50', b: '49.999', c: '0.001' } }), /decimal places/);
  });

  it('rejects a zero amount for a participant', () => {
    expectError(draft({ method: 'exact', values: { a: '100', b: '0', c: '0' } }), /Bob/);
  });
});

describe('buildNewSplit: percentage', () => {
  it('splits by percent', () => {
    const r = buildNewSplit(draft({ method: 'percentage', values: { a: '50', b: '25', c: '25' } }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.splits.map((s) => s.share_minor)).toEqual([5000, 2500, 2500]);
  });

  it('accepts 33.33 x 3 within tolerance and sums exactly', () => {
    const r = buildNewSplit(draft({ method: 'percentage', values: { a: '33.33', b: '33.33', c: '33.33' } }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(sumSplits(r.input.splits)).toBe(10000);
  });

  it('accepts sums right at the tolerance boundary', () => {
    expect(buildNewSplit(draft({ method: 'percentage', values: { a: '49.85', b: '50', c: '0' } })).ok).toBe(true);
    expectError(draft({ method: 'percentage', values: { a: '49.84', b: '50', c: '0' } }), /99\.84%/);
  });

  it('rejects percentages that do not sum to 100', () => {
    expectError(draft({ method: 'percentage', values: { a: '50', b: '30', c: '10' } }), /add up to 90%.*100%/);
    expectError(draft({ method: 'percentage', values: { a: '50', b: '50', c: '10' } }), /110%/);
  });

  it('drops participants with 0%', () => {
    const r = buildNewSplit(draft({ method: 'percentage', values: { a: '60', b: '40', c: '0' } }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.splits).toEqual([
        { user_id: 'a', share_minor: 6000 },
        { user_id: 'b', share_minor: 4000 },
      ]);
    }
  });

  it('rejects when only the payer is left after dropping zeros', () => {
    expectError(draft({ method: 'percentage', values: { a: '100', b: '0', c: '0' } }), /only yourself/);
  });

  it('rejects invalid or missing percentages with names', () => {
    expectError(draft({ method: 'percentage', values: { a: '50', b: '-50', c: '100' } }), /Bob/);
    expectError(draft({ method: 'percentage', values: { a: '50', b: '50%', c: '0' } }), /Bob/);
    expectError(draft({ method: 'percentage', values: { a: '50', b: '1e2', c: '0' } }), /Bob/);
    expectError(draft({ method: 'percentage', values: { a: '50', b: '50' } }), /percentage for Cara/);
  });

  it('errors when a non-zero percentage rounds to a zero share', () => {
    expectError(
      draft({ amountInput: '0.10', method: 'percentage', values: { a: '99.9', b: '0.1', c: '0' } }),
      /Bob would owe nothing/
    );
  });
});

describe('buildNewSplit: shares', () => {
  it('splits by share counts', () => {
    const r = buildNewSplit(draft({ method: 'shares', values: { a: '2', b: '1', c: '1' } }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.splits.map((s) => s.share_minor)).toEqual([5000, 2500, 2500]);
  });

  it('supports fractional shares (splitShares supports them) and sums exactly', () => {
    const r = buildNewSplit(draft({ method: 'shares', values: { a: '1.5', b: '1', c: '1' } }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(sumSplits(r.input.splits)).toBe(10000);
      expect(r.input.splits[0].share_minor).toBe(4286);
    }
  });

  it('equal shares on 100.00 three ways sums exactly', () => {
    const r = buildNewSplit(draft({ method: 'shares', values: { a: '1', b: '1', c: '1' } }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(sumSplits(r.input.splits)).toBe(10000);
  });

  it('drops participants with 0 shares', () => {
    const r = buildNewSplit(draft({ method: 'shares', values: { a: '1', b: '0', c: '3' } }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.splits.map((s) => s.user_id)).toEqual(['a', 'c']);
  });

  it('rejects all-zero shares', () => {
    expectError(draft({ method: 'shares', values: { a: '0', b: '0', c: '0' } }), /more than 0 shares/);
  });

  it('rejects negative, invalid or missing shares', () => {
    expectError(draft({ method: 'shares', values: { a: '1', b: '-1', c: '1' } }), /Bob/);
    expectError(draft({ method: 'shares', values: { a: '1', b: 'two', c: '1' } }), /Bob/);
    expectError(draft({ method: 'shares', values: { a: '1', b: '1' } }), /shares for Cara/);
    expectError(draft({ method: 'shares', values: { a: '1', b: '1.0000001', c: '1' } }), /decimal places/);
  });

  it('errors when a tiny share rounds to zero', () => {
    expectError(draft({ amountInput: '0.05', method: 'shares', values: { a: '100', b: '1', c: '0' } }), /Bob would owe nothing/);
  });
});

describe('buildNewSplit: general validation', () => {
  it('requires a title', () => {
    expectError(draft({ title: '' }), /name/);
    expectError(draft({ title: '   ' }), /name/);
  });

  it.each(['', '0', '0.00', 'abc', '-5', '1.234', '1e3'])('rejects amount %j', (amountInput) => {
    expectError(draft({ amountInput }), /amount|decimal/);
  });

  it('requires at least 2 people involved', () => {
    expectError(draft({ participantIds: ['a'] }), /only yourself/);
    expectError(draft({ participantIds: ['a', 'a'] }), /only yourself/);
  });

  it('requires at least one participant', () => {
    expectError(draft({ participantIds: [] }), /at least one person/);
  });

  it('requires a payer', () => {
    expectError(draft({ payerId: '' }), /who paid/);
  });

  it('never throws on garbage input', () => {
    const bad = { title: 'x', amountInput: undefined, payerId: 'a', groupId: null, participantIds: undefined, method: 'weird', values: undefined } as unknown as NewSplitDraft;
    expect(() => buildNewSplit(bad)).not.toThrow();
    expect(buildNewSplit(bad).ok).toBe(false);
    expect(buildNewSplit({ ...draft(), method: 'weird' as never }).ok).toBe(false);
  });

  it('uses user ids in messages when nameOf is omitted', () => {
    const r = buildNewSplit(draft({ method: 'exact', values: { a: '50', b: '50' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/for c\b/);
  });
});

describe('previewNewSplit', () => {
  it('previews equal shares', () => {
    expect(previewNewSplit(draft())).toEqual({ a: 3334, b: 3333, c: 3333 });
  });

  it('previews even without a title', () => {
    expect(previewNewSplit(draft({ title: '', participantIds: ['a', 'b'] }))).toEqual({ a: 5000, b: 5000 });
  });

  it('previews percentage and shares, omitting zero-weight people', () => {
    expect(previewNewSplit(draft({ method: 'percentage', values: { a: '70', b: '30', c: '0' } }))).toEqual({ a: 7000, b: 3000 });
    expect(previewNewSplit(draft({ method: 'shares', values: { a: '3', b: '1', c: '0' } }))).toEqual({ a: 7500, b: 2500 });
  });

  it('returns {} for partial or invalid input', () => {
    expect(previewNewSplit(draft({ amountInput: '' }))).toEqual({});
    expect(previewNewSplit(draft({ amountInput: 'abc' }))).toEqual({});
    expect(previewNewSplit(draft({ participantIds: [] }))).toEqual({});
    expect(previewNewSplit(draft({ method: 'exact', values: { a: '50' } }))).toEqual({});
    expect(previewNewSplit(draft({ method: 'exact', values: { a: '50', b: '20', c: '20' } }))).toEqual({});
    expect(previewNewSplit(draft({ method: 'percentage', values: { a: '50', b: '20', c: '20' } }))).toEqual({});
    expect(previewNewSplit(draft({ method: 'shares', values: { a: '1', b: 'x', c: '1' } }))).toEqual({});
    expect(previewNewSplit(draft({ amountInput: '0.02' }))).toEqual({});
  });

  it('never throws', () => {
    expect(() => previewNewSplit({} as NewSplitDraft)).not.toThrow();
    expect(previewNewSplit({} as NewSplitDraft)).toEqual({});
  });
});

describe('remainingForMethod', () => {
  it('returns null for equal and shares', () => {
    expect(remainingForMethod(draft())).toBeNull();
    expect(remainingForMethod(draft({ method: 'shares', values: { a: '1' } }))).toBeNull();
  });

  it('exact: total minus entered, ignoring invalid entries', () => {
    expect(remainingForMethod(draft({ method: 'exact', values: { a: '40', b: '10.50' } }))).toEqual({ kind: 'amount', value: 4950 });
    expect(remainingForMethod(draft({ method: 'exact', values: { a: '40', b: 'abc' } }))).toEqual({ kind: 'amount', value: 6000 });
    expect(remainingForMethod(draft({ method: 'exact', values: { a: '60', b: '50' } }))).toEqual({ kind: 'amount', value: -1000 });
    expect(remainingForMethod(draft({ method: 'exact', values: { a: '50', b: '50' } }))).toEqual({ kind: 'amount', value: 0 });
  });

  it('exact: ignores values for non-participants and handles missing total', () => {
    expect(remainingForMethod(draft({ method: 'exact', values: { a: '40', z: '60' } }))).toEqual({ kind: 'amount', value: 6000 });
    expect(remainingForMethod(draft({ method: 'exact', amountInput: '', values: { a: '10' } }))).toEqual({ kind: 'amount', value: -1000 });
  });

  it('percentage: 100 minus sum without float noise', () => {
    expect(remainingForMethod(draft({ method: 'percentage', values: { a: '50', b: '25' } }))).toEqual({ kind: 'percent', value: 25 });
    expect(remainingForMethod(draft({ method: 'percentage', values: { a: '33.33', b: '33.33', c: '33.33' } }))).toEqual({
      kind: 'percent',
      value: 0.01,
    });
    expect(remainingForMethod(draft({ method: 'percentage', values: { a: '70', b: '40' } }))).toEqual({ kind: 'percent', value: -10 });
    expect(remainingForMethod(draft({ method: 'percentage', values: {} }))).toEqual({ kind: 'percent', value: 100 });
  });
});
