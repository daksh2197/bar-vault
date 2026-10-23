// Adapted from coin-vault (MIT, Daksh Dua)
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blankInput, bottleToInput, buildBottle, buildSettings, type BottleInput, confirmsWipe, WIPE_WORD } from './form';
import { bottleArb, NOW, RUNS } from './fixtures';
import { DEFAULT_SETTINGS } from './types';

const TODAY = '2026-10-23';
const good: BottleInput = {
  ...blankInput(DEFAULT_SETTINGS),
  name: ' Dry gin ',
  category: 'gin',
  size: '750',
  fill: '80',
  paid: '45.00',
  boughtWhere: 'Corner shop',
  boughtOn: '2026-10-01',
  rarity: 'common',
  notes: 'a note',
};
const build = (over: Partial<BottleInput> = {}) => buildBottle({ ...good, ...over }, 'abc', NOW, TODAY);
const errorsOf = (over: Partial<BottleInput>) => {
  const r = build(over);
  return r.ok ? {} : r.errors;
};

describe('the add-a-bottle form', () => {
  it('turns typed text into a checked bottle', () => {
    expect(build()).toEqual({
      ok: true,
      value: {
        id: 'abc',
        name: 'Dry gin',
        category: 'gin',
        sizeMl: 750,
        fillPct: 80,
        paidCents: 4500,
        boughtWhere: 'Corner shop',
        boughtOn: '2026-10-01',
        limited: false,
        rarity: 'common',
        watch: false,
        lowPct: 20,
        notes: 'a note',
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    });
  });

  it('starts a new form at 750 ml, full, with the owner\'s default threshold', () => {
    const blank = blankInput({ pegMl: 30, defaultLowPct: 35 });
    expect(blank).toMatchObject({ size: '750', fill: '100', lowPct: '35', rarity: 'common', category: 'whisky' });
  });

  it('reports every bad field at once, with a message for each', () => {
    const errs = errorsOf({ name: '', category: 'beer', size: '0', fill: '101', paid: '-5', boughtOn: '2026-02-30', rarity: 'mythic', lowPct: 'x' });
    expect(Object.keys(errs).sort()).toEqual(['boughtOn', 'category', 'fill', 'lowPct', 'name', 'paid', 'rarity', 'size']);
  });

  it.each([
    ['', 'size'],
    ['0', 'size'],
    ['-1', 'size'],
    ['1e23', 'size'],
    ['100001', 'size'],
    ['75.5', 'size'],
    ['abc', 'size'],
    ['1,000', 'size'],
    ['٧٥٠', 'size'],
  ])('refuses the size %j', (size, field) => {
    expect(errorsOf({ size })).toHaveProperty(field);
  });

  it.each(['1', '750', '1000', '100000'])('accepts the size %j', (size) => {
    expect(build({ size }).ok).toBe(true);
  });

  it.each(['-5', 'abc', '1e3', '12.345', '', '99999999999', '$5'])('refuses the price %j', (paid) => {
    expect(errorsOf({ paid })).toHaveProperty('paid');
  });

  it.each([
    ['0', 0],
    ['0.5', 50],
    ['45', 4500],
    ['45.5', 4550],
    ['1234.56', 123456],
  ])('reads the price %j as %i cents', (paid, cents) => {
    const r = build({ paid });
    expect(r.ok && r.value.paidCents).toBe(cents);
  });

  it.each(['-1', '101', '50.5', '', 'half'])('refuses the fill %j', (fill) => {
    expect(errorsOf({ fill })).toHaveProperty('fill');
  });

  it.each(['0', '100', '33'])('accepts the fill %j', (fill) => {
    expect(build({ fill }).ok).toBe(true);
  });

  it('accepts a gift paid nothing, and rejects a purchase date in the future', () => {
    expect(build({ paid: '0' }).ok).toBe(true);
    expect(errorsOf({ boughtOn: '2026-10-24' })).toHaveProperty('boughtOn');
    expect(errorsOf({ boughtOn: '2026-10-23' })).toEqual({});
  });

  it('leaves optional fields out rather than saving blanks', () => {
    const r = build({ boughtWhere: '', boughtOn: '', bottleNumber: '', watchNote: '', notes: '', marketAmount: '', marketSource: '', marketDate: '' });
    expect(r.ok && Object.keys(r.value).sort()).toEqual(['category', 'createdAt', 'fillPct', 'id', 'limited', 'lowPct', 'name', 'paidCents', 'rarity', 'sizeMl', 'updatedAt', 'watch']);
  });

  it('keeps the limited flag, bottle number and rarity', () => {
    const r = build({ limited: true, bottleNumber: ' 214 of 1,000 ', rarity: 'numbered' });
    expect(r.ok && r.value).toMatchObject({ limited: true, bottleNumber: '214 of 1,000', rarity: 'numbered' });
  });

  it('keeps the watch flag and note', () => {
    const r = build({ watch: true, watchNote: 'cheaper on Oct 20' });
    expect(r.ok && r.value).toMatchObject({ watch: true, watchNote: 'cheaper on Oct 20' });
  });

  it.each([
    ['name', 121],
    ['boughtWhere', 201],
    ['bottleNumber', 41],
    ['watchNote', 501],
    ['notes', 2001],
    ['marketSource', 201],
  ] as const)('refuses a %s of %i characters', (field, n) => {
    const extra = field === 'marketSource' ? { marketAmount: '10' } : {};
    expect(errorsOf({ ...extra, [field]: 'x'.repeat(n) })).toHaveProperty(field);
  });

  it('handles emoji and other scripts in a name', () => {
    const r = build({ name: '🥃 शराब שלום' });
    expect(r.ok && r.value.name).toBe('🥃 शराब שלום');
  });

  it('keeps the original creation time when editing, and moves updatedAt', () => {
    const later = new Date('2026-11-01T00:00:00.000Z');
    const r = buildBottle(good, 'abc', later, '2026-11-01', { createdAt: '2026-10-01T00:00:00.000Z' });
    expect(r.ok && r.value.createdAt).toBe('2026-10-01T00:00:00.000Z');
    expect(r.ok && r.value.updatedAt).toBe(later.toISOString());
  });

  it('keeps the sample flag on an edited sample bottle', () => {
    const r = buildBottle(good, 'abc', NOW, TODAY, { createdAt: NOW.toISOString(), sample: true });
    expect(r.ok && r.value.sample).toBe(true);
  });

  it('shows a bottle back exactly as it can be saved again (property)', () => {
    fc.assert(
      fc.property(bottleArb, (b) => {
        const input = bottleToInput(b);
        // Dates in the random data may be after TODAY, so let "today" be far ahead.
        const again = buildBottle(input, b.id, new Date(b.updatedAt), '2999-01-01', b);
        expect(again).toEqual({ ok: true, value: b });
      }),
      RUNS,
    );
  });
});

describe('the market reference', () => {
  it('is three typed fields and is saved when the amount is there', () => {
    const r = build({ marketAmount: '260.00', marketSource: 'Sample auction note', marketDate: '2026-10-20' });
    expect(r.ok && r.value.market).toEqual({ amountCents: 26000, source: 'Sample auction note', date: '2026-10-20' });
  });
  it('needs the amount if the source or date is filled', () => {
    expect(errorsOf({ marketSource: 'somewhere' })).toHaveProperty('marketAmount');
    expect(errorsOf({ marketDate: '2026-10-20' })).toHaveProperty('marketAmount');
  });
  it('refuses a zero, negative or future market reference', () => {
    expect(errorsOf({ marketAmount: '0' })).toHaveProperty('marketAmount');
    expect(errorsOf({ marketAmount: '-3' })).toHaveProperty('marketAmount');
    expect(errorsOf({ marketAmount: '5', marketDate: '2027-01-01' })).toHaveProperty('marketDate');
  });
  it('is left out when all three are blank', () => {
    const r = build();
    expect(r.ok && r.value.market).toBeUndefined();
  });
});

describe('the settings form', () => {
  it('reads a peg size and a threshold', () => {
    expect(buildSettings('45', '25')).toEqual({ ok: true, value: { pegMl: 45, defaultLowPct: 25 } });
  });
  it.each(['4', '501', '0', '-30', '30.5', 'abc', '', '1e2'])('refuses the peg size %j', (peg) => {
    const r = buildSettings(peg, '20');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.pegMl).toBeTruthy();
  });
  it.each(['5', '500', '30', '60', '45'])('accepts the peg size %j', (peg) => expect(buildSettings(peg, '20').ok).toBe(true));
  it.each(['-1', '101', 'x', ''])('refuses the threshold %j', (low) => {
    const r = buildSettings('30', low);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.defaultLowPct).toBeTruthy();
  });
  it('reports both problems at once', () => {
    const r = buildSettings('x', 'y');
    expect(!r.ok && Object.keys(r.errors)).toEqual(['pegMl', 'defaultLowPct']);
  });
});

describe('the wipe confirmation', () => {
  it('needs the exact word, in any case, with spaces ignored', () => {
    expect(confirmsWipe(WIPE_WORD).ok).toBe(true);
    expect(confirmsWipe('  WIPE ').ok).toBe(true);
    for (const t of ['', 'wip', 'wipe it', 'yes', 'delete']) expect(confirmsWipe(t).ok, t).toBe(false);
  });
});
