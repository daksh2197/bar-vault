import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { jpegBytes, RUNS } from './fixtures';
import { BACKUP_PHOTO_CAP_BYTES, checkPhotoCap, decodePhoto, encodePhotos, fitWithin, makePhoto, MAX_INPUT_BYTES, MAX_SIDE_PX, megabytes, photoBytes, type ResizeFn } from './photo';
import { MAX_PHOTO_BYTES } from './schema';
import type { Photo } from './types';

const photo = (id: string, n: number): Photo => ({ id, type: 'image/jpeg', bytes: jpegBytes(n) });
const pic = (size = 100, type = 'image/png'): Blob => new Blob([new Uint8Array(size)], { type });
const okResize: ResizeFn = async () => jpegBytes(300);

describe('how big a photo becomes', () => {
  it.each([
    [4000, 3000, 640, 480],
    [3000, 4000, 480, 640],
    [640, 480, 640, 480],
    [100, 50, 100, 50],
    [1280, 1280, 640, 640],
    [10_000, 1, 640, 1],
    [1, 10_000, 1, 640],
    [641, 641, 640, 640],
  ])('shrinks %i x %i to %i x %i', (w, h, ew, eh) => {
    expect(fitWithin(w, h)).toEqual({ width: ew, height: eh });
  });

  it('never enlarges a small picture', () => {
    expect(fitWithin(50, 40)).toEqual({ width: 50, height: 40 });
  });

  it.each([[0, 10], [10, 0], [-5, 10], [NaN, 10], [Infinity, 10]])('treats %s x %s as a 1 x 1 picture', (w, h) => {
    expect(fitWithin(w, h)).toEqual({ width: 1, height: 1 });
  });

  it('keeps the longest side at 640 or less and never goes to zero (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20_000 }), fc.integer({ min: 1, max: 20_000 }), (w, h) => {
        const r = fitWithin(w, h);
        expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(MAX_SIDE_PX);
        expect(r.width).toBeGreaterThanOrEqual(1);
        expect(r.height).toBeGreaterThanOrEqual(1);
        if (Math.max(w, h) <= MAX_SIDE_PX) expect(r).toEqual({ width: w, height: h });
      }),
      RUNS,
    );
  });
});

describe('making a photo from a picked file', () => {
  it('uses the injected resize and keeps the JPEG it returns', async () => {
    const r = await makePhoto('a', pic(), okResize);
    expect(r).toEqual({ ok: true, value: { id: 'a', type: 'image/jpeg', bytes: jpegBytes(300) } });
  });

  it('passes the 640 px limit to the resize', async () => {
    let seen = 0;
    await makePhoto('a', pic(), async (_f, max) => ((seen = max), jpegBytes()));
    expect(seen).toBe(640);
  });

  it('refuses an empty file, a non-picture and a file over 25 MB without calling the resize', async () => {
    let calls = 0;
    const counting: ResizeFn = async () => (calls++, jpegBytes());
    expect((await makePhoto('a', pic(0), counting)).ok).toBe(false);
    expect((await makePhoto('a', pic(10, 'text/plain'), counting)).ok).toBe(false);
    expect((await makePhoto('a', pic(10, 'application/pdf'), counting)).ok).toBe(false);
    expect((await makePhoto('a', { size: MAX_INPUT_BYTES + 1, type: 'image/jpeg' } as Blob, counting)).ok).toBe(false);
    expect(calls).toBe(0);
  });

  it('accepts a file with no type, because some browsers give none', async () => {
    expect((await makePhoto('a', pic(10, ''), okResize)).ok).toBe(true);
  });

  it('gives a message when the browser cannot read the picture', async () => {
    const r = await makePhoto('a', pic(), async () => {
      throw new Error('decode');
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/could not read/);
  });

  it('refuses a resize that did not return a JPEG, and one that is still too big', async () => {
    expect((await makePhoto('a', pic(), async () => new Uint8Array([1, 2, 3, 4, 5, 6]))).ok).toBe(false);
    expect((await makePhoto('a', pic(), async () => jpegBytes(MAX_PHOTO_BYTES + 1))).ok).toBe(false);
    expect((await makePhoto('a', pic(), async () => jpegBytes(MAX_PHOTO_BYTES))).ok).toBe(true);
  });
});

describe('the 10 MB backup cap', () => {
  it('adds up photo sizes', () => {
    expect(photoBytes([photo('a', 10), photo('b', 20)])).toBe(30);
    expect(photoBytes([])).toBe(0);
  });

  it('allows up to the cap and refuses one byte over', () => {
    expect(checkPhotoCap([photo('a', BACKUP_PHOTO_CAP_BYTES)])).toEqual({ ok: true, value: BACKUP_PHOTO_CAP_BYTES });
    const over = checkPhotoCap([photo('a', BACKUP_PHOTO_CAP_BYTES + 1)]);
    expect(over.ok).toBe(false);
  });

  it('says how much there is and what to do', () => {
    const r = checkPhotoCap([photo('a', 12 * 1024 * 1024)]);
    expect(!r.ok && r.error).toContain('12.0 MB');
    expect(!r.ok && r.error).toContain('10.0 MB');
    expect(!r.ok && r.error).toContain('Untick "Include photos"');
  });

  it.each([
    [0, '0.0 MB'],
    [1024 * 1024, '1.0 MB'],
    [1.5 * 1024 * 1024, '1.5 MB'],
    [10 * 1024 * 1024, '10.0 MB'],
    [12345678, '11.8 MB'],
  ])('writes %i bytes as %s', (n, text) => {
    expect(megabytes(n)).toBe(text);
  });
});

describe('photos as base64 in a backup', () => {
  it('round-trips the exact bytes', () => {
    const p = photo('a', 1000);
    const [entry] = encodePhotos([p]);
    expect(entry).toMatchObject({ id: 'a', type: 'image/jpeg' });
    expect(decodePhoto(entry)).toEqual({ ok: true, value: p });
  });

  it('round-trips any JPEG-shaped bytes (property)', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 3000 }), (tail) => {
        const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...tail]);
        const p: Photo = { id: 'x', type: 'image/jpeg', bytes };
        const back = decodePhoto(encodePhotos([p])[0]);
        expect(back.ok && Array.from(back.value.bytes)).toEqual(Array.from(bytes));
      }),
      RUNS,
    );
  });

  it.each([
    [null],
    ['text'],
    [[]],
    [{}],
    [{ id: 'a' }],
    [{ id: 'A!', type: 'image/jpeg', data: 'AAAA' }],
    [{ id: 'a', type: 'image/png', data: 'AAAA' }],
    [{ id: 'a', type: 'image/jpeg', data: 5 }],
    [{ id: 'a', type: 'image/jpeg', data: '***' }],
    [{ id: 'a', type: 'image/jpeg', data: 'AAAAAAAA' }],
    [{ id: 'a', type: 'image/jpeg', data: 'A'.repeat(MAX_PHOTO_BYTES) }],
  ])('refuses the bad photo entry %j', (entry) => {
    expect(decodePhoto(entry).ok).toBe(false);
  });
});
