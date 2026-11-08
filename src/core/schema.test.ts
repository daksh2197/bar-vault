import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bottle, bottleArb, jpegBytes, RUNS } from './fixtures';
import { isValidId, LIMITS, looksLikeJpeg, MAX_PHOTO_BYTES, sanitizeBottle, sanitizePhoto, sanitizeSettings } from './schema';

const ok = (over: Record<string, unknown>): boolean => sanitizeBottle({ ...bottle('a'), ...over }).ok;

describe('what a bottle may contain', () => {
  it('accepts a plain bottle and gives it back unchanged', () => {
    const b = bottle('a', { boughtWhere: 'Shop', boughtOn: '2026-10-01', bottleNumber: '1 of 9', notes: 'n', watchNote: 'w', market: { amountCents: 100, source: 's', date: '2026-10-02' } });
    expect(sanitizeBottle(b)).toEqual({ ok: true, value: b });
  });

  it('drops unknown keys', () => {
    const r = sanitizeBottle({ ...bottle('a'), extra: 'x', __proto__: { polluted: true }, constructor: 'y' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.value).sort()).toEqual(['category', 'createdAt', 'fillPct', 'id', 'limited', 'lowPct', 'name', 'paidCents', 'rarity', 'sizeMl', 'updatedAt', 'watch']);
  });

  it('trims the name and rejects a blank or over-long one', () => {
    const r = sanitizeBottle({ ...bottle('a'), name: '  Gin  ' });
    expect(r.ok && r.value.name).toBe('Gin');
    expect(ok({ name: '   ' })).toBe(false);
    expect(ok({ name: '' })).toBe(false);
    expect(ok({ name: 5 })).toBe(false);
    expect(ok({ name: 'x'.repeat(LIMITS.name) })).toBe(true);
    expect(ok({ name: 'x'.repeat(LIMITS.name + 1) })).toBe(false);
  });

  it.each([
    ['boughtWhere', 200],
    ['bottleNumber', 40],
    ['watchNote', 500],
    ['notes', 2000],
  ])('enforces the %s limit of %i characters', (key, max) => {
    expect(ok({ [key]: 'x'.repeat(max) })).toBe(true);
    expect(ok({ [key]: 'x'.repeat(max + 1) })).toBe(false);
    expect(ok({ [key]: 5 })).toBe(false);
  });

  it('enforces the market source limit and the amount range', () => {
    expect(ok({ market: { amountCents: 1, source: 'x'.repeat(200) } })).toBe(true);
    expect(ok({ market: { amountCents: 1, source: 'x'.repeat(201) } })).toBe(false);
    expect(ok({ market: { amountCents: -1 } })).toBe(false);
    expect(ok({ market: { amountCents: 0 } })).toBe(false);
    expect(ok({ market: { amountCents: 1.5 } })).toBe(false);
    expect(ok({ market: { amountCents: 1_000_000_000_001 } })).toBe(false);
    expect(ok({ market: { amountCents: 1, date: '2026-02-30' } })).toBe(false);
    expect(ok({ market: 'cheap' })).toBe(false);
    expect(ok({ market: [] })).toBe(false);
  });

  it.each([
    ['sizeMl', 0, false],
    ['sizeMl', 1, true],
    ['sizeMl', 100_000, true],
    ['sizeMl', 100_001, false],
    ['sizeMl', 1.5, false],
    ['sizeMl', -1, false],
    ['sizeMl', 1e23, false],
    ['sizeMl', '750', false],
    ['sizeMl', NaN, false],
    ['fillPct', -1, false],
    ['fillPct', 0, true],
    ['fillPct', 100, true],
    ['fillPct', 101, false],
    ['fillPct', 50.5, false],
    ['paidCents', -5, false],
    ['paidCents', 0, true],
    ['paidCents', 1_000_000_000_000, true],
    ['paidCents', 1_000_000_000_001, false],
    ['paidCents', Number.MAX_SAFE_INTEGER, false],
    ['paidCents', Infinity, false],
    ['lowPct', -1, false],
    ['lowPct', 0, true],
    ['lowPct', 100, true],
    ['lowPct', 101, false],
    ['lowPct', '20', false],
  ])('%s of %s is accepted: %s', (key, value, accepted) => {
    expect(ok({ [key]: value })).toBe(accepted);
  });

  it('rejects an unknown category or rarity, and fills a missing rarity with unknown', () => {
    expect(ok({ category: 'beer' })).toBe(false);
    expect(ok({ category: undefined })).toBe(false);
    expect(ok({ rarity: 'mythic' })).toBe(false);
    const r = sanitizeBottle({ ...bottle('a'), rarity: undefined });
    expect(r.ok && r.value.rarity).toBe('unknown');
  });

  it('gives a row with no threshold the 20 percent it was always given', () => {
    const { lowPct: _l, ...rest } = bottle('a');
    const r = sanitizeBottle(rest);
    expect(r.ok && r.value.lowPct).toBe(20);
  });

  it('rejects flags that are not booleans', () => {
    expect(ok({ limited: 'yes' })).toBe(false);
    expect(ok({ watch: 1 })).toBe(false);
  });

  it.each(['__proto__', 'A B', '', 'x'.repeat(65), 'a/b', 'ünï', 'a b', '../x'])('rejects the id %j', (id) => {
    expect(ok({ id })).toBe(false);
    expect(isValidId(id)).toBe(false);
  });

  it.each(['a', 'sample-01', '0f8fad5b-d9cb-469f-a165-70867728950e', 'x'.repeat(64)])('accepts the id %j', (id) => {
    expect(isValidId(id)).toBe(true);
  });

  it.each(['2026-02-30', '2026-13-01', 'yesterday', '26-1-1', '', '2026-10-01T00:00:00Z'])('rejects the purchase date %j', (boughtOn) => {
    expect(ok({ boughtOn })).toBe(boughtOn === '');
  });

  it.each(['2026-10-23T12:00:00.000Z', '2026-10-23T12:00:00Z'])('accepts the timestamp %j', (t) => {
    expect(ok({ createdAt: t, updatedAt: t })).toBe(true);
  });

  it.each(['2026-10-23', 'now', '2026-10-23T12:00:00+02:00', '2026-02-30T12:00:00Z', 5, null])('rejects the timestamp %j', (t) => {
    expect(ok({ updatedAt: t })).toBe(false);
    expect(ok({ createdAt: t })).toBe(false);
  });

  it('keeps hostile text as plain text, untouched', () => {
    const name = '<img src=x onerror=alert(1)>';
    const r = sanitizeBottle({ ...bottle('a'), name, notes: '<script>x</script>', boughtWhere: '"; DROP TABLE' });
    expect(r.ok && r.value.name).toBe(name);
    expect(r.ok && r.value.notes).toBe('<script>x</script>');
  });

  it('rejects things that are not objects', () => {
    for (const v of [null, undefined, 5, 'x', [], true]) expect(sanitizeBottle(v).ok).toBe(false);
  });

  it('passes the sample flag only when it is exactly true', () => {
    expect(sanitizeBottle({ ...bottle('a'), sample: true })).toMatchObject({ ok: true, value: { sample: true } });
    const r = sanitizeBottle({ ...bottle('a'), sample: 'yes' });
    expect(r.ok && r.value.sample).toBeUndefined();
  });

  it('accepts every random valid bottle and changes none of them (property)', () => {
    fc.assert(
      fc.property(bottleArb, (b) => {
        expect(sanitizeBottle(b)).toEqual({ ok: true, value: b });
      }),
      RUNS,
    );
  });

  it('never throws on arbitrary JSON (property)', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        expect(() => sanitizeBottle(v)).not.toThrow();
        expect(() => sanitizeSettings(v)).not.toThrow();
        expect(() => sanitizePhoto(v)).not.toThrow();
      }),
      RUNS,
    );
  });
});

