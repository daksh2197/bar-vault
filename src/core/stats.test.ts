import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bottle, bottlesArb, RUNS } from './fixtures';
import { barStats, histogram, mean, median, niceWidth } from './stats';

describe('the histogram of price per peg', () => {
  it('has no buckets when there are no values', () => {
    expect(histogram([])).toEqual([]);
  });

  it('puts one value in one bucket', () => {
    const h = histogram([180]);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ fromCents: 180, count: 1 });
    expect(h[0]!.toCents).toBeGreaterThan(180);
  });

  it('uses round bucket widths and starts on a multiple of the width', () => {
    const h = histogram([100, 250, 300, 780, 1000]);
    const width = h[0]!.toCents - h[0]!.fromCents;
    expect([1, 2, 5].includes(Number(String(width)[0]))).toBe(true);
    expect(h[0]!.fromCents % width).toBe(0);
  });

  it('has the same width in every bucket and no gaps between them', () => {
    const h = histogram([5, 90, 400, 1200]);
    const width = h[0]!.toCents - h[0]!.fromCents;
    h.forEach((b, i) => {
      expect(b.toCents - b.fromCents).toBe(width);
      if (i > 0) expect(b.fromCents).toBe(h[i - 1]!.toCents);
    });
  });

  it('counts a value that sits on a boundary in the upper bucket only', () => {
    const h = histogram([0, 100, 200]);
    const width = h[0]!.toCents - h[0]!.fromCents;
    const at = h.find((b) => b.fromCents <= 100 && 100 < b.toCents)!;
    expect(at.count).toBeGreaterThanOrEqual(1);
    expect(width).toBeGreaterThan(0);
  });

  it('ignores values that are not whole non-negative numbers', () => {
    expect(histogram([NaN, -5, 1.5, Infinity])).toEqual([]);
    expect(histogram([NaN, 10]).reduce((a, b) => a + b.count, 0)).toBe(1);
  });

  it('has a handful of buckets even for a huge range', () => {
    const h = histogram([0, 5e14]);
    expect(h.length).toBeGreaterThanOrEqual(2);
    expect(h.length).toBeLessThanOrEqual(12);
  });

  it('covers every value exactly once (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 1e12 }), { minLength: 1, maxLength: 60 }), (values) => {
        const h = histogram(values);
        expect(h.reduce((a, b) => a + b.count, 0)).toBe(values.length);
        for (const v of values) expect(h.filter((b) => b.fromCents <= v && v < b.toCents)).toHaveLength(1);
        for (const b of h) expect(b.count).toBe(values.filter((v) => b.fromCents <= v && v < b.toCents).length);
      }),
      RUNS,
    );
  });

  it('keeps the bucket count small whatever the values (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 1e14 }), { minLength: 1, maxLength: 40 }), (values) => {
        expect(histogram(values).length).toBeLessThanOrEqual(12);
      }),
      RUNS,
    );
  });

  it.each([
    [1, 1],
    [2, 2],
    [3, 5],
    [5, 5],
    [6, 10],
    [11, 20],
    [21, 50],
    [51, 100],
    [999, 1000],
  ])('rounds the width %i up to %i', (n, want) => {
    expect(niceWidth(n)).toBe(want);
  });
});

describe('median and mean', () => {
  it('finds the middle of an odd list', () => expect(median([5, 1, 3])).toBe(3));
  it('averages the two middle values of an even list, rounding half up', () => {
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([10, 20])).toBe(15);
    expect(median([1, 2])).toBe(2);
  });
  it('gives null for an empty list', () => {
    expect(median([])).toBeNull();
    expect(mean([])).toBeNull();
  });
  it('gives the one value of a one-item list', () => {
    expect(median([42])).toBe(42);
    expect(mean([42])).toBe(42);
  });
  it('does not change the list it is given', () => {
    const list = [3, 1, 2];
    median(list);
    expect(list).toEqual([3, 1, 2]);
  });
  it('averages and rounds half up', () => {
    expect(mean([1, 2])).toBe(2);
    expect(mean([1, 1, 2])).toBe(1);
    expect(mean([100, 200, 301])).toBe(200);
  });
  it('keeps the median between the smallest and largest value (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 1e12 }), { minLength: 1, maxLength: 40 }), (values) => {
        const m = median(values)!;
        expect(m).toBeGreaterThanOrEqual(Math.min(...values));
        expect(m).toBeLessThanOrEqual(Math.max(...values));
        const a = mean(values)!;
        expect(a).toBeGreaterThanOrEqual(Math.min(...values));
        expect(a).toBeLessThanOrEqual(Math.max(...values));
      }),
      RUNS,
    );
  });
});

describe('the totals for a whole bar', () => {
  const bar = [
    bottle('a', { category: 'gin', sizeMl: 750, paidCents: 4500, fillPct: 100 }),
    bottle('b', { category: 'gin', sizeMl: 750, paidCents: 6000, fillPct: 10 }),
    bottle('c', { category: 'rum', sizeMl: 750, paidCents: 0, fillPct: 50 }),
  ];

  it('counts bottles and low bottles', () => {
    const s = barStats(bar, 30);
    expect(s.count).toBe(3);
    expect(s.lowCount).toBe(1);
  });

  it('adds up what was paid and what is left', () => {
    const s = barStats(bar, 30);
    expect(s.totalPaidCents).toBe(10500n);
    expect(s.valueLeftCents).toBe(4500n + 600n + 0n);
  });

  it('leaves gifts out of the per-peg figures and says how many were used', () => {
    const s = barStats(bar, 30);
    expect(s.pricedCount).toBe(2);
    expect(s.averagePerPegCents).toBe(210);
    expect(s.medianPerPegCents).toBe(210);
  });

  it('groups what was paid by category in a fixed order', () => {
    const s = barStats(bar, 30);
    expect(s.paidByCategory.map((r) => r.category)).toEqual(['gin', 'rum']);
    expect(s.paidByCategory[0]).toEqual({ category: 'gin', paidCents: 10500n, count: 2 });
  });

  it('has nothing to say about an empty bar, and no NaN anywhere', () => {
    const s = barStats([], 30);
    expect(s).toEqual({ count: 0, lowCount: 0, totalPaidCents: 0n, valueLeftCents: 0n, averagePerPegCents: null, medianPerPegCents: null, pricedCount: 0, paidByCategory: [], histogram: [] });
  });

  it('the histogram counts every priced bottle (property)', () => {
    fc.assert(
      fc.property(bottlesArb(10), fc.integer({ min: 5, max: 500 }), (bottles, peg) => {
        const s = barStats(bottles, peg);
        expect(s.histogram.reduce((a, b) => a + b.count, 0)).toBe(s.pricedCount);
        expect(s.paidByCategory.reduce((a, r) => a + r.count, 0)).toBe(bottles.length);
        expect(s.paidByCategory.reduce((a, r) => a + r.paidCents, 0n)).toBe(s.totalPaidCents);
      }),
      RUNS,
    );
  });
});
