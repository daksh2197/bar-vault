/** The screens that read the ledger and draw it: shelf, bottle list, restock, stats, more, settings, about. */

import { barCsv, smartHomeJson } from '../core/exports';
import { buildSettings, confirmsWipe, WIPE_WORD } from '../core/form';
import { sortBottles, searchBottles, SORT_LABEL, SORTS, type SortKey } from '../core/list';
import { formatCents } from '../core/money';
import { derive, PEG_PRESETS } from '../core/peg';
import { lowBottles, shoppingListCsv, shoppingListText, watchlist } from '../core/restock';
import { SAMPLE_LABEL, sampleBottles } from '../core/sample';
import { barStats } from '../core/stats';
import { CATEGORY_LABEL, type Bottle } from '../core/types';
import type { Ctx } from './ctx';
import { h, s, setText } from './dom';
import { exportBlock, extLink, fillBar, pageHead } from './parts';
import { drawShelf, perRowFor } from './shelf';
import { bucketRange, leftWords, lowCountWords, marketLine, plural, priceLine, rarityLine } from './words';

// What the owner picked on a screen stays picked while they move around. It is not saved anywhere.
let shelfSort: SortKey = 'category';
let listSort: SortKey = 'category';
let listQuery = '';
let pendingDelete: string | null = null;

/** Hooks a screen can register to be undone when the next screen is drawn. */
const cleanups: (() => void)[] = [];
export function runCleanups(): void {
  while (cleanups.length > 0) cleanups.pop()?.();
}

// ---------- photos ----------

const objectUrls: string[] = [];
export function releasePhotoUrls(): void {
  while (objectUrls.length > 0) URL.revokeObjectURL(objectUrls.pop()!);
}

/** A small picture slot that fills in if the bottle has a photo. */
function thumb(ctx: Ctx, id: string): HTMLElement {
  const box = h('span', { class: 'thumb', 'aria-hidden': 'true' });
  void ctx.vault
    .getPhoto(id)
    .then((photo) => {
      if (!photo || !box.isConnected) return;
      const url = URL.createObjectURL(new Blob([photo.bytes as BlobPart], { type: photo.type }));
      objectUrls.push(url);
      box.append(h('img', { src: url, alt: '', width: '56', height: '56' }));
      box.dataset.has = '';
    })
    .catch(() => {
      /* a photo that cannot be read is simply not shown */
    });
  return box;
}

// ---------- shelf ----------

const sampleNote = (ctx: Ctx): HTMLElement | null =>
  ctx.state.bottles.some((b) => b.sample)
    ? h(
        'p',
        { class: 'sample-note' },
        h('span', {}, h('strong', {}, SAMPLE_LABEL), '. The names and prices are made up to show how it works.'),
        h('button', { type: 'button', class: 'text-button', id: 'clear-sample' }, 'Clear sample'),
      )
    : null;

export function loadSample(ctx: Ctx): Promise<boolean> {
  const rows = sampleBottles(ctx.now());
  const have = new Set(ctx.state.bottles.map((b) => b.id));
  return ctx.change(async () => {
    for (const b of rows) if (!have.has(b.id)) await ctx.vault.putBottle(b);
  });
}

export function clearSample(ctx: Ctx): Promise<boolean> {
  const ids = ctx.state.bottles.filter((b) => b.sample).map((b) => b.id);
  ctx.flash(`Cleared ${plural(ids.length, 'sample bottle')}.`);
  return ctx.change(async () => {
    for (const id of ids) await ctx.vault.deleteBottle(id);
  });
}

