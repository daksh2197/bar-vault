// Adapted from coin-vault (MIT, Daksh Dua)
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bottle, bottlesArb, jpegBytes, NOW, RUNS } from './fixtures';
import { lockText, MIN_ITERATIONS, unlockText } from './lock';
import { BACKUP_PHOTO_CAP_BYTES } from './photo';
import {
  buildExport,
  ENCRYPTED_FORMAT,
  EXPORT_SCHEMA,
  MAX_FILE_BYTES,
  mergeBottles,
  mergePhotos,
  NOT_A_VAULT,
  parseVaultText,
  serializeExport,
  validateExport,
} from './vaultfile';
import type { Bottle, Photo } from './types';

const photo = (id: string, n = 20, seed = 1): Photo => ({ id, type: 'image/jpeg', bytes: jpegBytes(n, seed) });

function text(over: Record<string, unknown> = {}, bottles: Bottle[] = [bottle('a')], photos: Photo[] | null = null): string {
  const built = buildExport(bottles, photos, NOW);
  if (!built.ok) throw new Error('setup');
  return JSON.stringify({ ...built.value, ...over });
}

function plain(t: string) {
  const r = parseVaultText(t);
  if (!r.ok || r.value.kind !== 'plain') throw new Error(r.ok ? 'not plain' : r.error);
  return r.value.contents;
}

