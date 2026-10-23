// Adapted from coin-vault (MIT, Daksh Dua)
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DB_NAME, DB_VERSION, MIGRATIONS, openVault, VaultError } from './db';
import { bottle, jpegBytes } from './fixtures';
import type { Photo } from './types';

const photo = (id: string, seed = 1): Photo => ({ id, type: 'image/jpeg', bytes: jpegBytes(64, seed) });

/** Build a database the way the first release did: version 1, bottles only, no threshold. */
function makeV1(factory: IDBFactory, rows: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = factory.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      const store = open.result.createObjectStore('bottles', { keyPath: 'id' });
      for (const row of rows) store.put(row);
    };
    open.onsuccess = () => {
      open.result.close();
      resolve();
    };
    open.onerror = () => reject(open.error);
  });
}

const storeNames = (factory: IDBFactory): Promise<string[]> =>
  new Promise((resolve, reject) => {
    const open = factory.open(DB_NAME);
    open.onsuccess = () => {
      const names = [...open.result.objectStoreNames].sort();
      open.result.close();
      resolve(names);
    };
    open.onerror = () => reject(open.error);
  });

describe('the bar database', () => {
  it('starts empty on a brand-new device, with the default settings', async () => {
    const vault = await openVault(new IDBFactory());
    expect(await vault.readAll()).toEqual({ bottles: [], settings: { pegMl: 30, defaultLowPct: 20 }, lastBackup: null, unreadable: 0 });
    vault.close();
  });

  it('saves, reads back, edits and deletes bottles', async () => {
    const vault = await openVault(new IDBFactory());
    await vault.putBottle(bottle('a'));
    await vault.putBottle(bottle('b'));
    await vault.putBottle(bottle('a', { fillPct: 9 }));
    await vault.deleteBottle('b');
    expect((await vault.readAll()).bottles).toEqual([bottle('a', { fillPct: 9 })]);
    vault.close();
  });

  it('keeps the settings and the last-backup date', async () => {
    const factory = new IDBFactory();
    const vault = await openVault(factory);
    await vault.setSettings({ pegMl: 45, defaultLowPct: 10 });
    await vault.setLastBackup('2026-10-23T12:00:00.000Z');
    vault.close();
    const again = await openVault(factory);
    const data = await again.readAll();
    expect(data.settings).toEqual({ pegMl: 45, defaultLowPct: 10 });
    expect(data.lastBackup).toBe('2026-10-23T12:00:00.000Z');
    again.close();
  });

  it('replaces everything, photos too, in one go', async () => {
    const vault = await openVault(new IDBFactory());
    await vault.putBottle(bottle('old'));
    await vault.putPhoto(photo('old'));
    await vault.replaceAll([bottle('n1'), bottle('n2')], [photo('n1')]);
    const data = await vault.readAll();
    expect(data.bottles.map((b) => b.id).sort()).toEqual(['n1', 'n2']);
    expect((await vault.allPhotos()).map((p) => p.id)).toEqual(['n1']);
    expect(await vault.getPhoto('old')).toBeNull();
    vault.close();
  });

  it('wipes bottles, photos, settings and the backup date', async () => {
    const vault = await openVault(new IDBFactory());
    await vault.putBottle(bottle('a'));
    await vault.putPhoto(photo('a'));
    await vault.setSettings({ pegMl: 60, defaultLowPct: 5 });
    await vault.setLastBackup('2026-10-23T00:00:00.000Z');
    await vault.wipe();
    expect(await vault.readAll()).toEqual({ bottles: [], settings: { pegMl: 30, defaultLowPct: 20 }, lastBackup: null, unreadable: 0 });
    expect(await vault.allPhotos()).toEqual([]);
    vault.close();
  });
});

describe('photos in the database', () => {
  it('round-trips the exact bytes', async () => {
    const vault = await openVault(new IDBFactory());
    const p = photo('a', 7);
    await vault.putPhoto(p);
    const back = await vault.getPhoto('a');
    expect(back).toEqual(p);
    expect(Array.from(back!.bytes)).toEqual(Array.from(p.bytes));
    vault.close();
  });

  it('returns null for a bottle with no photo', async () => {
    const vault = await openVault(new IDBFactory());
    expect(await vault.getPhoto('none')).toBeNull();
    vault.close();
  });

  it('replaces a photo and deletes it', async () => {
    const vault = await openVault(new IDBFactory());
    await vault.putPhoto(photo('a', 1));
    await vault.putPhoto(photo('a', 2));
    expect((await vault.allPhotos())).toHaveLength(1);
    expect((await vault.getPhoto('a'))!.bytes[10]).toBe(jpegBytes(64, 2)[10]);
    await vault.deletePhoto('a');
    expect(await vault.getPhoto('a')).toBeNull();
    vault.close();
  });

  it('deletes a bottle\'s photo together with the bottle', async () => {
    const vault = await openVault(new IDBFactory());
    await vault.putBottle(bottle('a'));
    await vault.putPhoto(photo('a'));
    await vault.deleteBottle('a');
    expect(await vault.getPhoto('a')).toBeNull();
    vault.close();
  });

  it('skips a stored photo that is not a JPEG', async () => {
    const factory = new IDBFactory();
    const vault = await openVault(factory);
    vault.close();
    await new Promise<void>((resolve, reject) => {
      const open = factory.open(DB_NAME);
      open.onsuccess = () => {
        const tx = open.result.transaction('photos', 'readwrite');
        tx.objectStore('photos').put({ id: 'bad', bytes: new Uint8Array([1, 2, 3, 4, 5, 6]) });
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
      };
      open.onerror = () => reject(open.error);
    });
    const again = await openVault(factory);
    expect(await again.allPhotos()).toEqual([]);
    expect(await again.getPhoto('bad')).toBeNull();
    again.close();
  });
});