export function shelfScreen(ctx: Ctx): HTMLElement {
  const { bottles, settings } = ctx.state;
  const root = h('div', { class: 'screen' }, pageHead('Your shelf', bottles.length === 0 ? 'A home bar ledger. What you own, how much is left, what each peg cost.' : undefined));
  const note = sampleNote(ctx);
  if (note) root.append(note);

  if (bottles.length === 0) {
    root.append(
      h(
        'div',
        { class: 'empty' },
        h('p', {}, 'No bottles yet. Add the first one, or look around a made-up bar first.'),
        h('div', { class: 'actions' }, h('a', { class: 'btn btn-primary', href: '#/bottles/new' }, 'Add a bottle'), h('button', { type: 'button', class: 'btn btn-ghost', id: 'load-sample' }, 'Load the sample bar')),
        h('p', { class: 'help' }, `The sample bar has eleven invented bottles. It is labelled "${SAMPLE_LABEL}" and one tap clears it.`),
      ),
    );
    return root;
  }

  const low = lowBottles(bottles).length;
  const sortSel = h('select', { id: 'shelf-sort' }, ...SORTS.map((k) => h('option', { value: k, selected: k === shelfSort }, SORT_LABEL[k])));
  root.append(
    h(
      'div',
      { class: 'shelf-bar' },
      h('p', { class: 'count' }, `${plural(bottles.length, 'bottle')}. `, low > 0 ? h('a', { href: '#/restock' }, lowCountWords(low)) : lowCountWords(low)),
      h('div', { class: 'field inline' }, h('label', { for: 'shelf-sort' }, 'Sort the shelf'), sortSel),
    ),
  );
  const holder = h('div', { class: 'shelf' });
  const draw = (): void => {
    const width = Math.min(window.innerWidth - 32, 828);
    holder.replaceChildren(drawShelf(sortBottles(bottles, shelfSort, settings.pegMl), settings.pegMl, perRowFor(width)));
  };
  draw();
  let lastPer = perRowFor(Math.min(window.innerWidth - 32, 828));
  const onResize = (): void => {
    const per = perRowFor(Math.min(window.innerWidth - 32, 828));
    if (per !== lastPer) {
      lastPer = per;
      draw();
    }
  };
  window.addEventListener('resize', onResize);
  cleanups.push(() => window.removeEventListener('resize', onResize));
  sortSel.addEventListener('change', () => {
    shelfSort = SORTS.includes(sortSel.value as SortKey) ? (sortSel.value as SortKey) : 'category';
    draw();
  });
  root.append(holder);
  root.append(
    h(
      'p',
      { class: 'help' },
      'The orange is what is left. A dim outline is an empty bottle. A diamond marks a bottle you flagged as limited or numbered. Tap a bottle to open it. Each bottle is drawn from the numbers you typed.',
    ),
  );
  return root;
}

// ---------- bottle list ----------

function bottleCard(ctx: Ctx, b: Bottle): HTMLElement {
  const d = derive(b, ctx.state.settings.pegMl);
  const confirming = pendingDelete === b.id;
  const tags = [
    d.low ? h('span', { class: 'tag tag-low' }, 'Low') : null,
    b.watch ? h('span', { class: 'tag' }, 'Watching') : null,
    b.limited ? h('span', { class: 'tag' }, 'Limited or numbered') : null,
    b.sample ? h('span', { class: 'tag' }, 'SAMPLE') : null,
  ];
  const fig = (name: string, value: string): HTMLElement => h('div', { class: 'fig' }, h('dt', {}, name), h('dd', {}, value));
  return h(
    'li',
    { class: 'bottle-card', 'data-id': b.id },
    thumb(ctx, b.id),
    h(
      'div',
      { class: 'bc-main' },
      h('h2', {}, h('a', { href: `#/bottles/${b.id}` }, b.name)),
      h('p', { class: 'meta' }, `${CATEGORY_LABEL[b.category]} · ${b.sizeMl} ml · ${rarityLine(b)}`),
      h('div', { class: 'tags' }, tags),
      fillBar(b.fillPct, `${b.fillPct} percent left`),
      h(
        'dl',
        { class: 'figs' },
        fig('Left', leftWords(b, d)),
        fig('Price per peg', priceLine(d, b.paidCents)),
        fig('Value left', formatCents(BigInt(d.valueLeftCents))),
        fig('Paid', formatCents(BigInt(b.paidCents))),
      ),
      b.market ? h('p', { class: 'kept' }, marketLine(b)) : null,
      b.watch && b.watchNote ? h('p', { class: 'kept' }, `Watching: ${b.watchNote}`) : null,
      h(
        'div',
        { class: 'actions' },
        h('a', { class: 'btn btn-ghost', href: `#/bottles/${b.id}`, 'aria-label': `Edit ${b.name}` }, 'Edit'),
        confirming
          ? [
              h('button', { type: 'button', class: 'btn btn-danger', 'data-delete-yes': b.id, 'aria-label': `Yes, delete ${b.name}` }, 'Yes, delete'),
              h('button', { type: 'button', class: 'btn btn-ghost', 'data-delete-no': b.id }, 'Keep'),
            ]
          : h('button', { type: 'button', class: 'btn btn-ghost', 'data-delete': b.id, 'aria-label': `Delete ${b.name}` }, 'Delete'),
      ),
    ),
  );
}

