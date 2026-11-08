/** Searching and ordering the bottle list and the shelf. Pure. */

import { derive } from './peg';
import { CATEGORIES, CATEGORY_LABEL, type Bottle } from './types';

export const SORTS = ['category', 'fill', 'price'] as const;
export type SortKey = (typeof SORTS)[number];
export const SORT_LABEL: Record<SortKey, string> = {
  category: 'Category, then name',
  fill: 'Fill, lowest first',
  price: 'Price per peg, highest first',
};

const byName = (a: Bottle, b: Bottle): number => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id);

export function sortBottles(bottles: readonly Bottle[], key: SortKey, pegMl: number): Bottle[] {
  const copy = [...bottles];
  if (key === 'category') return copy.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || byName(a, b));
  if (key === 'fill') return copy.sort((a, b) => a.fillPct - b.fillPct || byName(a, b));
  return copy.sort((a, b) => derive(b, pegMl).pricePerPegCents - derive(a, pegMl).pricePerPegCents || byName(a, b));
}

/** Case-insensitive match on name, category, where it was bought and the notes. Blank matches everything. */
export function searchBottles(bottles: readonly Bottle[], query: string): Bottle[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...bottles];
  return bottles.filter((b) => [b.name, CATEGORY_LABEL[b.category], b.boughtWhere ?? '', b.notes ?? '', b.bottleNumber ?? ''].some((t) => t.toLowerCase().includes(q)));
}
