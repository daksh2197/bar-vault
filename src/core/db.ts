// Adapted from coin-vault (MIT, Daksh Dua)
/**
 * The bar's database: IndexedDB, the browser's built-in database. It lives on this device only.
 *
 * Versions are how a database changes shape without losing rows. Each number below has one
 * migration. Opening the database runs, in order, every migration from the version on disk up to
 * DB_VERSION, inside one transaction: either all of them land or none do.
 *
 *   v1  bottles store
 *   v2  photos store, meta store; older bottles get the low threshold (20 percent) they never had
 *
 * A database newer than this app is refused rather than opened, because an old app writing into a
 * new shape is how data gets damaged.
 */

import { sanitizeBottle, sanitizePhoto, sanitizeSettings } from './schema';
import { type Bottle, DEFAULT_SETTINGS, type Photo, type Settings } from './types';

export const DB_NAME = 'bar-vault';
export const DB_VERSION = 2;

export class VaultError extends Error {
  constructor(
    readonly code: 'too-new' | 'unavailable' | 'quota' | 'failed',
    message: string,
  ) {
    super(message);
    this.name = 'VaultError';
  }
}

type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;

/** Index 0 is the migration to version 1, and so on. Never edit one that has shipped: add the next. */
export const MIGRATIONS: Migration[] = [
  (db) => {
    db.createObjectStore('bottles', { keyPath: 'id' });
  },
  (db, tx) => {
    db.createObjectStore('photos', { keyPath: 'id' });
    db.createObjectStore('meta', { keyPath: 'key' });
    const bottles = tx.objectStore('bottles');
    bottles.openCursor().onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor) return;
      const row = cursor.value as Record<string, unknown>;
      if (typeof row.lowPct !== 'number') cursor.update({ ...row, lowPct: DEFAULT_SETTINGS.defaultLowPct });
      cursor.continue();
    };
  },
];

export interface VaultData {
  bottles: Bottle[];
  settings: Settings;
  lastBackup: string | null;
  /** Rows on disk that failed validation and were left out of the list above. */
  unreadable: number;
}

export interface Vault {
  readAll(): Promise<VaultData>;
  putBottle(b: Bottle): Promise<void>;
  /** Deletes the bottle and its photo together. */
  deleteBottle(id: string): Promise<void>;
  putPhoto(p: Photo): Promise<void>;
  getPhoto(id: string): Promise<Photo | null>;
  deletePhoto(id: string): Promise<void>;
  allPhotos(): Promise<Photo[]>;
  /** Add or overwrite these rows in one transaction. Nothing else is touched, so rows that cannot be read are never lost. */
  putMany(bottles: readonly Bottle[], photos: readonly Photo[]): Promise<void>;
  /** Erase bottles, photos, settings and the last-backup date. */
  wipe(): Promise<void>;
  setSettings(s: Settings): Promise<void>;
  setLastBackup(iso: string): Promise<void>;
  close(): void;
}

function asVaultError(error: unknown): VaultError {
  if (error instanceof VaultError) return error;
  const name = (error as { name?: string } | null)?.name;
  if (name === 'QuotaExceededError') return new VaultError('quota', 'This device has no room left for the bar. Export a backup and free some space.');
  if (name === 'VersionError') {
    return new VaultError('too-new', 'This bar was saved by a newer version of Bar Vault. Update the app; nothing was changed.');
  }
  return new VaultError('failed', 'The bar could not be read or saved on this device.');
}

const wrap = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(asVaultError(request.error));
  });

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(asVaultError(tx.error));
    tx.onabort = () => reject(asVaultError(tx.error));
  });

const UNAVAILABLE = 'This browser does not let Bar Vault keep data here. Private windows often block it.';

