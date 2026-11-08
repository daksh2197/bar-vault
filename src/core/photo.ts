/**
 * Photos. A photo is chosen from the device, shrunk on the device to 640 px on its longest side,
 * saved as a JPEG in its own database store, and never sent anywhere.
 *
 * The shrinking needs a canvas, which only a real browser has, so it is passed in as a function.
 * Everything else here (the size maths, the checks, the backup cap, the base64 round trip) is pure and tested.
 */

import { type Result, fail } from './decimal';
import { fromBase64, toBase64 } from './lock';
import { looksLikeJpeg, MAX_PHOTO_BYTES } from './schema';
import type { Photo } from './types';

export const MAX_SIDE_PX = 640;
export const JPEG_QUALITY = 0.82;
/** Largest picture file read from the device before shrinking. A phone camera file is a few MB. */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
/** The most photo data a backup file carries, in bytes before base64. */
export const BACKUP_PHOTO_CAP_BYTES = 10 * 1024 * 1024;

/** The size a picture shrinks to: longest side at most `max`, shape kept, never zero, never enlarged. */
export function fitWithin(width: number, height: number, max: number = MAX_SIDE_PX): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return { width: 1, height: 1 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Takes a picture file and the longest side wanted; gives back JPEG bytes. The browser supplies the real one. */
export type ResizeFn = (file: Blob, maxSide: number) => Promise<Uint8Array>;

export async function makePhoto(id: string, file: Blob, resize: ResizeFn): Promise<Result<Photo>> {
  if (file.size === 0) return fail('That file is empty.');
  if (file.size > MAX_INPUT_BYTES) return fail('That picture is over 25 MB. Pick a smaller one.');
  if (file.type !== '' && !file.type.startsWith('image/')) return fail('Pick a picture file.');
  let bytes: Uint8Array;
  try {
    bytes = await resize(file, MAX_SIDE_PX);
  } catch {
    return fail('This browser could not read that picture. Try a JPEG or PNG.');
  }
  if (!looksLikeJpeg(bytes)) return fail('This browser could not turn that picture into a JPEG.');
  if (bytes.length > MAX_PHOTO_BYTES) return fail('That picture is still too large after shrinking it.');
  return { ok: true, value: { id, type: 'image/jpeg', bytes } };
}

/** The real resize: draws the picture on a canvas at the smaller size and saves it as a JPEG. Browser only. */
export const canvasResize: ResizeFn = async (file, maxSide) => {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    // JPEG has no transparency; a transparent PNG would turn black without this.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new Error('no jpeg');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
};

export const photoBytes = (photos: readonly Photo[]): number => photos.reduce((a, p) => a + p.bytes.length, 0);

export function megabytes(bytes: number): string {
  const tenths = Math.round((bytes * 10) / (1024 * 1024));
  return `${Math.floor(tenths / 10)}.${tenths % 10} MB`;
}

/** Photos may go in a backup only while they total no more than the cap. Otherwise the message says what to do. */
export function checkPhotoCap(photos: readonly Photo[], cap: number = BACKUP_PHOTO_CAP_BYTES): Result<number> {
  const total = photoBytes(photos);
  if (total > cap) {
    return fail(`Your photos total ${megabytes(total)}, over the ${megabytes(cap)} a backup carries. Untick "Include photos" to back up the bottles alone, or remove some photos.`);
  }
  return { ok: true, value: total };
}

export interface PhotoFileEntry {
  id: string;
  type: 'image/jpeg';
  /** Base64 of the JPEG bytes. */
  data: string;
}

export const encodePhotos = (photos: readonly Photo[]): PhotoFileEntry[] => photos.map((p) => ({ id: p.id, type: 'image/jpeg', data: toBase64(p.bytes) }));

export function decodePhoto(entry: unknown): Result<Photo> {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return fail('A photo in the file is not an object.');
  const { id, type, data } = entry as Record<string, unknown>;
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(id)) return fail('A photo in the file has an invalid id.');
  if (type !== 'image/jpeg' || typeof data !== 'string') return fail(`Photo ${id} in the file is not a JPEG.`);
  if (data.length > Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 8) return fail(`Photo ${id} in the file is too large.`);
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(data);
  } catch {
    return fail(`Photo ${id} in the file is damaged.`);
  }
  if (!looksLikeJpeg(bytes)) return fail(`Photo ${id} in the file is not a JPEG.`);
  return { ok: true, value: { id, type: 'image/jpeg', bytes } };
}
