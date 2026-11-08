import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../core/types';
import { RUNS } from '../core/fixtures';
import { MAX_PER_ROW, MIN_PER_ROW, perRowFor, ROW_H, shelfLayout, nameLines, SLOT_W } from './shelf';
import { liquidTop, SIL_HEIGHT, SIL_WIDTH, SILHOUETTES } from './silhouettes';

describe('how many bottles fit on a shelf', () => {
  it.each([
    [288, 3],
    [320, 3],
    [358, 4],
    [768, 9],
    [828, 9],
    [2000, MAX_PER_ROW],
    [0, MIN_PER_ROW],
    [-50, MIN_PER_ROW],
    [NaN, MIN_PER_ROW],
    [Infinity, MIN_PER_ROW],
  ])('puts %s px of width at %i per shelf', (px, n) => {
    expect(perRowFor(px)).toBe(n);
  });

  it('never gives fewer than 3 or more than 10 (property)', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: false }), (px) => {
        const n = perRowFor(px);
        expect(n).toBeGreaterThanOrEqual(MIN_PER_ROW);
        expect(n).toBeLessThanOrEqual(MAX_PER_ROW);
      }),
      RUNS,
    );
  });
});

describe('the shelf layout', () => {
  it('has no rows for no bottles', () => {
    expect(shelfLayout(0, 4)).toEqual({ slots: [], rows: 0, width: 0, height: 0 });
  });
  it('wraps onto a new shelf after a full row', () => {
    const l = shelfLayout(7, 3);
    expect(l.rows).toBe(3);
    expect(l.slots[3]).toEqual({ row: 1, col: 0, x: 0, y: ROW_H });
    expect(l.slots[6]).toEqual({ row: 2, col: 0, x: 0, y: 2 * ROW_H });
    expect(l.width).toBe(3 * SLOT_W);
    expect(l.height).toBe(3 * ROW_H);
  });
  it('is only as wide as the bottles when there are few', () => {
    expect(shelfLayout(2, 6).width).toBe(2 * SLOT_W);
  });
  it('gives every bottle its own slot inside the drawing (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 200 }), fc.integer({ min: 1, max: 12 }), (n, per) => {
        const l = shelfLayout(n, per);
        expect(l.slots).toHaveLength(n);
        expect(new Set(l.slots.map((s) => `${s.x},${s.y}`)).size).toBe(n);
        for (const s of l.slots) {
          expect(s.x + SLOT_W).toBeLessThanOrEqual(l.width);
          expect(s.y + ROW_H).toBeLessThanOrEqual(l.height);
        }
        expect(l.rows).toBe(Math.ceil(n / per));
      }),
      RUNS,
    );
  });
  it('treats a zero or fractional row length as one', () => {
    expect(shelfLayout(3, 0).rows).toBe(3);
    expect(shelfLayout(3, 1.9).rows).toBe(3);
  });
});

describe('silhouettes', () => {
  it('has one for every category', () => {
    expect(Object.keys(SILHOUETTES).sort()).toEqual([...CATEGORIES].sort());
  });
  it('keeps every body inside the 60 by 130 box', () => {
    for (const c of CATEGORIES) {
      const sil = SILHOUETTES[c];
      expect(sil.bodyTop).toBeGreaterThan(0);
      expect(sil.bodyBottom).toBeLessThanOrEqual(SIL_HEIGHT);
      expect(sil.bodyTop).toBeLessThan(sil.bodyBottom);
      const nums = (sil.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      for (const n of nums) expect(n).toBeGreaterThanOrEqual(0);
      for (const n of nums) expect(n).toBeLessThanOrEqual(Math.max(SIL_WIDTH, SIL_HEIGHT));
    }
  });
  it('gives each category its own shape', () => {
    expect(new Set(CATEGORIES.map((c) => SILHOUETTES[c].d)).size).toBe(CATEGORIES.length);
  });
  it('closes every path and draws only straight and quadratic segments', () => {
    for (const c of CATEGORIES) expect(SILHOUETTES[c].d).toMatch(/^M[\d. ]+[HVLQZ\d. ]+Z$/);
  });
  it('puts the liquid at the bottom when empty and at the top of the body when full', () => {
    const sil = SILHOUETTES.whisky;
    expect(liquidTop(sil, 0)).toBe(sil.bodyBottom);
    expect(liquidTop(sil, 100)).toBe(sil.bodyTop);
    expect(liquidTop(sil, 50)).toBe(sil.bodyBottom - Math.round((sil.bodyBottom - sil.bodyTop) / 2));
  });
  it('clamps a fill that is out of range and treats NaN as empty', () => {
    const sil = SILHOUETTES.gin;
    expect(liquidTop(sil, -20)).toBe(sil.bodyBottom);
    expect(liquidTop(sil, 400)).toBe(sil.bodyTop);
    expect(liquidTop(sil, NaN)).toBe(sil.bodyBottom);
  });
  it('rises as the fill rises, for every category (property)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CATEGORIES), fc.integer({ min: 0, max: 99 }), (c, f) => {
        expect(liquidTop(SILHOUETTES[c], f + 1)).toBeLessThanOrEqual(liquidTop(SILHOUETTES[c], f));
        expect(liquidTop(SILHOUETTES[c], f)).toBeGreaterThanOrEqual(SILHOUETTES[c].bodyTop);
      }),
      RUNS,
    );
  });
});

describe('names under bottles', () => {
  it('drops the SAMPLE prefix to save room', () => expect(nameLines('SAMPLE Gin')).toEqual(['Gin']));
  it('splits a long name at a space over two lines', () => {
    expect(nameLines('SAMPLE Brindlemoor Malt 12')).toEqual(['Brindlemoor', 'Malt 12']);
    expect(nameLines('SAMPLE Brindlemoor Cask Strength')).toEqual(['Brindlemoor', 'Cask Stren…']);
  });
  it('tells the two sample Brindlemoor bottles apart', () => {
    expect(nameLines('SAMPLE Brindlemoor Malt 12')).not.toEqual(nameLines('SAMPLE Brindlemoor Cask Strength'));
  });
  it('keeps a short name whole on one line', () => expect(nameLines('Gin')).toEqual(['Gin']));
  it('counts emoji as one character, not two', () => {
    expect(nameLines('🥃'.repeat(11))).toEqual(['🥃'.repeat(11)]);
    expect(nameLines('🥃'.repeat(40))).toEqual(['🥃'.repeat(11), '🥃'.repeat(10) + '…']);
  });
  it('never gives more than two lines of 11 characters (property)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (name) => {
        const lines = nameLines(name);
        expect(lines.length).toBeLessThanOrEqual(2);
        for (const l of lines) expect([...l].length).toBeLessThanOrEqual(11);
      }),
      RUNS,
    );
  });
});