export function openVault(factory: IDBFactory | null = globalThis.indexedDB ?? null, name: string = DB_NAME): Promise<Vault> {
  if (!factory) return Promise.reject(new VaultError('unavailable', UNAVAILABLE));
  return new Promise<Vault>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name, DB_VERSION);
    } catch {
      reject(new VaultError('unavailable', UNAVAILABLE));
      return;
    }
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction as IDBTransaction;
      for (let v = event.oldVersion; v < DB_VERSION; v += 1) MIGRATIONS[v]?.(db, tx);
    };
    request.onblocked = () => reject(new VaultError('failed', 'Another tab has the bar open on an older version. Close it and reload.'));
    request.onerror = () => {
      const e = asVaultError(request.error);
      reject(e.code === 'failed' ? new VaultError('unavailable', UNAVAILABLE) : e);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(makeVault(db));
    };
  });
}

function makeVault(db: IDBDatabase): Vault {
  const run = async <T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>): Promise<T> => {
    try {
      const tx = db.transaction(stores, mode);
      const finished = done(tx);
      const result = await work(tx);
      await finished;
      return result;
    } catch (error) {
      throw asVaultError(error);
    }
  };

  const readPhotos = async (tx: IDBTransaction): Promise<Photo[]> => {
    const raw = await wrap(tx.objectStore('photos').getAll());
    return raw.flatMap((r) => {
      const p = sanitizePhoto(r);
      return p.ok ? [p.value] : [];
    });
  };

  return {
    readAll: () =>
      run(['bottles', 'meta'], 'readonly', async (tx) => {
        const [rawBottles, backup, rawSettings] = await Promise.all([
          wrap(tx.objectStore('bottles').getAll()),
          wrap(tx.objectStore('meta').get('lastBackup')),
          wrap(tx.objectStore('meta').get('settings')),
        ]);
        let unreadable = 0;
        const bottles: Bottle[] = [];
        for (const raw of rawBottles) {
          const b = sanitizeBottle(raw);
          if (b.ok) bottles.push(b.value);
          else unreadable += 1;
        }
        const when = (backup as { value?: unknown } | undefined)?.value;
        const s = sanitizeSettings((rawSettings as { value?: unknown } | undefined)?.value);
        return { bottles, settings: s.ok ? s.value : { ...DEFAULT_SETTINGS }, lastBackup: typeof when === 'string' ? when : null, unreadable };
      }),
    putBottle: (b) => run(['bottles'], 'readwrite', async (tx) => void (await wrap(tx.objectStore('bottles').put(b)))),
    deleteBottle: (id) =>
      run(['bottles', 'photos'], 'readwrite', async (tx) => {
        await Promise.all([wrap(tx.objectStore('bottles').delete(id)), wrap(tx.objectStore('photos').delete(id))]);
      }),
    putPhoto: (p) => run(['photos'], 'readwrite', async (tx) => void (await wrap(tx.objectStore('photos').put({ id: p.id, type: p.type, bytes: p.bytes })))),
    getPhoto: (id) =>
      run(['photos'], 'readonly', async (tx) => {
        const raw = await wrap(tx.objectStore('photos').get(id));
        const p = sanitizePhoto(raw);
        return p.ok ? p.value : null;
      }),
    deletePhoto: (id) => run(['photos'], 'readwrite', async (tx) => void (await wrap(tx.objectStore('photos').delete(id)))),
    allPhotos: () => run(['photos'], 'readonly', readPhotos),
    putMany: (bottles, photos) =>
      run(['bottles', 'photos'], 'readwrite', async (tx) => {
        const bs = tx.objectStore('bottles');
        const ps = tx.objectStore('photos');
        await Promise.all([...bottles.map((b) => wrap(bs.put(b))), ...photos.map((p) => wrap(ps.put({ id: p.id, type: p.type, bytes: p.bytes })))]);
      }),
    wipe: () =>
      run(['bottles', 'photos', 'meta'], 'readwrite', async (tx) => {
        await Promise.all(['bottles', 'photos', 'meta'].map((name) => wrap(tx.objectStore(name).clear())));
      }),
    setSettings: (s) => run(['meta'], 'readwrite', async (tx) => void (await wrap(tx.objectStore('meta').put({ key: 'settings', value: s })))),
    setLastBackup: (iso) => run(['meta'], 'readwrite', async (tx) => void (await wrap(tx.objectStore('meta').put({ key: 'lastBackup', value: iso })))),
    close: () => db.close(),
  };
}