describe('migrations', () => {
  it('has one migration per version', () => {
    expect(MIGRATIONS).toHaveLength(DB_VERSION);
    expect(DB_VERSION).toBe(2);
  });

  it('opens at version 1, writes bottles, reopens at version 2 and keeps every row', async () => {
    const factory = new IDBFactory();
    const { lowPct: _a, ...v1a } = bottle('a');
    const { lowPct: _b, ...v1b } = bottle('b', { name: 'Second' });
    await makeV1(factory, [v1a, v1b]);
    expect(await storeNames(factory)).toEqual(['bottles']);
    const vault = await openVault(factory);
    const data = await vault.readAll();
    expect(data.bottles.map((b) => b.id).sort()).toEqual(['a', 'b']);
    expect(data.bottles.find((b) => b.id === 'b')!.name).toBe('Second');
    expect(data.unreadable).toBe(0);
    vault.close();
  });

  it('adds the photos and meta stores', async () => {
    const factory = new IDBFactory();
    await makeV1(factory, []);
    (await openVault(factory)).close();
    expect(await storeNames(factory)).toEqual(['bottles', 'meta', 'photos']);
  });

  it('fills in the 20 percent threshold that version 1 rows never had', async () => {
    const factory = new IDBFactory();
    const { lowPct: _l, ...v1 } = bottle('a');
    await makeV1(factory, [v1]);
    const vault = await openVault(factory);
    expect((await vault.readAll()).bottles[0]!.lowPct).toBe(20);
    vault.close();
  });

  it('does not overwrite a threshold a row already had', async () => {
    const factory = new IDBFactory();
    await makeV1(factory, [bottle('a', { lowPct: 35 })]);
    const vault = await openVault(factory);
    expect((await vault.readAll()).bottles[0]!.lowPct).toBe(35);
    vault.close();
  });

  it('can store a photo straight after the upgrade', async () => {
    const factory = new IDBFactory();
    await makeV1(factory, [bottle('a')]);
    const vault = await openVault(factory);
    await vault.putPhoto(photo('a'));
    expect(await vault.getPhoto('a')).toEqual(photo('a'));
    vault.close();
  });

  it('a second open of an up-to-date database changes nothing', async () => {
    const factory = new IDBFactory();
    const first = await openVault(factory);
    await first.putBottle(bottle('a'));
    first.close();
    const second = await openVault(factory);
    expect((await second.readAll()).bottles).toEqual([bottle('a')]);
    second.close();
  });

  it('refuses a database saved by a newer app, and leaves it alone', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const open = factory.open(DB_NAME, 99);
      open.onupgradeneeded = () => open.result.createObjectStore('bottles', { keyPath: 'id' });
      open.onsuccess = () => {
        open.result.close();
        resolve();
      };
      open.onerror = () => reject(open.error);
    });
    await expect(openVault(factory)).rejects.toMatchObject({ name: 'VaultError', code: 'too-new' });
    const still = await new Promise<number>((resolve) => {
      const open = factory.open(DB_NAME);
      open.onsuccess = () => {
        const v = open.result.version;
        open.result.close();
        resolve(v);
      };
    });
    expect(still).toBe(99);
  });

  it('skips rows that fail validation and says how many', async () => {
    const factory = new IDBFactory();
    await makeV1(factory, [{ id: 'bad', name: '' }, bottle('ok'), { id: 'worse', name: 'x', sizeMl: 1e23 }]);
    const vault = await openVault(factory);
    const data = await vault.readAll();
    expect(data.bottles.map((b) => b.id)).toEqual(['ok']);
    expect(data.unreadable).toBe(2);
    vault.close();
  });

  it('falls back to the default settings when the saved ones are damaged', async () => {
    const factory = new IDBFactory();
    const vault = await openVault(factory);
    await vault.setSettings({ pegMl: 9999, defaultLowPct: 20 });
    expect((await vault.readAll()).settings).toEqual({ pegMl: 30, defaultLowPct: 20 });
    vault.close();
  });
});

describe('a browser with no database', () => {
  it('fails with a clear message instead of a stack trace', async () => {
    const error = await openVault(null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VaultError);
    expect((error as VaultError).code).toBe('unavailable');
    const broken = { open: () => { throw new Error('SecurityError'); } } as unknown as IDBFactory;
    await expect(openVault(broken)).rejects.toMatchObject({ code: 'unavailable' });
  });
});