export function bottlesScreen(ctx: Ctx, redraw: () => void): HTMLElement {
  const { bottles, settings } = ctx.state;
  const root = h('div', { class: 'screen' }, pageHead('Bottles'));
  const note = sampleNote(ctx);
  if (note) root.append(note);
  root.append(h('div', { class: 'actions top' }, h('a', { class: 'btn btn-primary', href: '#/bottles/new' }, 'Add a bottle')));

  if (bottles.length === 0) {
    root.append(h('div', { class: 'empty' }, h('p', {}, 'Nothing here yet.'), h('button', { type: 'button', class: 'btn btn-ghost', id: 'load-sample' }, 'Load the sample bar')));
    return root;
  }
  const search = h('input', { id: 'list-search', type: 'search', autocomplete: 'off', value: listQuery, maxlength: '120' });
  const sortSel = h('select', { id: 'list-sort' }, ...SORTS.map((k) => h('option', { value: k, selected: k === listSort }, SORT_LABEL[k])));
  const list = h('ul', { class: 'bottle-list' });
  const status = h('p', { class: 'count', role: 'status', id: 'list-count' });
  const draw = (): void => {
    const rows = sortBottles(searchBottles(bottles, listQuery), listSort, settings.pegMl);
    list.replaceChildren(...rows.map((b) => bottleCard(ctx, b)));
    setText(status, rows.length === bottles.length ? plural(bottles.length, 'bottle') : `${rows.length} of ${plural(bottles.length, 'bottle')} match.`);
  };
  search.addEventListener('input', () => {
    listQuery = search.value;
    draw();
  });
  sortSel.addEventListener('change', () => {
    listSort = SORTS.includes(sortSel.value as SortKey) ? (sortSel.value as SortKey) : 'category';
    draw();
  });
  list.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button');
    if (!button) return;
    const d = button.dataset;
    if (d.delete) {
      pendingDelete = d.delete;
      redraw();
      document.querySelector<HTMLElement>(`[data-delete-yes="${CSS.escape(d.delete)}"]`)?.focus();
    } else if (d.deleteNo) {
      const id = d.deleteNo;
      pendingDelete = null;
      redraw();
      document.querySelector<HTMLElement>(`[data-delete="${CSS.escape(id)}"]`)?.focus();
    } else if (d.deleteYes) {
      const id = d.deleteYes;
      const name = bottles.find((b) => b.id === id)?.name ?? 'The bottle';
      pendingDelete = null;
      ctx.flash(`${name} deleted.`);
      void ctx.change(() => ctx.vault.deleteBottle(id));
    }
  });
  root.append(
    h(
      'div',
      { class: 'toolbar' },
      h('div', { class: 'field' }, h('label', { for: 'list-search' }, 'Search'), search),
      h('div', { class: 'field' }, h('label', { for: 'list-sort' }, 'Sort'), sortSel),
    ),
    status,
    list,
  );
  draw();
  return root;
}

// ---------- restock ----------

