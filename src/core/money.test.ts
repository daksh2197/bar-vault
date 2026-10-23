// Adapted from coin-vault (MIT, Daksh Dua)
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { centsToPlain, formatCents, MAX_CENTS, parseCents, parseWhole } from './money';
import { RUNS } from './fixtures';

describe('reading money', () => {
  it.each([
    ['1234.5', 123450],
    ['0.05', 5],
    ['.5', 50],
    ['5.', 500],
    ['0', 0],
    [' 12 ', 1200],
    ['10000000000', 1_000_000_000_000],
  ])('reads %j as %i cents', (text, cents) => {
    expect(parseCents(text, { allowZero: true })).toEqual({ ok: true, value: cents });
  });

  it.each(['0.005', '12.345', '-1', '1e3', 'NaN', 'Infinity', '', '1/2', '$5', '5 dollars', '99999999999', '10000000000.01', '1,000.00'])('refuses %j', (text) => {
    expect(parseCents(text, { allowZero: true }).ok).toBe(false);
  });

  it('refuses zero when zero is not allowed', () => {
    expect(parseCents('0', { allowZero: false }).ok).toBe(false);
    expect(parseCents('0.00', { allowZero: false }).ok).toBe(false);
    expect(parseCents('0.01', { allowZero: false }).ok).toBe(true);
  });

  it('refuses a minus sign of every kind', () => {
    for (const minus of ['-', '−', '‒', '–']) expect(parseCents(`${minus}5`, { allowZero: true }).ok).toBe(false);
  });

  it('reads whole numbers strictly', () => {
    expect(parseWhole('42', 1, 100, 'Size')).toEqual({ ok: true, value: 42 });
    expect(parseWhole('1.5', 1, 100, 'Size')).toEqual({ ok: false, error: 'Size must be a whole number.' });
    expect(parseWhole('0', 1, 100, 'Size')).toEqual({ ok: false, error: 'Size must be at least 1.' });
    expect(parseWhole('1000000', 1, 100000, 'Size')).toEqual({ ok: false, error: 'Size cannot be above 100,000.' });
    expect(parseWhole('abc', 1, 100, 'Size').ok).toBe(false);
  });
});

describe('writing money', () => {
  it.each([
    [0n, '$0.00'],
    [5n, '$0.05'],
    [4500n, '$45.00'],
    [123456n, '$1,234.56'],
    [100000000n, '$1,000,000.00'],
    [-500n, '−$5.00'],
    [-1n, '−$0.01'],
  ])('writes %s cents as %s', (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });

  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [4500, '45.00'],
    [123456, '1234.56'],
  ])('writes %i cents as the plain %s', (cents, text) => {
    expect(centsToPlain(cents)).toBe(text);
  });

  it('never writes -0, NaN or undefined', () => {
    for (const c of [0n, -0n, 1n]) expect(formatCents(c)).not.toMatch(/-0|NaN|undefined/);
  });

  it('reads back what it writes (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_CENTS }), (cents) => {
        expect(parseCents(centsToPlain(cents), { allowZero: true })).toEqual({ ok: true, value: cents });
        expect(formatCents(BigInt(cents)).replace(/[$,]/g, '')).toBe(centsToPlain(cents));
      }),
      RUNS,
    );
  });
});
