/** What to buy next: bottles at or under their threshold, the manual watchlist, and the shopping list built from both. */

import { derive, isLow } from './peg';
import { CATEGORY_LABEL, type Bottle } from './types';

const byFillThenName = (a: Bottle, b: Bottle): number => a.fillPct - b.fillPct || a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id);
const byName = (a: Bottle, b: Bottle): number => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id);

/** Emptiest first. */
export const lowBottles = (bottles: readonly Bottle[]): Bottle[] => bottles.filter(isLow).sort(byFillThenName);

export const watchlist = (bottles: readonly Bottle[]): Bottle[] => bottles.filter((b) => b.watch).sort(byName);

/** Low bottles and watched bottles, each once, low ones first. */
export function shoppingItems(bottles: readonly Bottle[]): { bottle: Bottle; low: boolean; watch: boolean }[] {
  const low = lowBottles(bottles);
  const lowIds = new Set(low.map((b) => b.id));
  const watched = watchlist(bottles);
  return [
    ...low.map((bottle) => ({ bottle, low: true, watch: bottle.watch })),
    ...watched.filter((b) => !lowIds.has(b.id)).map((bottle) => ({ bottle, low: false, watch: true })),
  ];
}

export function shoppingListText(bottles: readonly Bottle[], pegMl: number, today: string): string {
  const items = shoppingItems(bottles);
  const lines = ['Bar Vault shopping list', `Made ${today}`, ''];
  if (items.length === 0) return [...lines, 'Nothing is low and nothing is on the watchlist.', ''].join('\n');
  const low = items.filter((i) => i.low);
  const watchOnly = items.filter((i) => !i.low);
  if (low.length > 0) {
    lines.push('Low');
    for (const { bottle: b } of low) {
      const d = derive(b, pegMl);
      lines.push(`- ${b.name} (${CATEGORY_LABEL[b.category].toLowerCase()}, ${b.sizeMl} ml): ${b.fillPct}% left, ${d.pegsLeft} ${d.pegsLeft === 1 ? 'peg' : 'pegs'}${b.watch && b.watchNote ? `. ${b.watchNote}` : ''}`);
    }
    lines.push('');
  }
  if (watchOnly.length > 0) {
    lines.push('Watching');
    for (const { bottle: b } of watchOnly) lines.push(`- ${b.name} (${CATEGORY_LABEL[b.category].toLowerCase()}, ${b.sizeMl} ml)${b.watchNote ? `: ${b.watchNote}` : ''}`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * A spreadsheet reads a cell that starts with = + - @ tab or return as a formula. Such a field gets a single quote in front,
 * which the spreadsheet shows as plain text. Then the field is quoted if it holds a comma, a quote or a line break, and a quote inside is doubled.
 */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export const csvRow = (fields: readonly string[]): string => fields.map(csvField).join(',');

export const SHOPPING_CSV_HEADER = 'name,category,size_ml,fill_pct,reason,note';

export function shoppingListCsv(bottles: readonly Bottle[]): string {
  const rows = shoppingItems(bottles).map(({ bottle: b, low, watch }) =>
    csvRow([b.name, b.category, String(b.sizeMl), String(b.fillPct), low && watch ? 'low and watching' : low ? 'low' : 'watching', b.watchNote ?? '']),
  );
  return [SHOPPING_CSV_HEADER, ...rows].join('\n') + '\n';
}
