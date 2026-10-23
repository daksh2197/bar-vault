// Adapted from coin-vault (MIT, Daksh Dua)
/**
 * The export file: plain JSON, or the same JSON locked inside an encrypted envelope.
 * This module reads and checks files. It never trusts them: every row goes through schema.ts and photo.ts.
 */

import { type Result, fail } from './decimal';
import { BACKUP_PHOTO_CAP_BYTES, decodePhoto, encodePhotos, megabytes, type PhotoFileEntry, photoBytes } from './photo';
import { sanitizeBottle } from './schema';
import type { Bottle, Photo } from './types';

export const EXPORT_FORMAT = 'bar-vault';
export const ENCRYPTED_FORMAT = 'bar-vault-enc';
/** Bump when the shape of the export changes. Older files must keep importing. */
export const EXPORT_SCHEMA = 1;
/**
 * The largest file the app will open: 19 MiB. A backup with the full 10 MB of photos is about 13.4 MB as plain JSON
 * and about 17.9 MB once locked, so both fit. Anything bigger is refused before it is parsed.
 */
export const MAX_FILE_BYTES = 19 * 1024 * 1024;
export const MAX_BOTTLES = 5_000;

export interface VaultExport {
  format: typeof EXPORT_FORMAT;
  schema: number;
  exportedAt: string;
  bottles: Bottle[];
  /** Present only when the owner ticked "Include photos". */
  photos?: PhotoFileEntry[];
}

/** What a checked file hands to the app: bottles and decoded photos. */
export interface VaultContents {
  exportedAt: string;
  bottles: Bottle[];
  photos: Photo[];
}

export interface EncryptedExport {
  format: typeof ENCRYPTED_FORMAT;
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  /** Base64 of the ciphertext with its 16-byte authentication tag at the end. */
  data: string;
}

export const NOT_A_VAULT = 'This is not a Bar Vault file.';
export const TOO_LARGE = 'That file is too large to be a Bar Vault backup.';

export function buildExport(bottles: readonly Bottle[], photos: readonly Photo[] | null, now: Date): Result<VaultExport> {
  const out: VaultExport = { format: EXPORT_FORMAT, schema: EXPORT_SCHEMA, exportedAt: now.toISOString(), bottles: [...bottles] };
  if (photos && photos.length > 0) {
    const ids = new Set(bottles.map((b) => b.id));
    const kept = photos.filter((p) => ids.has(p.id));
    if (photoBytes(kept) > BACKUP_PHOTO_CAP_BYTES) {
      return fail(`Your photos total ${megabytes(photoBytes(kept))}, over the ${megabytes(BACKUP_PHOTO_CAP_BYTES)} a backup carries. Untick "Include photos" to back up the bottles alone, or remove some photos.`);
    }
    out.photos = encodePhotos(kept);
  }
  return { ok: true, value: out };
}

export const serializeExport = (file: VaultExport): string => JSON.stringify(file, null, 2);

export type ParsedFile = { kind: 'plain'; contents: VaultContents } | { kind: 'encrypted'; file: unknown };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** First look at a file's text. An encrypted envelope is only recognised here; lock.ts opens it. */
export function parseVaultText(text: string): Result<ParsedFile> {
  if (text.length > MAX_FILE_BYTES) return fail(TOO_LARGE);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail(NOT_A_VAULT);
  }
  if (!isRecord(json)) return fail(NOT_A_VAULT);
  if (json.format === ENCRYPTED_FORMAT) return { ok: true, value: { kind: 'encrypted', file: json } };
  return validateExport(json);
}

/** Check a decoded export. Also used on the plaintext inside an encrypted file. */
export function validateExport(json: unknown): Result<ParsedFile> {
  if (!isRecord(json) || json.format !== EXPORT_FORMAT) return fail(NOT_A_VAULT);
  const { schema, exportedAt, bottles, photos } = json;
  if (!Number.isSafeInteger(schema) || (schema as number) < 1) return fail(NOT_A_VAULT);
  if ((schema as number) > EXPORT_SCHEMA) return fail('This file was made by a newer version of Bar Vault. Update the app and try again.');
  if (!Array.isArray(bottles)) return fail(NOT_A_VAULT);
  if (photos !== undefined && !Array.isArray(photos)) return fail(NOT_A_VAULT);
  if (bottles.length > MAX_BOTTLES) return fail('That file has too many bottles.');
  const cleanBottles: Bottle[] = [];
  const seen = new Set<string>();
  for (const raw of bottles) {
    const b = sanitizeBottle(raw);
    if (!b.ok) return fail(b.error);
    if (seen.has(b.value.id)) return fail(`Two bottles share the id ${b.value.id}.`);
    seen.add(b.value.id);
    cleanBottles.push(b.value);
  }
  const cleanPhotos: Photo[] = [];
  const photoIds = new Set<string>();
  for (const raw of photos ?? []) {
    const p = decodePhoto(raw);
    if (!p.ok) return fail(p.error);
    if (!seen.has(p.value.id)) return fail(`Photo ${p.value.id} belongs to no bottle in the file.`);
    if (photoIds.has(p.value.id)) return fail(`Two photos share the id ${p.value.id}.`);
    photoIds.add(p.value.id);
    cleanPhotos.push(p.value);
  }
  if (photoBytes(cleanPhotos) > BACKUP_PHOTO_CAP_BYTES) return fail('The photos in that file are over the 10 MB a backup carries.');
  return {
    ok: true,
    value: {
      kind: 'plain',
      contents: { exportedAt: typeof exportedAt === 'string' ? exportedAt.slice(0, 40) : '', bottles: cleanBottles, photos: cleanPhotos },
    },
  };
}

export interface Merged {
  bottles: Bottle[];
  /** Ids whose imported row won, so their imported photo should win too. */
  fromIncoming: Set<string>;
}

/** Add an import to what is already here. Same id: the newer updatedAt wins, and a tie keeps what is here. */
export function mergeBottles(current: readonly Bottle[], incoming: readonly Bottle[]): Merged {
  const map = new Map(current.map((b) => [b.id, b]));
  const fromIncoming = new Set<string>();
  for (const b of incoming) {
    const have = map.get(b.id);
    if (!have || Date.parse(b.updatedAt) > Date.parse(have.updatedAt)) {
      map.set(b.id, b);
      fromIncoming.add(b.id);
    }
  }
  return { bottles: [...map.values()], fromIncoming };
}

/** Photos after a merge: the imported photo for a bottle that won, otherwise the one already here. */
export function mergePhotos(current: readonly Photo[], incoming: readonly Photo[], merged: Merged): Photo[] {
  const keep = new Set(merged.bottles.map((b) => b.id));
  const map = new Map(current.filter((p) => keep.has(p.id)).map((p) => [p.id, p]));
  for (const p of incoming) if (merged.fromIncoming.has(p.id) && keep.has(p.id)) map.set(p.id, p);
  return [...map.values()];
}