describe('export and import', () => {
  it('round-trips bottles exactly', () => {
    const bottles = [bottle('a', { notes: 'n', market: { amountCents: 5, source: 's', date: '2026-10-01' } }), bottle('b', { category: 'rum', limited: true })];
    const back = plain(text({}, bottles));
    expect(back.bottles).toEqual(bottles);
    expect(back.photos).toEqual([]);
    expect(back.exportedAt).toBe('2026-10-23T12:00:00.000Z');
  });

  it('round-trips random bars, with and without photos (property)', () => {
    fc.assert(
      fc.property(bottlesArb(6), fc.boolean(), (bottles, withPhotos) => {
        const photos = withPhotos ? bottles.filter((_, i) => i % 2 === 0).map((b, i) => photo(b.id, 10 + i, i)) : null;
        const t = serializeExport((buildExport(bottles, photos, NOW) as { ok: true; value: ReturnType<typeof Object> }).value as never);
        const back = plain(t);
        expect(back.bottles).toEqual(bottles);
        expect(back.photos).toEqual(photos ?? []);
      }),
      RUNS,
    );
  });

  it('leaves photos out of the file when none are given or the box is unticked', () => {
    const none = buildExport([bottle('a')], null, NOW);
    expect(none.ok && 'photos' in none.value).toBe(false);
    const empty = buildExport([bottle('a')], [], NOW);
    expect(empty.ok && 'photos' in empty.value).toBe(false);
  });

  it('writes only photos of bottles that are in the file', () => {
    const r = buildExport([bottle('a')], [photo('a'), photo('gone')], NOW);
    expect(r.ok && r.value.photos?.map((p) => p.id)).toEqual(['a']);
  });

  it('says plainly when a file is not ours', () => {
    for (const t of ['', 'not json', '[]', 'null', '"x"', '{"format":"other"}', text({ format: 'nope' }), text({ schema: 'x' }), text({ bottles: {} }), text({ photos: {} }), text({ schema: 0 })]) {
      const r = parseVaultText(t);
      expect(r.ok, t).toBe(false);
      if (!r.ok) expect(r.error).toBe(NOT_A_VAULT);
    }
  });

  it('refuses a coin-vault file by name, because the format string differs', () => {
    expect(parseVaultText(JSON.stringify({ format: 'coin-vault', schema: 1, holdings: [], spots: [] })).ok).toBe(false);
  });

  it('copes with a truncated file at every cut point', () => {
    const full = text();
    for (const cut of [1, 10, 50, full.length >> 1, full.length - 30, full.length - 1]) expect(parseVaultText(full.slice(0, cut)).ok, String(cut)).toBe(false);
  });

  it('refuses a file from a newer version with a message that says so', () => {
    const r = parseVaultText(text({ schema: EXPORT_SCHEMA + 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/newer version/);
  });

  it('refuses duplicate ids and invalid rows, naming the problem', () => {
    const dup = parseVaultText(text({ bottles: [bottle('a'), bottle('a')] }));
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toMatch(/share the id a/);
    expect(parseVaultText(text({ bottles: [bottle('a', { sizeMl: 0 })] })).ok).toBe(false);
    expect(parseVaultText(text({ bottles: [bottle('a', { name: '' })] })).ok).toBe(false);
  });

  it('recognises an encrypted envelope without opening it', () => {
    const r = parseVaultText(JSON.stringify({ format: ENCRYPTED_FORMAT, v: 1 }));
    expect(r).toEqual({ ok: true, value: { kind: 'encrypted', file: { format: ENCRYPTED_FORMAT, v: 1 } } });
  });

  it('refuses a file over the size limit without parsing it', () => {
    const r = parseVaultText('x'.repeat(MAX_FILE_BYTES + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too large/);
  });

  it('refuses a 20 MB junk file, whatever it holds', () => {
    expect(MAX_FILE_BYTES).toBeLessThan(20_000_000);
    for (const filler of ['x', '{', '[', '0', ' ']) expect(parseVaultText(filler.repeat(20_000_000)).ok).toBe(false);
  });

  it('keeps only known fields, so a hostile file cannot add its own', () => {
    const evil = JSON.stringify({
      format: 'bar-vault',
      schema: 1,
      exportedAt: 'x',
      bottles: [{ ...bottle('a'), extra: 'y', constructor: 'z' }],
      isAdmin: true,
    });
    const back = plain(evil);
    expect(Object.keys(back.bottles[0]!)).not.toContain('extra');
    expect(Object.keys(back)).toEqual(['exportedAt', 'bottles', 'photos']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('does not let __proto__ in a bottle pollute anything', () => {
    const t = '{"format":"bar-vault","schema":1,"exportedAt":"","bottles":[{"__proto__":{"polluted":true},"id":"a","name":"N","category":"gin","sizeMl":750,"fillPct":50,"paidCents":1,"createdAt":"2026-10-23T12:00:00.000Z","updatedAt":"2026-10-23T12:00:00.000Z"}]}';
    expect(parseVaultText(t).ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('keeps HTML in a name as plain text, untouched', () => {
    const name = '<img src=x onerror=alert(1)>';
    expect(plain(text({}, [bottle('a', { name })])).bottles[0]!.name).toBe(name);
  });

  it('truncates a very long exportedAt string', () => {
    expect(plain(text({ exportedAt: 'x'.repeat(5000) })).exportedAt).toHaveLength(40);
    expect(plain(text({ exportedAt: 5 })).exportedAt).toBe('');
  });

  it('refuses too many bottles', () => {
    const many = Array.from({ length: 5001 }, (_, i) => ({ ...bottle('b' + i) }));
    expect(parseVaultText(JSON.stringify({ format: 'bar-vault', schema: 1, exportedAt: '', bottles: many })).ok).toBe(false);
  });
});

describe('photos in a file', () => {
  it('refuses a photo with no bottle, a duplicate photo, a non-JPEG and damaged base64', () => {
    const good = JSON.parse(text({}, [bottle('a')], [photo('a')])) as { photos: { id: string; type: string; data: string }[] };
    const withPhotos = (photos: unknown[]) => parseVaultText(text({ photos }));
    expect(withPhotos(good.photos).ok).toBe(true);
    expect(withPhotos([{ ...good.photos[0]!, id: 'zzz' }]).ok).toBe(false);
    expect(withPhotos([good.photos[0], good.photos[0]]).ok).toBe(false);
    expect(withPhotos([{ ...good.photos[0]!, data: btoa('not a jpeg at all') }]).ok).toBe(false);
    expect(withPhotos([{ ...good.photos[0]!, data: '!!!' }]).ok).toBe(false);
    expect(withPhotos([{ ...good.photos[0]!, type: 'image/png' }]).ok).toBe(false);
    expect(withPhotos(['x']).ok).toBe(false);
  });

  it('refuses to write more than 10 MB of photos, with a message that says what to do', () => {
    const bottles = Array.from({ length: 8 }, (_, i) => bottle('p' + i));
    const photos = bottles.map((b) => photo(b.id, 1_400_000));
    const r = buildExport(bottles, photos, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/Untick "Include photos"/);
      expect(r.error).toMatch(/over the 10\.0 MB/);
    }
  });

  it('writes exactly 10 MB of photos but not one byte more', () => {
    const bottles = [bottle('a'), bottle('b')];
    const half = BACKUP_PHOTO_CAP_BYTES / 2;
    expect(buildExport(bottles, [photo('a', half), photo('b', half)], NOW).ok).toBe(true);
    expect(buildExport(bottles, [photo('a', half), photo('b', half + 1)], NOW).ok).toBe(false);
  });

  it('refuses a file whose photos add up to more than the cap', () => {
    const bottles = Array.from({ length: 8 }, (_, i) => bottle('p' + i));
    const entries = bottles.map((b) => ({ id: b.id, type: 'image/jpeg', data: btoa(String.fromCharCode(...jpegBytes(1_400_000).subarray(0, 4)) + 'a'.repeat(1_400_000 - 4)) }));
    const r = parseVaultText(text({ bottles, photos: entries }));
    expect(r.ok).toBe(false);
  });
});

describe('locked backups', () => {
  it('round-trips a bar with photos through the passphrase lock', async () => {
    const bottles = [bottle('a', { name: 'Gin é 🥃' }), bottle('b')];
    const built = buildExport(bottles, [photo('a', 500)], NOW);
    if (!built.ok) throw new Error('setup');
    const locked = await lockText(serializeExport(built.value), 'correct horse battery', MIN_ITERATIONS);
    expect(JSON.stringify(locked)).not.toContain('Gin');
    const parsed = parseVaultText(JSON.stringify(locked));
    expect(parsed.ok && parsed.value.kind).toBe('encrypted');
    const opened = validateExport(JSON.parse(await unlockText(locked, 'correct horse battery')));
    expect(opened.ok && opened.value.kind === 'plain' && opened.value.contents.bottles).toEqual(bottles);
    expect(opened.ok && opened.value.kind === 'plain' && opened.value.contents.photos).toEqual([photo('a', 500)]);
  });

  it('round-trips random bars through the lock (property, few runs because the lock is slow on purpose)', async () => {
    await fc.assert(
      fc.asyncProperty(bottlesArb(4), async (bottles) => {
        const built = buildExport(bottles, null, NOW);
        if (!built.ok) throw new Error('setup');
        const locked = await lockText(serializeExport(built.value), 'passphrase one', MIN_ITERATIONS);
        const opened = validateExport(JSON.parse(await unlockText(JSON.parse(JSON.stringify(locked)), 'passphrase one')));
        expect(opened.ok && opened.value.kind === 'plain' && opened.value.contents.bottles).toEqual(bottles);
      }),
      { numRuns: 15 },
    );
  }, 30_000);

  it('does not open with the wrong passphrase', async () => {
    const locked = await lockText(text(), 'passphrase one', MIN_ITERATIONS);
    await expect(unlockText(locked, 'passphrase two')).rejects.toMatchObject({ code: 'bad-passphrase' });
  });

  it('fits a full 10 MB of photos under the file limit, plain and locked', () => {
    const base64 = Math.ceil((BACKUP_PHOTO_CAP_BYTES * 4) / 3);
    expect(base64 + 100_000).toBeLessThan(MAX_FILE_BYTES);
    expect(Math.ceil(((base64 + 100_000) * 4) / 3) + 1000).toBeLessThan(MAX_FILE_BYTES);
  });
});

describe('adding an import to what is already there', () => {
  const at = (iso: string) => ({ createdAt: '2026-01-01T00:00:00.000Z', updatedAt: iso });

  it('lets the newer updatedAt win on the same id and keeps the rest', () => {
    const merged = mergeBottles(
      [bottle('a', { name: 'old A', ...at('2026-02-01T00:00:00.000Z') }), bottle('b', { name: 'keep B', ...at('2026-05-01T00:00:00.000Z') })],
      [bottle('a', { name: 'new A', ...at('2026-03-01T00:00:00.000Z') }), bottle('b', { name: 'stale B', ...at('2026-04-01T00:00:00.000Z') }), bottle('c')],
    );
    const names = Object.fromEntries(merged.bottles.map((b) => [b.id, b.name]));
    expect(names).toEqual({ a: 'new A', b: 'keep B', c: 'Bottle c' });
    expect([...merged.fromIncoming].sort()).toEqual(['a', 'c']);
  });

  it('keeps what is here when the times are equal', () => {
    const merged = mergeBottles([bottle('a', { name: 'here' })], [bottle('a', { name: 'there' })]);
    expect(merged.bottles[0]!.name).toBe('here');
    expect(merged.fromIncoming.size).toBe(0);
  });

  it('compares real times, not text, so a different offset spelling cannot fool it', () => {
    const merged = mergeBottles([bottle('a', { name: 'here', ...at('2026-10-23T12:00:00.000Z') })], [bottle('a', { name: 'there', ...at('2026-10-23T12:00:00Z') })]);
    expect(merged.bottles[0]!.name).toBe('here');
  });

  it('merging a file into itself changes nothing (property)', () => {
    fc.assert(
      fc.property(bottlesArb(8), (bottles) => {
        const merged = mergeBottles(bottles, bottles);
        expect(merged.bottles).toEqual(bottles);
        expect(merged.fromIncoming.size).toBe(0);
      }),
      RUNS,
    );
  });

  it('keeps every id from both sides exactly once (property)', () => {
    fc.assert(
      fc.property(bottlesArb(6), bottlesArb(6), (a, b) => {
        const ids = mergeBottles(a, b).bottles.map((x) => x.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect([...ids].sort()).toEqual([...new Set([...a, ...b].map((x) => x.id))].sort());
      }),
      RUNS,
    );
  });

  it('takes the imported photo only for bottles where the imported row won', () => {
    const current = [bottle('a', { updatedAt: '2026-05-01T00:00:00.000Z' }), bottle('b', { updatedAt: '2026-01-01T00:00:00.000Z' })];
    const incoming = [bottle('a', { updatedAt: '2026-01-01T00:00:00.000Z' }), bottle('b', { updatedAt: '2026-05-01T00:00:00.000Z' }), bottle('c')];
    const merged = mergeBottles(current, incoming);
    const photos = mergePhotos([photo('a', 10, 1), photo('b', 10, 2)], [photo('a', 10, 3), photo('b', 10, 4), photo('c', 10, 5)], merged);
    const seeds = Object.fromEntries(photos.map((p) => [p.id, p.bytes[5]]));
    expect(seeds).toEqual({ a: jpegBytes(10, 1)[5], b: jpegBytes(10, 4)[5], c: jpegBytes(10, 5)[5] });
  });

  it('keeps the photo already here when the imported file has none', () => {
    const merged = mergeBottles([bottle('a')], [bottle('a', { updatedAt: '2027-01-01T00:00:00.000Z' })]);
    expect(mergePhotos([photo('a')], [], merged)).toEqual([photo('a')]);
  });

  it('drops photos whose bottle is gone', () => {
    const merged = mergeBottles([bottle('a')], []);
    expect(mergePhotos([photo('a'), photo('ghost')], [], merged).map((p) => p.id)).toEqual(['a']);
  });
});
