/** The add and edit form. All the reading of typed text happens in core/form.ts; this file only draws and wires it. */

import { type BottleField, type BottleInput, blankInput, bottleToInput, buildBottle } from '../core/form';
import { formatCents, parseCents, parseWhole } from '../core/money';
import { mlLeft, pegsFrom, pricePerPegCents, SIZE_MAX_ML, SIZE_MIN_ML } from '../core/peg';
import { canvasResize, makePhoto } from '../core/photo';
import { newId } from '../core/schema';
import { CATEGORIES, CATEGORY_LABEL, type Photo, RARITIES, RARITY_LABEL } from '../core/types';
import type { Ctx } from './ctx';
import { h, setText } from './dom';
import { pageHead } from './parts';
import { notFoundScreen } from './screens';
import { pegsWords } from './words';

type PhotoChange = { kind: 'keep' } | { kind: 'set'; photo: Photo } | { kind: 'remove' };

const ORDER: BottleField[] = [
  'name', 'category', 'rarity', 'size', 'paid', 'fill', 'boughtWhere', 'boughtOn', 'limited', 'bottleNumber',
  'marketAmount', 'marketSource', 'marketDate', 'watch', 'watchNote', 'lowPct', 'notes',
];

export function bottleFormScreen(ctx: Ctx, id: string | null): HTMLElement {
  const existing = id ? ctx.state.bottles.find((b) => b.id === id) : undefined;
  if (id && !existing) return notFoundScreen();
  const bottleId = existing?.id ?? newId();
  const settings = ctx.state.settings;
  const start = existing ? bottleToInput(existing) : blankInput(settings);
  let photoChange: PhotoChange = { kind: 'keep' };

  const text = (key: BottleField, attrs: Record<string, string> = {}): HTMLInputElement =>
    h('input', { id: `f-${key}`, name: key, type: 'text', autocomplete: 'off', value: String(start[key]), ...attrs });
  const select = (key: 'category' | 'rarity', options: readonly string[], labels: Record<string, string>): HTMLSelectElement =>
    h('select', { id: `f-${key}`, name: key }, ...options.map((o) => h('option', { value: o, selected: start[key] === o }, labels[o] ?? o)));
  const check = (key: 'limited' | 'watch'): HTMLInputElement => h('input', { id: `f-${key}`, name: key, type: 'checkbox', checked: start[key] });

  const c = {
    name: text('name', { maxlength: '120' }),
    category: select('category', CATEGORIES, CATEGORY_LABEL),
    rarity: select('rarity', RARITIES, RARITY_LABEL),
    size: text('size', { inputmode: 'numeric' }),
    paid: text('paid', { inputmode: 'decimal' }),
    fill: h('input', { id: 'f-fill', name: 'fill', type: 'range', min: '0', max: '100', step: '1', value: start.fill }),
    boughtWhere: text('boughtWhere', { maxlength: '200' }),
    boughtOn: h('input', { id: 'f-boughtOn', name: 'boughtOn', type: 'date', value: start.boughtOn, max: ctx.today() }),
    limited: check('limited'),
    bottleNumber: text('bottleNumber', { maxlength: '40' }),
    marketAmount: text('marketAmount', { inputmode: 'decimal' }),
    marketSource: text('marketSource', { maxlength: '200' }),
    marketDate: h('input', { id: 'f-marketDate', name: 'marketDate', type: 'date', value: start.marketDate, max: ctx.today() }),
    watch: check('watch'),
    watchNote: h('textarea', { id: 'f-watchNote', name: 'watchNote', rows: '2', maxlength: '500' }, start.watchNote),
    lowPct: text('lowPct', { inputmode: 'numeric' }),
    notes: h('textarea', { id: 'f-notes', name: 'notes', rows: '3', maxlength: '2000' }, start.notes),
  };
  const controls = c as unknown as Record<BottleField, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
  const err = (key: string): HTMLElement => h('p', { class: 'err', id: `err-${key}` });

  const field = (key: BottleField, label: string, control: HTMLElement, hint?: string): HTMLElement =>
    h('div', { class: 'field' }, h('label', { for: `f-${key}` }, label), control, hint ? h('p', { class: 'readout-line', id: `hint-${key}` }, hint) : null, err(key));
  const checkRow = (key: 'limited' | 'watch', label: string): HTMLElement => h('div', { class: 'check' }, controls[key], h('label', { for: `f-${key}` }, label));

  // Slider with a number beside it, presets underneath, and a plain-words readout of what the numbers mean.
  const fillOut = h('span', { class: 'fill-out', 'aria-hidden': 'true', id: 'fill-out' });
  const readout = h('p', { class: 'readout-line', id: 'readout' });
  const presets = [['Empty', 0], ['25%', 25], ['50%', 50], ['75%', 75], ['Full', 100]] as const;
  const chips = presets.map(([label, v]) =>
    h('button', { type: 'button', class: 'chip', 'data-fill': String(v), 'aria-label': `Set fill to ${v} percent` }, label),
  );

  const refresh = (): void => {
    const fillN = Number(c.fill.value);
    setText(fillOut, `${fillN}%`);
    c.fill.setAttribute('aria-valuetext', `${fillN} percent left`);
    const size = parseWhole(c.size.value, SIZE_MIN_ML, SIZE_MAX_ML, 'Size');
    if (!size.ok) {
      setText(readout, 'Type the bottle size in ml to see ml and pegs left.');
      return;
    }
    const ml = mlLeft(size.value, fillN);
    const peg = settings.pegMl;
    const paid = parseCents(c.paid.value, { allowZero: true });
    const price = paid.ok ? (paid.value === 0 ? ' Paid nothing, so no price per peg.' : ` Price per peg ${formatCents(BigInt(pricePerPegCents(paid.value, size.value, peg)))}.`) : '';
    setText(readout, `${ml} ml left, ${pegsWords(pegsFrom(ml, peg))} of ${peg} ml.${price}`);
  };
  for (const chip of chips) {
    chip.addEventListener('click', () => {
      c.fill.value = chip.dataset.fill ?? '0';
      refresh();
    });
  }

  // Photo.
  const photoInput = h('input', { id: 'f-photo', type: 'file', accept: 'image/*' });
  const photoErr = h('p', { class: 'err', id: 'err-photo' });
  const photoBox = h('div', { class: 'photo-box' });
  const removePhoto = h('button', { type: 'button', class: 'btn btn-ghost', id: 'remove-photo', hidden: true }, 'Remove photo');
  const showPhoto = (bytes: Uint8Array | null): void => {
    if (photoBox.dataset.url) URL.revokeObjectURL(photoBox.dataset.url);
    delete photoBox.dataset.url;
    photoBox.replaceChildren();
    removePhoto.hidden = bytes === null;
    if (!bytes) return;
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
    photoBox.append(h('img', { src: url, alt: 'The photo you chose for this bottle', class: 'photo-preview' }));
    photoBox.dataset.url = url;
  };
  if (existing) {
    void ctx.vault.getPhoto(existing.id).then((p) => {
      if (p && photoChange.kind === 'keep') showPhoto(p.bytes);
    }).catch(() => undefined);
  }
  photoInput.addEventListener('change', () => {
    setText(photoErr, '');
    const file = photoInput.files?.[0];
    if (!file) return;
    setText(photoErr, 'Shrinking the picture on this device…');
    void makePhoto(bottleId, file, canvasResize).then((r) => {
      if (!r.ok) {
        setText(photoErr, r.error);
        photoInput.value = '';
        return;
      }
      setText(photoErr, '');
      photoChange = { kind: 'set', photo: r.value };
      showPhoto(r.value.bytes);
    });
  });
  removePhoto.addEventListener('click', () => {
    photoChange = { kind: 'remove' };
    photoInput.value = '';
    showPhoto(null);
    photoInput.focus();
  });

  const summary = h('p', { class: 'form-error', role: 'alert', id: 'form-error', hidden: true });
  const form = h(
    'form',
    { id: 'bottle-form', class: 'panel', novalidate: true },
    summary,
    field('name', 'Name', c.name),
    h('div', { class: 'row2' }, field('category', 'Category', c.category), field('rarity', 'Rarity tag (your own)', c.rarity)),
    h('div', { class: 'row2' }, field('size', 'Size in ml', c.size, '750 for a standard bottle, 1000 for a litre.'), field('paid', 'Paid (CAD)', c.paid, 'Type 0 for a gift.')),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'f-fill' }, 'How full it is ', fillOut),
      c.fill,
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Fill presets' }, chips),
      readout,
      err('fill'),
    ),
    h('div', { class: 'row2' }, field('boughtWhere', 'Bought where (optional)', c.boughtWhere), field('boughtOn', 'Bought on (optional)', c.boughtOn)),
    checkRow('limited', 'Limited or numbered release'),
    field('bottleNumber', 'Bottle number (optional)', c.bottleNumber, 'Free text, such as 214 of 1,000.'),
    h(
      'fieldset',
      { class: 'group' },
      h('legend', {}, 'Reference price you typed (optional)'),
      h('p', { class: 'help' }, 'Three fields, all typed by you from somewhere you looked. The app never fetches or guesses a price, and no figure in the app uses this one.'),
      h('div', { class: 'row2' }, field('marketAmount', 'Amount (CAD)', c.marketAmount), field('marketDate', 'Date', c.marketDate)),
      field('marketSource', 'Source', c.marketSource),
    ),
    checkRow('watch', 'Watch this bottle'),
    field('watchNote', 'Watch note (optional)', c.watchNote, 'For example: a shop had it at a lower price on Oct 20. You write this; the app does not check any shop.'),
    field('lowPct', 'Low line, percent', c.lowPct, 'The bottle counts as low at or under this fill.'),
    h('div', { class: 'field' }, h('label', { for: 'f-photo' }, 'Photo (optional)'), photoInput, h('p', { class: 'readout-line' }, 'Shrunk to 640 px on this device and kept here. It is not uploaded anywhere.'), photoBox, h('div', { class: 'actions' }, removePhoto), photoErr),
    field('notes', 'Notes (optional)', c.notes),
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn btn-primary', id: 'save-bottle' }, existing ? 'Save changes' : 'Save bottle'), h('a', { class: 'btn btn-ghost', href: '#/bottles' }, 'Cancel')),
  );

  const readForm = (): BottleInput => {
    const out = {} as Record<BottleField, string | boolean>;
    for (const key of ORDER) {
      const control = controls[key];
      out[key] = control instanceof HTMLInputElement && control.type === 'checkbox' ? control.checked : control.value;
    }
    return out as unknown as BottleInput;
  };

  form.addEventListener('input', refresh);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    for (const key of ORDER) {
      const e = form.querySelector<HTMLElement>(`#err-${key}`);
      if (e) setText(e, '');
      controls[key].removeAttribute('aria-invalid');
      controls[key].removeAttribute('aria-describedby');
    }
    summary.hidden = true;
    const result = buildBottle(readForm(), bottleId, ctx.now(), ctx.today(), existing);
    if (!result.ok) {
      let first: BottleField | null = null;
      for (const key of ORDER) {
        const message = result.errors[key];
        if (!message) continue;
        setText(form.querySelector<HTMLElement>(`#err-${key}`)!, message);
        controls[key].setAttribute('aria-invalid', 'true');
        controls[key].setAttribute('aria-describedby', `err-${key}`);
        first ??= key;
      }
      const n = Object.keys(result.errors).length;
      setText(summary, `${n} ${n === 1 ? 'thing needs' : 'things need'} fixing before this can be saved.`);
      summary.hidden = false;
      if (first) controls[first].focus();
      return;
    }
    const saved = result.value;
    ctx.flash(`${saved.name} saved.`);
    void ctx
      .change(async () => {
        await ctx.vault.putBottle(saved);
        if (photoChange.kind === 'set') await ctx.vault.putPhoto(photoChange.photo);
        else if (photoChange.kind === 'remove') await ctx.vault.deletePhoto(saved.id);
      }, false)
      .then((ok) => {
        if (ok) ctx.navigate('#/bottles');
      });
  });

  refresh();
  const root = h('div', { class: 'screen' }, pageHead(existing ? 'Edit bottle' : 'Add a bottle'));
  if (existing?.sample) root.append(h('p', { class: 'sample-note' }, h('span', {}, h('strong', {}, 'Invented sample bar, not a real one'), '. Editing this row keeps it a sample.')));
  root.append(form);
  return root;
}
