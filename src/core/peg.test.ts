import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bottle, RUNS } from './fixtures';
import { derive, isLow, mlLeft, PEG_MAX_ML, PEG_MIN_ML, pegsFrom, pricePerPegCents, SIZE_MAX_ML, valueLeftCents } from './peg';

const size = fc.integer({ min: 1, max: SIZE_MAX_ML });
const peg = fc.integer({ min: PEG_MIN_ML, max: PEG_MAX_ML });
const paid = fc.integer({ min: 0, max: 1_000_000_000_000 });

/** Round half up written a second way, with bigint and no helper: floor((2n + d) / 2d). */
const halfUp = (n: bigint, d: bigint): bigint => (2n * n + d) / (2n * d);

describe('peg maths, worked examples', () => {
  it('a 750 ml bottle at $45.00 with a 30 ml peg holds 25 pegs at $1.80 each', () => {
    const d = derive(bottle('a', { sizeMl: 750, paidCents: 4500, fillPct: 100 }), 30);
    expect(d.pegsFull).toBe(25);
    expect(d.pegsLeft).toBe(25);
    expect(d.pricePerPegCents).toBe(180);
  });

  it('a 700 ml bottle at 40 percent has 280 ml left, which is 9 pegs of 30 ml', () => {
    const d = derive(bottle('a', { sizeMl: 700, fillPct: 40 }), 30);
    expect(d.mlLeft).toBe(280);
    expect(d.pegsLeft).toBe(9);
  });

  it('a part peg is not counted as a peg', () => {
    expect(pegsFrom(29, 30)).toBe(0);
    expect(pegsFrom(30, 30)).toBe(1);
    expect(pegsFrom(59, 30)).toBe(1);
    expect(pegsFrom(60, 30)).toBe(2);
  });

  it('a bigger peg means fewer pegs and a higher price for each', () => {
    const b = bottle('a', { sizeMl: 750, paidCents: 4500, fillPct: 100 });
    expect([30, 45, 60].map((p) => derive(b, p).pegsLeft)).toEqual([25, 16, 12]);
    expect([30, 45, 60].map((p) => derive(b, p).pricePerPegCents)).toEqual([180, 270, 360]);
  });

  it('value left is the share of the price that is still in the bottle', () => {
    expect(valueLeftCents(4500, 750, 375)).toBe(2250);
    expect(derive(bottle('a', { paidCents: 4500, sizeMl: 750, fillPct: 50 }), 30).valueLeftCents).toBe(2250);
  });

  it.each([
    // [paid, size, peg, expected]  halves round up
    [100, 600, 30, 5],
    [1, 2, 5, 3],
    [1, 4, 5, 1],
    [3, 2, 5, 8],
    [0, 750, 30, 0],
    [4999, 750, 30, 200],
    [4987, 750, 30, 199],
  ])('price per peg for %i cents, %i ml, %i ml peg is %i cents', (p, s, g, want) => {
    expect(pricePerPegCents(p, s, g)).toBe(want);
  });

  it.each([
    [750, 0, 0],
    [750, 100, 750],
    [750, 50, 375],
    [1, 50, 1],
    [1, 49, 0],
    [3, 50, 2],
    [1, 100, 1],
    [100_000, 100, 100_000],
    [700, 40, 280],
    [333, 33, 110],
  ])('ml left of a %i ml bottle at %i percent is %i', (s, f, want) => {
    expect(mlLeft(s, f)).toBe(want);
  });

  it('a bottle is low at exactly its threshold, and not one percent above', () => {
    expect(isLow({ fillPct: 20, lowPct: 20 })).toBe(true);
    expect(isLow({ fillPct: 21, lowPct: 20 })).toBe(false);
    expect(isLow({ fillPct: 0, lowPct: 0 })).toBe(true);
    expect(isLow({ fillPct: 1, lowPct: 0 })).toBe(false);
  });

  it('refuses nonsense inputs by returning zero, never NaN', () => {
    expect(mlLeft(0, 50)).toBe(0);
    expect(mlLeft(750, 101)).toBe(0);
    expect(mlLeft(NaN, 50)).toBe(0);
    expect(pricePerPegCents(100, 0, 30)).toBe(0);
    expect(pricePerPegCents(-1, 750, 30)).toBe(0);
    expect(pricePerPegCents(100, 750, 4)).toBe(0);
    expect(pegsFrom(100, 0)).toBe(0);
    expect(pegsFrom(-5, 30)).toBe(0);
    expect(valueLeftCents(100, 750, 751)).toBe(0);
  });
});

