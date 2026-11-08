/** Totals, medians and the histogram of price per peg. Pure: the screen only draws what comes out. */

import { divRoundHalfUp } from './decimal';
import { derive } from './peg';
import { CATEGORIES, type Bottle, type Category } from './types';

export interface Bucket {
  /** First cent in the bucket. */
  fromCents: number;
  /** One past the last cent: the bucket holds fromCents <= value < toCents. */
  toCents: number;
  count: number;
}

/** The smallest 1, 2 or 5 times a power of ten that is at least `n`. */
export function niceWidth(n: number): number {
  let unit = 1;
  while (unit * 10 <= n) unit *= 10;
  for (const step of [1, 2, 5, 10]) if (step * unit >= n) return step * unit;
  return 10 * unit;
}

/**
 * Sort values into equal-width buckets. The width is a round number (1, 2 or 5 times a power of ten)
 * chosen so there are about six buckets. Every value lands in exactly one bucket.
 */
export function histogram(values: readonly number[], target = 6): Bucket[] {
  const clean = values.filter((v) => Number.isSafeInteger(v) && v >= 0);
  if (clean.length === 0) return [];
  let min = clean[0]!;
  let max = clean[0]!;
  for (const v of clean) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const width = niceWidth(Math.max(1, Math.ceil((max - min) / Math.max(1, target))));
  const start = Math.floor(min / width) * width;
  const n = Math.floor((max - start) / width) + 1;
  const buckets: Bucket[] = Array.from({ length: n }, (_, i) => ({ fromCents: start + i * width, toCents: start + (i + 1) * width, count: 0 }));
  for (const v of clean) buckets[Math.floor((v - start) / width)]!.count += 1;
  return buckets;
}

/** The middle value; with two in the middle, their average rounded half up. Null when empty. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return Number(divRoundHalfUp(BigInt(sorted[mid - 1]!) + BigInt(sorted[mid]!), 2n));
}

/** The mean rounded half up, or null when empty. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, v) => a + BigInt(v), 0n);
  return Number(divRoundHalfUp(sum, BigInt(values.length)));
}

export interface BarStats {
  count: number;
  lowCount: number;
  totalPaidCents: bigint;
  valueLeftCents: bigint;
  averagePerPegCents: number | null;
  medianPerPegCents: number | null;
  /** Bottles with a price of zero (gifts) are left out of the per-peg figures, because zero is not a price paid. */
  pricedCount: number;
  paidByCategory: { category: Category; paidCents: bigint; count: number }[];
  histogram: Bucket[];
}

export function barStats(bottles: readonly Bottle[], pegMl: number): BarStats {
  const derived = bottles.map((b) => ({ b, d: derive(b, pegMl) }));
  const priced = derived.filter(({ b }) => b.paidCents > 0).map(({ d }) => d.pricePerPegCents);
  const byCategory = CATEGORIES.map((category) => {
    const rows = bottles.filter((b) => b.category === category);
    return { category, paidCents: rows.reduce((a, b) => a + BigInt(b.paidCents), 0n), count: rows.length };
  }).filter((row) => row.count > 0);
  return {
    count: bottles.length,
    lowCount: derived.filter(({ d }) => d.low).length,
    totalPaidCents: bottles.reduce((a, b) => a + BigInt(b.paidCents), 0n),
    valueLeftCents: derived.reduce((a, { d }) => a + BigInt(d.valueLeftCents), 0n),
    averagePerPegCents: mean(priced),
    medianPerPegCents: median(priced),
    pricedCount: priced.length,
    paidByCategory: byCategory,
    histogram: histogram(priced),
  };
}