describe('settings and photos', () => {
  it('accepts a peg between 5 and 500 ml and a threshold between 0 and 100', () => {
    expect(sanitizeSettings({ pegMl: 30, defaultLowPct: 20 })).toEqual({ ok: true, value: { pegMl: 30, defaultLowPct: 20 } });
    for (const pegMl of [4, 501, 0, 30.5, '30', NaN]) expect(sanitizeSettings({ pegMl, defaultLowPct: 20 }).ok, String(pegMl)).toBe(false);
    for (const defaultLowPct of [-1, 101, 2.5, '5']) expect(sanitizeSettings({ pegMl: 30, defaultLowPct }).ok).toBe(false);
    expect(sanitizeSettings(null).ok).toBe(false);
  });

  it('drops unknown settings keys', () => {
    expect(sanitizeSettings({ pegMl: 45, defaultLowPct: 10, x: 1 })).toEqual({ ok: true, value: { pegMl: 45, defaultLowPct: 10 } });
  });

  it('recognises a JPEG by its first bytes', () => {
    expect(looksLikeJpeg(jpegBytes())).toBe(true);
    expect(looksLikeJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe(false);
    expect(looksLikeJpeg(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false);
    expect(looksLikeJpeg(new Uint8Array())).toBe(false);
  });

  it('accepts a JPEG photo and refuses other bytes, other types and oversize data', () => {
    expect(sanitizePhoto({ id: 'a', type: 'image/jpeg', bytes: jpegBytes() }).ok).toBe(true);
    expect(sanitizePhoto({ id: 'a', bytes: new Uint8Array([1, 2, 3, 4, 5]) }).ok).toBe(false);
    expect(sanitizePhoto({ id: 'a', bytes: 'text' }).ok).toBe(false);
    expect(sanitizePhoto({ id: 'A!', bytes: jpegBytes() }).ok).toBe(false);
    expect(sanitizePhoto({ id: 'a', bytes: jpegBytes(MAX_PHOTO_BYTES + 1) }).ok).toBe(false);
    expect(sanitizePhoto({ id: 'a', bytes: jpegBytes(MAX_PHOTO_BYTES) }).ok).toBe(true);
  });
});