describe('peg maths, properties', () => {
  it('price per peg is never NaN, never negative and always a whole number', () => {
    fc.assert(
      fc.property(paid, size, peg, (p, s, g) => {
        const v = pricePerPegCents(p, s, g);
        expect(Number.isSafeInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }),
      RUNS,
    );
  });

  it('price per peg never goes down when the price paid goes up', () => {
    fc.assert(
      fc.property(paid, paid, size, peg, (a, b, s, g) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(pricePerPegCents(lo, s, g)).toBeLessThanOrEqual(pricePerPegCents(hi, s, g));
      }),
      RUNS,
    );
  });

  it('price per peg never goes up when the bottle gets bigger', () => {
    fc.assert(
      fc.property(paid, size, size, peg, (p, a, b, g) => {
        const [small, big] = a <= b ? [a, b] : [b, a];
        expect(pricePerPegCents(p, big, g)).toBeLessThanOrEqual(pricePerPegCents(p, small, g));
      }),
      RUNS,
    );
  });

  it('whole pegs times peg size never exceed the ml left, which never exceeds the bottle', () => {
    fc.assert(
      fc.property(size, fc.integer({ min: 0, max: 100 }), peg, (s, f, g) => {
        const ml = mlLeft(s, f);
        const pegs = pegsFrom(ml, g);
        expect(pegs * g).toBeLessThanOrEqual(ml);
        expect(ml).toBeLessThanOrEqual(s);
        expect(ml - pegs * g).toBeLessThan(g);
      }),
      RUNS,
    );
  });

  it('a full bottle gives the whole size and an empty one gives nothing', () => {
    fc.assert(
      fc.property(size, (s) => {
        expect(mlLeft(s, 100)).toBe(s);
        expect(mlLeft(s, 0)).toBe(0);
      }),
      RUNS,
    );
  });

  it('ml left never goes down when the fill goes up', () => {
    fc.assert(
      fc.property(size, fc.integer({ min: 0, max: 99 }), (s, f) => {
        expect(mlLeft(s, f)).toBeLessThanOrEqual(mlLeft(s, f + 1));
      }),
      RUNS,
    );
  });

  it('rounding half up matches a separate bigint calculation', () => {
    fc.assert(
      fc.property(paid, size, peg, (p, s, g) => {
        expect(pricePerPegCents(p, s, g)).toBe(Number(halfUp(BigInt(p) * BigInt(g), BigInt(s))));
      }),
      RUNS,
    );
    fc.assert(
      fc.property(size, fc.integer({ min: 0, max: 100 }), (s, f) => {
        expect(mlLeft(s, f)).toBe(Number(halfUp(BigInt(s) * BigInt(f), 100n)));
      }),
      RUNS,
    );
  });

  it('value left never exceeds what was paid and is zero for an empty bottle', () => {
    fc.assert(
      fc.property(paid, size, fc.integer({ min: 0, max: 100 }), (p, s, f) => {
        const v = valueLeftCents(p, s, mlLeft(s, f));
        expect(v).toBeLessThanOrEqual(p);
        if (f === 0) expect(v).toBe(0);
        if (f === 100) expect(v).toBe(p);
      }),
      RUNS,
    );
  });

  it('every derived figure of a random bottle is a safe whole number', () => {
    fc.assert(
      fc.property(size, fc.integer({ min: 0, max: 100 }), paid, peg, (s, f, p, g) => {
        const d = derive(bottle('x', { sizeMl: s, fillPct: f, paidCents: p }), g);
        for (const n of [d.mlLeft, d.pegsLeft, d.pegsFull, d.pricePerPegCents, d.valueLeftCents]) {
          expect(Number.isSafeInteger(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(0);
        }
        expect(d.pegsLeft).toBeLessThanOrEqual(d.pegsFull);
      }),
      RUNS,
    );
  });
});
