/**
 * Peg maths. Every figure here is an integer: millilitres, cents, whole pegs.
 * Divisions round half up through bigint, so a result can never be NaN, negative or off by a float crumb.
 *
 *   ml left          = round-half-up(size × fill% ÷ 100)
 *   pegs left        = floor(ml left ÷ peg size)            a part peg is not a peg
 *   price per peg    = round-half-up(paid × peg size ÷ size)
 *   value left       = round-half-up(paid × ml left ÷ size)
 */

import { divRoundHalfUp } from './decimal';
import type { Bottle } from './types';

export const SIZE_MIN_ML = 1;
export const SIZE_MAX_ML = 100_000;
export const PEG_MIN_ML = 5;
export const PEG_MAX_ML = 500;
export const PEG_PRESETS = [30, 45, 60] as const;

const valid = (n: number, min: number, max: number): boolean => Number.isSafeInteger(n) && n >= min && n <= max;

export function mlLeft(sizeMl: number, fillPct: number): number {
  if (!valid(sizeMl, SIZE_MIN_ML, SIZE_MAX_ML) || !valid(fillPct, 0, 100)) return 0;
  return Number(divRoundHalfUp(BigInt(sizeMl) * BigInt(fillPct), 100n));
}

export function pegsFrom(ml: number, pegMl: number): number {
  if (!valid(pegMl, PEG_MIN_ML, PEG_MAX_ML) || !Number.isSafeInteger(ml) || ml < 0) return 0;
  return Math.floor(ml / pegMl);
}

export function pricePerPegCents(paidCents: number, sizeMl: number, pegMl: number): number {
  if (!valid(sizeMl, SIZE_MIN_ML, SIZE_MAX_ML) || !valid(pegMl, PEG_MIN_ML, PEG_MAX_ML) || !Number.isSafeInteger(paidCents) || paidCents < 0) return 0;
  return Number(divRoundHalfUp(BigInt(paidCents) * BigInt(pegMl), BigInt(sizeMl)));
}

export function valueLeftCents(paidCents: number, sizeMl: number, ml: number): number {
  if (!valid(sizeMl, SIZE_MIN_ML, SIZE_MAX_ML) || !Number.isSafeInteger(paidCents) || paidCents < 0 || !valid(ml, 0, sizeMl)) return 0;
  return Number(divRoundHalfUp(BigInt(paidCents) * BigInt(ml), BigInt(sizeMl)));
}

export interface Derived {
  mlLeft: number;
  pegsLeft: number;
  /** Pegs in a full bottle. */
  pegsFull: number;
  pricePerPegCents: number;
  valueLeftCents: number;
  low: boolean;
}

/** A bottle counts as low at or under its own threshold. */
export const isLow = (b: Pick<Bottle, 'fillPct' | 'lowPct'>): boolean => b.fillPct <= b.lowPct;

export function derive(b: Bottle, pegMl: number): Derived {
  const ml = mlLeft(b.sizeMl, b.fillPct);
  return {
    mlLeft: ml,
    pegsLeft: pegsFrom(ml, pegMl),
    pegsFull: pegsFrom(b.sizeMl, pegMl),
    pricePerPegCents: pricePerPegCents(b.paidCents, b.sizeMl, pegMl),
    valueLeftCents: valueLeftCents(b.paidCents, b.sizeMl, ml),
    low: isLow(b),
  };
}