export function restockScreen(ctx: Ctx): HTMLElement {
  const { bottles, settings } = ctx.state;
  const low = lowBottles(bottles);
  const watched = watchlist(bottles);
  const root = h('div', { class: 'screen' }, pageHead('Restock', 'What is at or under its own low line, and what you chose to watch.'));
  const note = sampleNote(ctx);
  if (note) root.append(note);

  root.append(
    h(
      'section',
      { class: 'block', 'aria-labelledby': 'low-h' },
      h('h2', { id: 'low-h' }, 'Low'),
      low.length === 0
        ? h('p', { class: 'help' }, bottles.length === 0 ? 'Add bottles and this list fills itself.' : 'Nothing is at or under its low line.')
        : h(
            'ul',
            { class: 'plain-list' },
            low.map((b) => {
              const d = derive(b, settings.pegMl);
              return h('li', {}, h('a', { href: `#/bottles/${b.id}` }, b.name), h('span', { class: 'sub' }, `${leftWords(b, d)}. Low line ${b.lowPct}%.`));
            }),
          ),
    ),
    h(
      'section',
      { class: 'block', 'aria-labelledby': 'watch-h' },
      h('h2', { id: 'watch-h' }, 'Watchlist'),
      h('p', { class: 'help' }, 'A flag and a note you write yourself on a bottle. The app does not look prices up anywhere, so it cannot tell you a bottle is on sale.'),
      watched.length === 0
        ? h('p', { class: 'help' }, 'No bottle is on the watchlist. Tick "Watch this bottle" on a bottle to add it.')
        : h(
            'ul',
            { class: 'plain-list' },
            watched.map((b) => h('li', {}, h('a', { href: `#/bottles/${b.id}` }, b.name), h('span', { class: 'sub' }, b.watchNote ? b.watchNote : 'No note.'))),
          ),
    ),
    h(
      'section',
      { class: 'block', 'aria-labelledby': 'exports-h' },
      h('h2', { id: 'exports-h' }, 'Exports'),
      h('p', { class: 'help' }, 'Each one is made on this device when you press the button. Copy puts it on the clipboard. Download saves a file.'),
      exportBlock({
        id: 'ex-shop-text',
        title: 'Shopping list, text',
        help: 'Low bottles first, then watched ones, for pasting into a note or a message.',
        filename: `bar-vault-shopping-${ctx.today()}.txt`,
        mime: 'text/plain',
        make: () => shoppingListText(ctx.state.bottles, ctx.state.settings.pegMl, ctx.today()),
      }),
      exportBlock({
        id: 'ex-shop-csv',
        title: 'Shopping list, CSV',
        help: 'The same list as a table for a spreadsheet.',
        filename: `bar-vault-shopping-${ctx.today()}.csv`,
        mime: 'text/csv',
        make: () => shoppingListCsv(ctx.state.bottles),
      }),
      exportBlock({
        id: 'ex-bar-csv',
        title: 'Whole bar, CSV',
        help: 'Every bottle with ml left, pegs left and price per peg in Canadian dollars.',
        filename: `bar-vault-bar-${ctx.today()}.csv`,
        mime: 'text/csv',
        make: () => barCsv(ctx.state.bottles, ctx.state.settings.pegMl),
      }),
      exportBlock({
        id: 'ex-smart-json',
        title: 'Smart-home JSON',
        help: 'The file the Smart home page explains, format bar-vault-smart-home/1.',
        filename: `bar-vault-smart-home-${ctx.today()}.json`,
        mime: 'application/json',
        make: () => smartHomeJson(ctx.state.bottles, ctx.state.settings.pegMl, new Date()),
      }),
    ),
  );
  return root;
}

// ---------- stats ----------

