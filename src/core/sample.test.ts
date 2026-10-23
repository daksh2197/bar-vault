import { describe, expect, it } from 'vitest';
import { barCsv } from './exports';
import { NOW } from './fixtures';
import { sampleBottles, SAMPLE_LABEL } from './sample';
import { sanitizeBottle } from './schema';
import { barStats } from './stats';
import { lowBottles } from './restock';

const bar = sampleBottles(NOW);

describe('the invented sample bar', () => {
  it('has eleven bottles', () => expect(bar).toHaveLength(11));
  it('flags every bottle as sample and starts every name with SAMPLE', () => {
    for (const b of bar) {
      expect(b.sample).toBe(true);
      expect(b.name.startsWith('SAMPLE ')).toBe(true);
    }
  });
  it('passes the same checks as anything else that comes from outside', () => {
    for (const b of bar) expect(sanitizeBottle(b)).toEqual({ ok: true, value: b });
  });
  it('has unique ids', () => expect(new Set(bar.map((b) => b.id)).size).toBe(11));
  it('uses the label the page shows', () => expect(SAMPLE_LABEL).toBe('Invented sample bar, not a real one'));
  it('covers most categories, a limited bottle, a watched bottle and some low bottles', () => {
    expect(new Set(bar.map((b) => b.category)).size).toBeGreaterThanOrEqual(8);
    expect(bar.some((b) => b.limited && b.bottleNumber)).toBe(true);
    expect(bar.some((b) => b.watch && b.watchNote)).toBe(true);
    expect(lowBottles(bar).length).toBeGreaterThanOrEqual(3);
  });
  it('contains no real brand names', () => {
    const real = /(glen|jack|jim|johnnie|walker|jameson|bacardi|smirnoff|absolut|grey goose|tanqueray|bombay|hendrick|beefeater|campari|aperol|martini|cinzano|courvoisier|hennessy|patr[oó]n|jos[eé] cuervo|captain|havana|diageo|macallan|lagavulin|laphroaig|bulleit|maker|crown|tito)/i;
    for (const b of bar) expect(b.name).not.toMatch(real);
  });
  it('holds no personal data: no email, phone number or street address', () => {
    const all = JSON.stringify(bar);
    expect(all).not.toMatch(/@|\d{3}[- ]\d{3}[- ]\d{4}|\bstreet\b|\bave\b/i);
  });
  it('gives stats with no NaN anywhere', () => {
    const s = barStats(bar, 30);
    expect(JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).not.toMatch(/NaN|null.*undefined/);
    expect(s.count).toBe(11);
    expect(barCsv(bar, 30)).not.toMatch(/NaN|undefined|Infinity/);
  });
  it('is stamped with the time it was loaded', () => {
    for (const b of bar) expect(b.createdAt).toBe(NOW.toISOString());
  });
});
