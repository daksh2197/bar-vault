/** Shared by the tests only: a plain bottle and a random-bottle generator for property tests. */

import fc from 'fast-check';
import { MAX_CENTS } from './money';
import { type Bottle, CATEGORIES, RARITIES } from './types';

export const NOW = new Date('2026-10-23T12:00:00.000Z');
export const STAMP = NOW.toISOString();

export const bottle = (id: string, over: Partial<Bottle> = {}): Bottle => ({
  id,
  name: `Bottle ${id}`,
  category: 'gin',
  sizeMl: 750,
  fillPct: 50,
  paidCents: 4500,
  limited: false,
  rarity: 'common',
  watch: false,
  lowPct: 20,
  createdAt: STAMP,
  updatedAt: STAMP,
  ...over,
});

const text = (max: number): fc.Arbitrary<string> => fc.string({ maxLength: max }).filter((s) => s.trim().length > 0 && s.trim().length <= max);
const optText = (max: number): fc.Arbitrary<string | undefined> => fc.option(fc.string({ maxLength: max }).map((s) => s.trim()).filter((s) => s !== ''), { nil: undefined });
const isoDay = fc.integer({ min: 0, max: 20_000 }).map((n) => new Date(Date.UTC(2000, 0, 1) + n * 86_400_000).toISOString().slice(0, 10));
const stamp = fc.integer({ min: 0, max: 20_000 * 86_400 }).map((s) => new Date(Date.UTC(2000, 0, 1) + s * 1000).toISOString());

export const bottleArb: fc.Arbitrary<Bottle> = fc
  .record({
    id: fc.stringMatching(/^[a-z0-9-]{1,40}$/),
    name: text(120),
    category: fc.constantFrom(...CATEGORIES),
    sizeMl: fc.integer({ min: 1, max: 100_000 }),
    fillPct: fc.integer({ min: 0, max: 100 }),
    paidCents: fc.integer({ min: 0, max: MAX_CENTS }),
    limited: fc.boolean(),
    rarity: fc.constantFrom(...RARITIES),
    watch: fc.boolean(),
    lowPct: fc.integer({ min: 0, max: 100 }),
    createdAt: stamp,
    updatedAt: stamp,
    boughtWhere: optText(200),
    boughtOn: fc.option(isoDay, { nil: undefined }),
    bottleNumber: optText(40),
    watchNote: optText(500),
    notes: optText(2000),
    market: fc.option(
      fc.record({ amountCents: fc.integer({ min: 1, max: MAX_CENTS }), source: optText(200), date: fc.option(isoDay, { nil: undefined }) }).map((m) => {
        const out: NonNullable<Bottle['market']> = { amountCents: m.amountCents };
        if (m.source) out.source = m.source;
        if (m.date) out.date = m.date;
        return out;
      }),
      { nil: undefined },
    ),
  })
  .map((r) => {
    const out: Bottle = { id: r.id, name: r.name.trim(), category: r.category, sizeMl: r.sizeMl, fillPct: r.fillPct, paidCents: r.paidCents, limited: r.limited, rarity: r.rarity, watch: r.watch, lowPct: r.lowPct, createdAt: r.createdAt, updatedAt: r.updatedAt };
    if (r.boughtWhere) out.boughtWhere = r.boughtWhere;
    if (r.boughtOn) out.boughtOn = r.boughtOn;
    if (r.bottleNumber) out.bottleNumber = r.bottleNumber;
    if (r.watchNote) out.watchNote = r.watchNote;
    if (r.notes) out.notes = r.notes;
    if (r.market) out.market = r.market;
    return out;
  });

/** A list of bottles with distinct ids. */
export const bottlesArb = (max = 8): fc.Arbitrary<Bottle[]> =>
  fc.array(bottleArb, { maxLength: max }).map((list) => {
    const seen = new Set<string>();
    return list.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)));
  });

/** A tiny but valid JPEG-looking byte string. The app only checks the first three bytes. */
export const jpegBytes = (n = 20, seed = 1): Uint8Array => {
  const out = new Uint8Array(Math.max(5, n));
  out.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let i = 4; i < out.length; i += 1) out[i] = (i * 31 + seed) % 256;
  return out;
};

export const RUNS = { numRuns: 300 } as const;
