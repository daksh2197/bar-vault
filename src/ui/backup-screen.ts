/** Backup and restore: a plain or passphrase-locked file out, a file in with merge. */

import { todayLocal } from '../core/dates';
import { LockError, MESSAGES, checkNewPassphrase, lockText, unlockText } from '../core/lock';
import { megabytes, photoBytes } from '../core/photo';
import { type VaultContents, buildExport, MAX_FILE_BYTES, mergeBottles, mergePhotos, parseVaultText, serializeExport, TOO_LARGE, validateExport } from '../core/vaultfile';
import type { Ctx } from './ctx';
import { h, setText } from './dom';
import { downloadFile, pageHead } from './parts';
import { backupStatus, plural } from './words';

export function backupScreen(ctx: Ctx): HTMLElement {
  const { bottles, lastBackup } = ctx.state;
  let pending: VaultContents | null = null;
  let pendingEncrypted: unknown = null;

  // ----- export -----
  const lockOn = h('input', { type: 'checkbox', id: 'lock-on' });
  const photosOn = h('input', { type: 'checkbox', id: 'include-photos', checked: true });
  const photoNote = h('p', { class: 'readout-line', id: 'photo-note' }, 'Checking photo sizes…');
  void ctx.vault
    .allPhotos()
    .then((photos) => {
      const mine = photos.filter((p) => bottles.some((b) => b.id === p.id));
      setText(photoNote, mine.length === 0 ? 'No photos are saved, so there is nothing to include.' : `${plural(mine.length, 'photo')}, ${megabytes(photoBytes(mine))}. A backup carries up to 10.0 MB of photos.`);
    })
    .catch(() => setText(photoNote, ''));
  const pass1 = h('input', { id: 'lock-pass', type: 'password', autocomplete: 'new-password' });
  const pass2 = h('input', { id: 'lock-pass2', type: 'password', autocomplete: 'new-password' });
  const lockFields = h(
    'div',
    { id: 'lock-fields', hidden: true },
    h('p', { class: 'warn' }, 'If you forget this passphrase, nobody can recover the file. There is no reset.'),
    h('div', { class: 'field' }, h('label', { for: 'lock-pass' }, 'Passphrase (at least 8 characters)'), pass1),
    h('div', { class: 'field' }, h('label', { for: 'lock-pass2' }, 'Type it again'), pass2),
  );
  lockOn.addEventListener('change', () => {
    lockFields.hidden = !lockOn.checked;
  });
  const errExport = h('p', { class: 'err', id: 'err-export', role: 'alert' });
  const exportStatus = h('span', { class: 'status', role: 'status', id: 'export-status' });
  const exportBtn = h('button', { type: 'button', class: 'btn btn-primary', id: 'export-btn' }, 'Download backup');

  exportBtn.addEventListener('click', () => {
    void (async () => {
      setText(errExport, '');
      setText(exportStatus, '');
      const now = ctx.now();
      const photos = photosOn.checked ? await ctx.vault.allPhotos() : null;
      const built = buildExport(ctx.state.bottles, photos, now);
      if (!built.ok) return void setText(errExport, built.error);
      let text = serializeExport(built.value);
      let name = `bar-vault-${todayLocal(now)}.json`;
      if (lockOn.checked) {
        const short = checkNewPassphrase(pass1.value);
        if (short) return void setText(errExport, short);
        if (pass1.value !== pass2.value) return void setText(errExport, 'The two passphrases do not match.');
        exportBtn.disabled = true;
        setText(exportStatus, 'Locking the file. This takes a moment.');
        try {
          text = JSON.stringify(await lockText(text, pass1.value), null, 2);
          name = `bar-vault-${todayLocal(now)}-locked.json`;
        } catch {
          setText(errExport, 'Could not lock the file in this browser.');
          setText(exportStatus, '');
          exportBtn.disabled = false;
          return;
        }
        exportBtn.disabled = false;
      }
      downloadFile(name, text, 'application/json');
      pass1.value = '';
      pass2.value = '';
      const count = built.value.photos?.length ?? 0;
      ctx.flash(`Saved ${name}: ${plural(ctx.state.bottles.length, 'bottle')}${count > 0 ? `, ${plural(count, 'photo')}` : ', no photos'}.`);
      await ctx.change(() => ctx.vault.setLastBackup(now.toISOString()));
    })();
  });

  // ----- import -----
  const file = h('input', { id: 'import-file', type: 'file', accept: '.json,application/json' });
  const errImport = h('p', { class: 'err', id: 'err-import', role: 'alert' });
  const importStatus = h('p', { class: 'status', role: 'status', id: 'import-status' });
  const importPass = h('input', { id: 'import-pass', type: 'password', autocomplete: 'off' });
  const unlockBtn = h('button', { type: 'button', class: 'btn btn-primary', id: 'import-unlock-btn' }, 'Unlock');
  const unlockBox = h('div', { id: 'import-unlock', hidden: true }, h('div', { class: 'field' }, h('label', { for: 'import-pass' }, 'This file is locked. Passphrase'), importPass), h('div', { class: 'actions' }, unlockBtn));
  const summary = h('p', { class: 'help', id: 'import-summary' });
  const mergeBtn = h('button', { type: 'button', class: 'btn btn-primary', id: 'import-merge' }, 'Merge into this bar');
  const cancelBtn = h('button', { type: 'button', class: 'btn btn-ghost', id: 'import-cancel' }, 'Cancel');
  const chooseBox = h('div', { id: 'import-choose', hidden: true }, summary, h('div', { class: 'actions' }, mergeBtn, cancelBtn));

  const reset = (): void => {
    pending = null;
    pendingEncrypted = null;
    unlockBox.hidden = true;
    chooseBox.hidden = true;
    importPass.value = '';
    file.value = '';
  };
  const offer = (contents: VaultContents): void => {
    pending = contents;
    const incoming = new Set(contents.bottles.map((b) => b.id));
    const here = new Set(ctx.state.bottles.map((b) => b.id));
    const fresh = [...incoming].filter((id) => !here.has(id)).length;
    setText(
      summary,
      `This file has ${plural(contents.bottles.length, 'bottle')} and ${plural(contents.photos.length, 'photo')}${contents.exportedAt ? `, saved ${contents.exportedAt.slice(0, 10)}` : ''}. ` +
        `${plural(fresh, 'bottle')} ${fresh === 1 ? 'is' : 'are'} new here. Where an id is in both, the newer edit wins. Nothing is deleted.`,
    );
    unlockBox.hidden = true;
    chooseBox.hidden = false;
  };

  file.addEventListener('change', () => {
    void (async () => {
      const f = file.files?.[0];
      setText(errImport, '');
      setText(importStatus, '');
      unlockBox.hidden = true;
      chooseBox.hidden = true;
      if (!f) return;
      if (f.size > MAX_FILE_BYTES) return void setText(errImport, TOO_LARGE);
      const parsed = parseVaultText(await f.text());
      if (!parsed.ok) return void setText(errImport, parsed.error);
      if (parsed.value.kind === 'plain') return offer(parsed.value.contents);
      pendingEncrypted = parsed.value.file;
      unlockBox.hidden = false;
      importPass.focus();
    })();
  });

  unlockBtn.addEventListener('click', () => {
    void (async () => {
      setText(errImport, '');
      unlockBtn.disabled = true;
      setText(importStatus, 'Unlocking. This takes a moment.');
      try {
        const opened = await unlockText(pendingEncrypted, importPass.value);
        let json: unknown;
        try {
          json = JSON.parse(opened);
        } catch {
          throw new LockError('bad-file', MESSAGES.badFile);
        }
        const checked = validateExport(json);
        if (!checked.ok) setText(errImport, checked.error);
        else if (checked.value.kind === 'plain') offer(checked.value.contents);
      } catch (error) {
        setText(errImport, error instanceof LockError ? error.message : MESSAGES.badFile);
      }
      setText(importStatus, '');
      unlockBtn.disabled = false;
    })();
  });

  mergeBtn.addEventListener('click', () => {
    const incoming = pending;
    if (!incoming) return;
    void (async () => {
      const currentPhotos = await ctx.vault.allPhotos();
      const merged = mergeBottles(ctx.state.bottles, incoming.bottles);
      const photos = mergePhotos(currentPhotos, incoming.photos, merged);
      const here = new Set(ctx.state.bottles.map((b) => b.id));
      const added = [...merged.fromIncoming].filter((id) => !here.has(id)).length;
      const updated = merged.fromIncoming.size - added;
      ctx.flash(`Merged. ${added} added, ${updated} updated, ${incoming.bottles.length - merged.fromIncoming.size} left as they were. You now have ${plural(merged.bottles.length, 'bottle')}.`);
      reset();
      await ctx.change(() => ctx.vault.replaceAll(merged.bottles, photos));
    })();
  });
  cancelBtn.addEventListener('click', reset);

  return h(
    'div',
    { class: 'screen' },
    pageHead('Backup'),
    h('p', { class: 'help', id: 'backup-status' }, backupStatus(lastBackup, ctx.today(), bottles.length > 0)),
    h('p', { class: 'help' }, 'Safari can clear a site\'s data after seven days without a visit, and clearing site data erases the bar. A backup file is the only copy that survives that. The file goes where you save it and nowhere else.'),
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'save-h' },
      h('h2', { id: 'save-h' }, 'Save a backup file'),
      h('p', { class: 'help' }, 'One JSON file with your bottles, and optionally their photos. Settings are not in it; they belong to this device.'),
      h('div', { class: 'check' }, lockOn, h('label', { for: 'lock-on' }, 'Lock the file with a passphrase')),
      lockFields,
      h('div', { class: 'check' }, photosOn, h('label', { for: 'include-photos' }, 'Include photos')),
      photoNote,
      errExport,
      h('div', { class: 'actions' }, exportBtn, exportStatus),
    ),
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'restore-h' },
      h('h2', { id: 'restore-h' }, 'Restore from a backup file'),
      h('div', { class: 'field' }, h('label', { for: 'import-file' }, 'Choose a Bar Vault file, locked or not'), file),
      errImport,
      unlockBox,
      chooseBox,
      importStatus,
    ),
  );
}