function histogramSvg(buckets: { fromCents: number; toCents: number; count: number }[], caption: HTMLElement): SVGElement {
  const W = 320;
  const H = 190;
  const left = 8;
  const right = 8;
  const top = 18;
  const bottom = 30;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const slot = plotW / buckets.length;
  const gap = Math.min(4, slot * 0.2);
  const svg = s('svg', { class: 'histo', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Histogram of price per peg. The table below gives the same numbers.' });
  svg.append(s('line', { class: 'axis', x1: left, x2: W - right, y1: top + plotH, y2: top + plotH }));
  svg.append(s('line', { class: 'grid', x1: left, x2: W - right, y1: top, y2: top }));
  buckets.forEach((b, i) => {
    const hgt = b.count === 0 ? 0 : Math.max(3, Math.round((plotH * b.count) / max));
    const x = left + i * slot + gap / 2;
    const y = top + plotH - hgt;
    const w = Math.max(2, slot - gap);
    const rect = s('rect', { class: 'bar', x, y, width: w, height: hgt, rx: Math.min(4, w / 2), tabindex: 0, 'aria-label': `${bucketRange(b.fromCents, b.toCents)}: ${plural(b.count, 'bottle')}` });
    const say = (): void => setText(caption, `${bucketRange(b.fromCents, b.toCents)} a peg: ${plural(b.count, 'bottle')}.`);
    rect.addEventListener('pointerenter', say);
    rect.addEventListener('focus', say);
    svg.append(rect);
    if (b.count > 0) svg.append(s('text', { class: 'count-label', x: x + w / 2, y: y - 4, 'text-anchor': 'middle' }, String(b.count)));
  });
  const edges: [number, number, string][] = [[0, left, 'start']];
  if (buckets.length > 2) edges.push([buckets.length >> 1, left + (buckets.length >> 1) * slot, 'middle']);
  edges.push([buckets.length, W - right, 'end']);
  for (const [i, x, anchor] of edges) {
    const cents = i === buckets.length ? buckets[buckets.length - 1]!.toCents : buckets[i]!.fromCents;
    svg.append(s('text', { class: 'tick', x, y: H - 12, 'text-anchor': anchor }, formatCents(BigInt(cents))));
  }
  return svg;
}

export function statsScreen(ctx: Ctx): HTMLElement {
  const { bottles, settings } = ctx.state;
  const st = barStats(bottles, settings.pegMl);
  const root = h('div', { class: 'screen' }, pageHead('Stats', 'Every figure here is worked out on this device from the numbers you typed.'));
  const note = sampleNote(ctx);
  if (note) root.append(note);
  if (bottles.length === 0) {
    root.append(h('div', { class: 'empty' }, h('p', {}, 'No bottles, so nothing to count yet.'), h('a', { class: 'btn btn-primary', href: '#/bottles/new' }, 'Add a bottle')));
    return root;
  }
  const money = (c: bigint | number | null): string => (c === null ? 'none' : formatCents(BigInt(c)));
  const tile = (label: string, value: string, sub = ''): HTMLElement => h('div', { class: 'stat' }, h('dt', {}, label), h('dd', {}, value), sub ? h('dd', { class: 'asof' }, sub) : null);
  root.append(
    h(
      'dl',
      { class: 'stat-grid' },
      tile('Bottles', String(st.count)),
      tile('Low', String(st.lowCount), 'at or under their own line'),
      tile('Total paid', money(st.totalPaidCents)),
      tile('Value left', money(st.valueLeftCents), 'paid price, scaled by what is left'),
      tile('Average per peg', money(st.averagePerPegCents), `${settings.pegMl} ml pegs`),
      tile('Median per peg', money(st.medianPerPegCents), `${settings.pegMl} ml pegs`),
    ),
    h(
      'p',
      { class: 'help' },
      st.pricedCount === st.count
        ? `Per-peg figures use all ${plural(st.count, 'bottle')}.`
        : `Per-peg figures use the ${plural(st.pricedCount, 'bottle')} with a price. A gift entered as $0.00 is left out, because zero is not a price paid.`,
    ),
  );

  const caption = h('p', { class: 'help', role: 'status', id: 'histo-caption' }, st.histogram.length > 0 ? 'Hover or focus a bar to read it.' : '');
  root.append(
    h(
      'section',
      { class: 'block', 'aria-labelledby': 'histo-h' },
      h('h2', { id: 'histo-h' }, 'Price per peg'),
      st.histogram.length === 0
        ? h('p', { class: 'help' }, 'No bottle has a price, so there is nothing to chart.')
        : [
            h('p', { class: 'help' }, `How many bottles fall in each price band, for a ${settings.pegMl} ml peg. Bands are worked out from your own prices.`),
            h('div', { class: 'chart' }, histogramSvg(st.histogram, caption)),
            caption,
            h(
              'details',
              { class: 'table-view' },
              h('summary', {}, 'Show as a table'),
              h(
                'table',
                { class: 'data-table' },
                h('caption', { class: 'vh' }, 'Bottles by price per peg'),
                h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Price per peg'), h('th', { scope: 'col', class: 'num' }, 'Bottles'))),
                h('tbody', {}, st.histogram.map((b) => h('tr', {}, h('th', { scope: 'row' }, bucketRange(b.fromCents, b.toCents)), h('td', { class: 'num' }, String(b.count))))),
              ),
            ),
          ],
    ),
    h(
      'section',
      { class: 'block', 'aria-labelledby': 'cat-h' },
      h('h2', { id: 'cat-h' }, 'Paid by category'),
      h(
        'table',
        { class: 'data-table' },
        h('caption', { class: 'vh' }, 'Total paid by category'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Category'), h('th', { scope: 'col', class: 'num' }, 'Bottles'), h('th', { scope: 'col', class: 'num' }, 'Paid'))),
        h(
          'tbody',
          {},
          st.paidByCategory.map((r) => h('tr', {}, h('th', { scope: 'row' }, CATEGORY_LABEL[r.category]), h('td', { class: 'num' }, String(r.count)), h('td', { class: 'num' }, formatCents(r.paidCents)))),
        ),
      ),
    ),
    h(
      'p',
      { class: 'help' },
      'This app never fetches or guesses a price. The reference prices on a bottle are ones you typed, and they are not used in any figure on this page.',
    ),
  );
  return root;
}

// ---------- more ----------

export function moreScreen(): HTMLElement {
  const item = (href: string, title: string, text: string): HTMLElement =>
    h('li', {}, h('a', { class: 'more-item', href }, h('strong', {}, title), h('span', {}, text)));
  return h(
    'div',
    { class: 'screen' },
    pageHead('More'),
    h(
      'ul',
      { class: 'more-list' },
      item('#/backup', 'Backup', 'Save the bar as a file, locked or not, and bring it back.'),
      item('#/smart-home', 'Smart home', 'A small JSON file and a one-line summary for Alexa, Google Home or Apple Shortcuts.'),
      item('#/settings', 'Settings', 'Peg size, the default low line, clear the sample, wipe everything.'),
      item('#/about', 'About', 'What this is, what it does not do, where the data lives.'),
    ),
  );
}

// ---------- settings ----------

export function settingsScreen(ctx: Ctx): HTMLElement {
  const { settings, bottles } = ctx.state;
  const sampleCount = bottles.filter((b) => b.sample).length;
  const peg = h('input', { id: 's-peg', type: 'text', inputmode: 'numeric', autocomplete: 'off', value: String(settings.pegMl), 'aria-describedby': 'peg-help' });
  const low = h('input', { id: 's-low', type: 'text', inputmode: 'numeric', autocomplete: 'off', value: String(settings.defaultLowPct) });
  const errPeg = h('p', { class: 'err', id: 'err-pegMl' });
  const errLow = h('p', { class: 'err', id: 'err-defaultLowPct' });
  const status = h('span', { class: 'status', role: 'status', id: 'settings-status' });
  const chips = PEG_PRESETS.map((p) =>
    h('button', { type: 'button', class: 'chip', 'data-peg': String(p), 'aria-label': `Set the peg to ${p} ml` }, `${p} ml`),
  );
  for (const chip of chips) {
    chip.addEventListener('click', () => {
      peg.value = chip.dataset.peg ?? '';
    });
  }
  const form = h(
    'form',
    { id: 'settings-form', novalidate: true },
    h(
      'div',
      { class: 'field' },
      h('label', { for: 's-peg' }, 'Peg size in ml'),
      peg,
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Peg presets' }, chips),
      h('p', { class: 'readout-line', id: 'peg-help' }, 'From 5 to 500 ml. In Indian usage a small peg is 30 ml and a large peg 60 ml. Changing this changes pegs left and price per peg on every screen.'),
      errPeg,
    ),
    h('div', { class: 'field' }, h('label', { for: 's-low' }, 'Default low line, percent'), low, h('p', { class: 'readout-line' }, 'New bottles start with this. Each bottle can have its own. A bottle is low at or under its line.'), errLow),
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save settings'), status),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    for (const [input, err] of [[peg, errPeg], [low, errLow]] as const) {
      setText(err, '');
      input.removeAttribute('aria-invalid');
    }
    const r = buildSettings(peg.value, low.value);
    if (!r.ok) {
      if (r.errors.pegMl) (setText(errPeg, r.errors.pegMl), peg.setAttribute('aria-invalid', 'true'));
      if (r.errors.defaultLowPct) (setText(errLow, r.errors.defaultLowPct), low.setAttribute('aria-invalid', 'true'));
      (r.errors.pegMl ? peg : low).focus();
      return;
    }
    ctx.flash('Settings saved.');
    void ctx.change(() => ctx.vault.setSettings(r.value));
  });

  const wipeInput = h('input', { id: 'wipe-word', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const wipeErr = h('p', { class: 'err', id: 'err-wipe' });
  const wipeBtn = h('button', { type: 'button', class: 'btn btn-danger', id: 'wipe-btn' }, 'Wipe everything');
  wipeBtn.addEventListener('click', () => {
    const r = confirmsWipe(wipeInput.value);
    if (!r.ok) {
      setText(wipeErr, r.error);
      wipeInput.setAttribute('aria-invalid', 'true');
      wipeInput.focus();
      return;
    }
    ctx.flash('Everything was wiped from this browser.');
    void ctx.change(() => ctx.vault.wipe()).then(() => ctx.navigate('#/'));
  });

  const clearBtn = h('button', { type: 'button', class: 'btn btn-ghost', id: 'clear-sample', disabled: sampleCount === 0 }, sampleCount === 0 ? 'No sample bottles here' : `Clear ${plural(sampleCount, 'sample bottle')}`);

  return h(
    'div',
    { class: 'screen' },
    pageHead('Settings'),
    h('section', { class: 'block', 'aria-labelledby': 'set-h' }, h('h2', { id: 'set-h' }, 'Pegs and low line'), form),
    h(
      'section',
      { class: 'block', 'aria-labelledby': 'sample-h' },
      h('h2', { id: 'sample-h' }, 'Sample bar'),
      h('p', { class: 'help' }, `${SAMPLE_LABEL}. Clearing removes only the rows flagged as sample and leaves your own bottles alone.`),
      h('div', { class: 'actions' }, clearBtn, bottles.some((b) => b.sample) ? null : h('button', { type: 'button', class: 'btn btn-ghost', id: 'load-sample' }, 'Load the sample bar')),
    ),
    h(
      'section',
      { class: 'block', 'aria-labelledby': 'wipe-h' },
      h('h2', { id: 'wipe-h' }, 'Wipe everything'),
      h('p', { class: 'help' }, 'Deletes every bottle, every photo and the settings from this browser. Save a backup first. There is no undo.'),
      h('div', { class: 'field' }, h('label', { for: 'wipe-word' }, `Type ${WIPE_WORD} to confirm`), wipeInput, wipeErr),
      h('div', { class: 'actions' }, wipeBtn),
    ),
  );
}

// ---------- about ----------

export function aboutScreen(): HTMLElement {
  return h(
    'div',
    { class: 'screen' },
    pageHead('About'),
    h(
      'section',
      { class: 'block about', 'aria-labelledby': 'about-h' },
      h('h2', { id: 'about-h' }, 'What this is'),
      h('p', {}, 'Bar Vault is a ledger for the bottles in a home bar: what you own, how much is left, what each peg cost, which bottles you tagged as rare, and what is low.'),
      h('p', { id: 'about-age' }, 'For adults of legal drinking age where you live (18 in Alberta). This app records what you own. It gives no drinking advice.'),
      h('p', { id: 'about-price' }, 'This app never fetches or guesses a price. Every price on screen is one you typed. A bottle goes on the watchlist only when you tick "Watch this bottle" yourself.'),
      h('p', { id: 'about-sample' }, `The sample bar is invented. Its names are made up and it is labelled "${SAMPLE_LABEL}".`),
      h('p', { id: 'about-privacy' }, 'Nothing you type leaves this device. After the page loads the app makes no requests, and a Content-Security-Policy tag in the page blocks fetch, XHR and outside images. Bottles and photos live in this browser only.'),
    ),
    h(
      'section',
      { class: 'block about', 'aria-labelledby': 'store-h' },
      h('h2', { id: 'store-h' }, 'How it is stored'),
      h('p', {}, 'The data lives in IndexedDB, a database built into your browser, on this device. Nothing is backed up for you. Clearing site data erases it, and Safari can clear a site you have not opened for seven days. Save a backup file now and then.'),
      h('p', {}, 'Photos are shrunk on your device to 640 px on the longest side and saved in the same browser database. They go into a backup only if you tick the box.'),
    ),
    h(
      'section',
      { class: 'block about', 'aria-labelledby': 'src-h' },
      h('h2', { id: 'src-h' }, 'Sources and licence'),
      h('p', {}, 'Legal drinking age by province: ', extLink('https://en.wikipedia.org/wiki/Alcoholic_drinks_in_Canada', 'Wikipedia, "Alcoholic drinks in Canada"'), ', fetched Oct 23, 2026. It is 18 in Alberta, Manitoba and Quebec.'),
      h('p', {}, 'The Smart home page cites each vendor page it relies on, with the date it was fetched.'),
      h('p', {}, 'MIT licence. Storage, lock and form code follow coin-vault by the same author. Not affiliated with any brand shown or named by you.'),
    ),
  );
}

export function notFoundScreen(): HTMLElement {
  return h('div', { class: 'screen' }, pageHead('Page not found'), h('p', {}, 'There is no page at that address.'), h('a', { class: 'btn btn-primary', href: '#/' }, 'Back to the shelf'));
}
