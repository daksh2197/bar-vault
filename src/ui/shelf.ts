/** The shelf: an SVG drawn from the ledger. Bottles wrap onto more shelves as the screen gets narrower. */

import { derive } from '../core/peg';
import { CATEGORY_LABEL, type Bottle } from '../core/types';
import { s } from './dom';
import { leftWords } from './words';
import { liquidTop, SIL_HEIGHT, SIL_WIDTH, SILHOUETTES } from './silhouettes';

export const SLOT_W = 72;
export const ROW_H = 192;
export const MIN_PER_ROW = 3;
export const MAX_PER_ROW = 10;
/** Drawn units that fit across one shelf at a screen width, with room for the 16 px page gutters. */
export const UNITS_PER_PX = 1 / 1.15;

/** How many bottles sit on one shelf for a given usable width in pixels. */
export function perRowFor(widthPx: number): number {
  if (!Number.isFinite(widthPx)) return MIN_PER_ROW;
  return Math.max(MIN_PER_ROW, Math.min(MAX_PER_ROW, Math.floor(widthPx / 84)));
}

export interface Slot {
  x: number;
  y: number;
  row: number;
  col: number;
}

export function shelfLayout(count: number, perRow: number): { slots: Slot[]; rows: number; width: number; height: number } {
  const n = Math.max(0, Math.floor(count));
  const per = Math.max(1, Math.floor(perRow));
  const rows = Math.ceil(n / per);
  const slots = Array.from({ length: n }, (_, i) => ({ row: Math.floor(i / per), col: i % per, x: (i % per) * SLOT_W, y: Math.floor(i / per) * ROW_H }));
  return { slots, rows, width: Math.min(n, per) * SLOT_W, height: rows * ROW_H };
}

/** The name split over at most two short lines for the label under a bottle. The full name stays in the link's label. */
export function nameLines(name: string, max = 11): string[] {
  const chars = [...name.replace(/^SAMPLE /, '').trim()];
  if (chars.length <= max) return [chars.join('')];
  const head = chars.slice(0, max + 1);
  const space = head.lastIndexOf(' ');
  const cut = space >= 4 ? space : max;
  const first = chars.slice(0, cut).join('').trimEnd();
  const rest = chars.slice(cut).join('').trim();
  const restChars = [...rest];
  const second = restChars.length <= max ? rest : `${restChars.slice(0, max - 1).join('').trimEnd()}…`;
  return second === '' ? [first] : [first, second];
}

export function drawShelf(bottles: readonly Bottle[], pegMl: number, perRow: number): SVGElement {
  const layout = shelfLayout(bottles.length, perRow);
  const svg = s('svg', {
    class: 'shelf-svg',
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    width: Math.round(layout.width * 1.4),
    role: 'group',
    'aria-label': `Your shelf, ${bottles.length} ${bottles.length === 1 ? 'bottle' : 'bottles'}`,
  });
  // The planks first, so bottles stand on them.
  const usedRows = new Map<number, number>();
  for (const slot of layout.slots) usedRows.set(slot.row, Math.max(usedRows.get(slot.row) ?? 0, slot.col + 1));
  for (const [row, cols] of usedRows) svg.append(s('rect', { class: 'plank', x: 0, y: row * ROW_H + 143, width: cols * SLOT_W, height: 7, rx: 3 }));

  bottles.forEach((b, i) => {
    const slot = layout.slots[i]!;
    const sil = SILHOUETTES[b.category];
    const d = derive(b, pegMl);
    const clipId = `clip-${b.id}`;
    const top = liquidTop(sil, b.fillPct);
    const label = `${b.name}. ${CATEGORY_LABEL[b.category]}, ${leftWords(b, d)}.${b.limited ? ' Marked limited or numbered.' : ''} Open this bottle.`;
    const link = s('a', { href: `#/bottles/${b.id}`, class: `bottle${b.fillPct === 0 ? ' is-empty' : ''}${d.low ? ' is-low' : ''}`, 'aria-label': label });
    link.append(s('title', {}, `${b.name}, ${b.fillPct}% left`));
    const g = s('g', { transform: `translate(${slot.x + (SLOT_W - SIL_WIDTH) / 2} ${slot.y + 14})` });
    g.append(s('clipPath', { id: clipId }, s('path', { d: sil.d })));
    g.append(s('path', { class: 'glass', d: sil.d }));
    if (b.fillPct > 0) g.append(s('rect', { class: 'liquid', x: 0, y: top, width: SIL_WIDTH, height: SIL_HEIGHT - top, 'clip-path': `url(#${clipId})` }));
    g.append(s('path', { class: 'outline', d: sil.d }));
    if (b.limited) g.append(s('path', { class: 'tag', d: 'M44 14l6 6-6 6-6-6z' }));
    link.append(g);
    nameLines(b.name).forEach((line, n) => link.append(s('text', { class: 'name', x: slot.x + SLOT_W / 2, y: slot.y + 14 + SIL_HEIGHT + 24 + n * 12, 'text-anchor': 'middle' }, line)));
    // A bigger, invisible target so a thumb can hit a slim bottle.
    link.append(s('rect', { class: 'hit', x: slot.x, y: slot.y, width: SLOT_W, height: ROW_H - 8 }));
    svg.append(link);
  });
  return svg;
}
