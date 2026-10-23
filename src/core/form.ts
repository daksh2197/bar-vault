// Adapted from coin-vault (MIT, Daksh Dua)
/**
 * Turns what the add/edit form holds (all text) into a checked Bottle, or a message per field.
 * The screen never builds a Bottle itself, so there is exactly one place where typed text becomes money and millilitres.
 */

import { parseDate } from './dates';
import { type Result, fail } from './decimal';
import { centsToPlain, parseCents, parseWhole } from './money';
import { SIZE_MAX_ML, SIZE_MIN_ML, PEG_MAX_ML, PEG_MIN_ML } from './peg';
import { LIMITS } from './schema';
import { type Bottle, CATEGORIES, type Category, type MarketRef, type Rarity, RARITIES, type Settings } from './types';

export interface BottleInput {
  name: string;
  category: string;
  size: string;
  fill: string;
  paid: string;
  boughtWhere: string;
  boughtOn: string;
  limited: boolean;
  bottleNumber: string;
  rarity: string;
  marketAmount: string;
  marketSource: string;
  marketDate: string;
  watch: boolean;
  watchNote: string;
  lowPct: string;
  notes: string;
}

export type BottleField = keyof BottleInput;
export type FieldErrors = Partial<Record<BottleField, string>>;

const tooLong = (n: number): string => `Keep it under ${n} characters.`;

export function buildBottle(
  input: BottleInput,
  id: string,
  now: Date,
  today: string,
  existing?: Pick<Bottle, 'createdAt' | 'sample'>,
): { ok: true; value: Bottle } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const name = input.name.trim();
  if (name === '') errors.name = 'Give it a name.';
  else if (name.length > LIMITS.name) errors.name = tooLong(LIMITS.name);

  const category = (CATEGORIES as readonly string[]).includes(input.category) ? (input.category as Category) : null;
  if (!category) errors.category = 'Pick a category.';

  const size = parseWhole(input.size, SIZE_MIN_ML, SIZE_MAX_ML, 'Size');
  if (!size.ok) errors.size = size.error;

  const fill = parseWhole(input.fill, 0, 100, 'Fill');
  if (!fill.ok) errors.fill = fill.error;

  const paid = parseCents(input.paid, { allowZero: true });
  if (!paid.ok) errors.paid = paid.error;

  let boughtOn: string | undefined;
  if (input.boughtOn.trim() !== '') {
    const d = parseDate(input.boughtOn, today, { allowFuture: false });
    if (d.ok) boughtOn = d.value;
    else errors.boughtOn = d.error;
  }

  const boughtWhere = input.boughtWhere.trim();
  if (boughtWhere.length > LIMITS.boughtWhere) errors.boughtWhere = tooLong(LIMITS.boughtWhere);
  const bottleNumber = input.bottleNumber.trim();
  if (bottleNumber.length > LIMITS.bottleNumber) errors.bottleNumber = tooLong(LIMITS.bottleNumber);

  const rarity = (RARITIES as readonly string[]).includes(input.rarity) ? (input.rarity as Rarity) : null;
  if (!rarity) errors.rarity = 'Pick a tag.';

  let market: MarketRef | undefined;
  const marketTouched = [input.marketAmount, input.marketSource, input.marketDate].some((t) => t.trim() !== '');
  if (marketTouched) {
    const amount = parseCents(input.marketAmount, { allowZero: false });
    if (!amount.ok) errors.marketAmount = input.marketAmount.trim() === '' ? 'Type the amount, or clear the other two fields.' : amount.error;
    const source = input.marketSource.trim();
    if (source.length > LIMITS.marketSource) errors.marketSource = tooLong(LIMITS.marketSource);
    let date: string | undefined;
    if (input.marketDate.trim() !== '') {
      const d = parseDate(input.marketDate, today, { allowFuture: false });
      if (d.ok) date = d.value;
      else errors.marketDate = d.error;
    }
    if (amount.ok && !errors.marketSource && !errors.marketDate) {
      market = { amountCents: amount.value };
      if (source) market.source = source;
      if (date) market.date = date;
    }
  }

  const watchNote = input.watchNote.trim();
  if (watchNote.length > LIMITS.watchNote) errors.watchNote = tooLong(LIMITS.watchNote);

  const lowPct = parseWhole(input.lowPct, 0, 100, 'The threshold');
  if (!lowPct.ok) errors.lowPct = lowPct.error;

  const notes = input.notes.trim();
  if (notes.length > LIMITS.notes) errors.notes = tooLong(LIMITS.notes);

  if (Object.keys(errors).length > 0 || !category || !size.ok || !fill.ok || !paid.ok || !rarity || !lowPct.ok) {
    return { ok: false, errors };
  }
  const stamp = now.toISOString();
  const value: Bottle = {
    id,
    name,
    category,
    sizeMl: size.value,
    fillPct: fill.value,
    paidCents: paid.value,
    limited: input.limited,
    rarity,
    watch: input.watch,
    lowPct: lowPct.value,
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
  };
  if (boughtOn) value.boughtOn = boughtOn;
  if (boughtWhere) value.boughtWhere = boughtWhere;
  if (bottleNumber) value.bottleNumber = bottleNumber;
  if (market) value.market = market;
  if (watchNote) value.watchNote = watchNote;
  if (notes) value.notes = notes;
  if (existing?.sample) value.sample = true;
  return { ok: true, value };
}

