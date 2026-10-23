import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bottle, bottlesArb, RUNS } from './fixtures';
import { searchBottles, sortBottles, SORTS } from './list';

const bar = [
  bottle('a', { name: 'Zed', category: 'rum', fillPct: 90, paidCents: 3000, notes: 'Gift from Sam' }),
  bottle('b', { name: 'Abe', category: 'gin', fillPct: 10, paidCents: 9000, boughtWhere: 'Corner Shop' }),
  bottle('c', { name: 'Cal', category: 'gin', fillPct: 50, paidCents: 6000, bottleNumber: '12 of 99' }),
];

describe('ordering the shelf', () => {
  it('by category in the app order, then name', () => {
    expect(sortBottles(bar, 'category', 30).map((b) => b.id)).toEqual(['b', 'c', 'a']);
  });
  it('by fill, emptiest first', () => {
    expect(sortBottles(bar, 'fill', 30).map((b) => b.id)).toEqual(['b', 'c', 'a']);
  });
  it('by price per peg, dearest first', () => {
    expect(sortBottles(bar, 'price', 30).map((b) => b.id)).toEqual(['b', 'c', 'a']);
  });
  it('breaks ties by name, then id', () => {
    const tie = [bottle('2', { name: 'Same' }), bottle('1', { name: 'Same' }), bottle('3', { name: 'Alpha' })];
    expect(sortBottles(tie, 'fill', 30).map((b) => b.id)).toEqual(['3', '1', '2']);
  });
  it.each(SORTS)('does not change the list it is given (%s)', (key) => {
    const copy = [...bar];
    sortBottles(copy, key, 30);
    expect(copy).toEqual(bar);
  });
  it('keeps every bottle exactly once (property)', () => {
    fc.assert(
      fc.property(bottlesArb(10), fc.constantFrom(...SORTS), (bottles, key) => {
        const out = sortBottles(bottles, key, 30);
        expect(out.map((b) => b.id).sort()).toEqual(bottles.map((b) => b.id).sort());
      }),
      RUNS,
    );
  });
});

describe('searching', () => {
  it('matches a name in any case', () => expect(searchBottles(bar, 'zED').map((b) => b.id)).toEqual(['a']));
  it('matches a category by its label', () => expect(searchBottles(bar, 'gin').map((b) => b.id)).toEqual(['b', 'c']));
  it('matches where it was bought, the notes and the bottle number', () => {
    expect(searchBottles(bar, 'corner').map((b) => b.id)).toEqual(['b']);
    expect(searchBottles(bar, 'sam').map((b) => b.id)).toEqual(['a']);
    expect(searchBottles(bar, '12 of').map((b) => b.id)).toEqual(['c']);
  });
  it('treats a blank search as everything', () => {
    expect(searchBottles(bar, '   ')).toHaveLength(3);
    expect(searchBottles(bar, '')).toHaveLength(3);
  });
  it('returns nothing when nothing matches', () => expect(searchBottles(bar, 'xyzzy')).toEqual([]));
  it('treats symbols as plain text, not a pattern', () => {
    expect(searchBottles(bar, '.*')).toEqual([]);
    expect(searchBottles([bottle('q', { name: 'a.b (c)' })], '.b (')).toHaveLength(1);
  });
});