/** The form's text for an existing bottle, so editing shows what was typed. */
export function bottleToInput(b: Bottle): BottleInput {
  return {
    name: b.name,
    category: b.category,
    size: String(b.sizeMl),
    fill: String(b.fillPct),
    paid: centsToPlain(b.paidCents),
    boughtWhere: b.boughtWhere ?? '',
    boughtOn: b.boughtOn ?? '',
    limited: b.limited,
    bottleNumber: b.bottleNumber ?? '',
    rarity: b.rarity,
    marketAmount: b.market ? centsToPlain(b.market.amountCents) : '',
    marketSource: b.market?.source ?? '',
    marketDate: b.market?.date ?? '',
    watch: b.watch,
    watchNote: b.watchNote ?? '',
    lowPct: String(b.lowPct),
    notes: b.notes ?? '',
  };
}

/** A blank form for a new bottle, with the owner's default threshold. */
export function blankInput(settings: Settings): BottleInput {
  return {
    name: '',
    category: 'whisky',
    size: '750',
    fill: '100',
    paid: '',
    boughtWhere: '',
    boughtOn: '',
    limited: false,
    bottleNumber: '',
    rarity: 'common',
    marketAmount: '',
    marketSource: '',
    marketDate: '',
    watch: false,
    watchNote: '',
    lowPct: String(settings.defaultLowPct),
    notes: '',
  };
}

export function buildSettings(pegText: string, lowText: string): { ok: true; value: Settings } | { ok: false; errors: { pegMl?: string; defaultLowPct?: string } } {
  const errors: { pegMl?: string; defaultLowPct?: string } = {};
  const peg = parseWhole(pegText, PEG_MIN_ML, PEG_MAX_ML, 'Peg size');
  if (!peg.ok) errors.pegMl = peg.error;
  const low = parseWhole(lowText, 0, 100, 'The threshold');
  if (!low.ok) errors.defaultLowPct = low.error;
  if (!peg.ok || !low.ok) return { ok: false, errors };
  return { ok: true, value: { pegMl: peg.value, defaultLowPct: low.value } };
}

/** The word the owner types to wipe everything. */
export const WIPE_WORD = 'wipe';
export const confirmsWipe = (typed: string): Result<true> => (typed.trim().toLowerCase() === WIPE_WORD ? { ok: true, value: true } : fail(`Type ${WIPE_WORD} to confirm.`));
