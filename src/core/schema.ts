// Adapted from coin-vault (MIT, Daksh Dua)
/**
 * What a valid bottle, setting or photo looks like. Everything that comes from outside the form (an imported
 * file, a row read back from the database) goes through here, and only the known fields come out.
 * Unknown keys are dropped, so a file cannot smuggle in anything else.
 */

import { isIsoDate, isIsoTimestamp } from './dates';
import { type Result, fail } from './decimal';
import { MAX_CENTS } from './money';
import { PEG_MAX_ML, PEG_MIN_ML, SIZE_MAX_ML, SIZE_MIN_ML } from './peg';
import { type Bottle, CATEGORIES, DEFAULT_SETTINGS, type Category, type MarketRef, type Photo, type Rarity, RARITIES, type Settings } from './types';

export const LIMITS = { name: 120, boughtWhere: 200, bottleNumber: 40, marketSource: 200, watchNote: 500, notes: 2000 } as const;
export const MAX_PHOTO_BYTES = 1_500_000;
const ID = /^[a-z0-9-]{1,64}$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const isCategory = (v: unknown): v is Category => typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
const isRarity = (v: unknown): v is Rarity => typeof v === 'string' && (RARITIES as readonly string[]).includes(v);
const absent = (v: unknown): boolean => v === undefined || v === null || v === '';

export const isValidId = (v: unknown): v is string => typeof v === 'string' && ID.test(v);

type TextKey = 'boughtWhere' | 'bottleNumber' | 'watchNote' | 'notes';

function optionalText(raw: Record<string, unknown>, key: TextKey): Result<string | undefined> {
  const v = raw[key];
  if (absent(v)) return { ok: true, value: undefined };
  if (typeof v !== 'string') return fail(`"${key}" must be text.`);
  const text = v.trim();
  if (text.length > LIMITS[key]) return fail(`"${key}" is longer than ${LIMITS[key]} characters.`);
  return { ok: true, value: text === '' ? undefined : text };
}

function sanitizeMarket(raw: unknown, id: string): Result<MarketRef | undefined> {
  if (absent(raw)) return { ok: true, value: undefined };
  if (!isRecord(raw)) return fail(`Bottle ${id}: market reference is not an object.`);
  if (!isInt(raw.amountCents, 1, MAX_CENTS)) return fail(`Bottle ${id}: market reference amount is out of range.`);
  const out: MarketRef = { amountCents: raw.amountCents };
  if (!absent(raw.source)) {
    if (typeof raw.source !== 'string' || raw.source.length > LIMITS.marketSource) return fail(`Bottle ${id}: market reference source is too long.`);
    if (raw.source.trim() !== '') out.source = raw.source.trim();
  }
  if (!absent(raw.date)) {
    if (typeof raw.date !== 'string' || !isIsoDate(raw.date)) return fail(`Bottle ${id}: market reference date is not a real date.`);
    out.date = raw.date;
  }
  return { ok: true, value: out };
}

export function sanitizeBottle(raw: unknown): Result<Bottle> {
  if (!isRecord(raw)) return fail('A bottle is not an object.');
  const { id, name, category, sizeMl, fillPct, paidCents, createdAt, updatedAt } = raw;
  if (!isValidId(id)) return fail('A bottle has an invalid id.');
  if (typeof name !== 'string' || name.trim() === '' || name.length > LIMITS.name) return fail(`Bottle ${id}: name is missing or too long.`);
  if (!isCategory(category)) return fail(`Bottle ${id}: unknown category.`);
  if (!isInt(sizeMl, SIZE_MIN_ML, SIZE_MAX_ML)) return fail(`Bottle ${id}: size is out of range.`);
  if (!isInt(fillPct, 0, 100)) return fail(`Bottle ${id}: fill is out of range.`);
  if (!isInt(paidCents, 0, MAX_CENTS)) return fail(`Bottle ${id}: price paid is out of range.`);
  if (typeof createdAt !== 'string' || !isIsoTimestamp(createdAt)) return fail(`Bottle ${id}: created time is not valid.`);
  if (typeof updatedAt !== 'string' || !isIsoTimestamp(updatedAt)) return fail(`Bottle ${id}: updated time is not valid.`);
  const rarity = absent(raw.rarity) ? 'unknown' : raw.rarity;
  if (!isRarity(rarity)) return fail(`Bottle ${id}: unknown rarity.`);
  if (raw.limited !== undefined && typeof raw.limited !== 'boolean') return fail(`Bottle ${id}: "limited" must be true or false.`);
  if (raw.watch !== undefined && typeof raw.watch !== 'boolean') return fail(`Bottle ${id}: "watch" must be true or false.`);
  // Rows saved before the threshold existed have none. 20 percent is what they were given.
  const lowPct = raw.lowPct === undefined ? DEFAULT_SETTINGS.defaultLowPct : raw.lowPct;
  if (!isInt(lowPct, 0, 100)) return fail(`Bottle ${id}: low threshold is out of range.`);

  const out: Bottle = {
    id,
    name: name.trim(),
    category,
    sizeMl,
    fillPct,
    paidCents,
    limited: raw.limited === true,
    rarity,
    watch: raw.watch === true,
    lowPct,
    createdAt,
    updatedAt,
  };
  if (!absent(raw.boughtOn)) {
    if (typeof raw.boughtOn !== 'string' || !isIsoDate(raw.boughtOn)) return fail(`Bottle ${id}: purchase date is not a real date.`);
    out.boughtOn = raw.boughtOn;
  }
  for (const key of ['boughtWhere', 'bottleNumber', 'watchNote', 'notes'] as const) {
    const text = optionalText(raw, key);
    if (!text.ok) return fail(`Bottle ${id}: ${text.error}`);
    if (text.value !== undefined) out[key] = text.value;
  }
  const market = sanitizeMarket(raw.market, id);
  if (!market.ok) return market;
  if (market.value) out.market = market.value;
  if (raw.sample === true) out.sample = true;
  return { ok: true, value: out };
}

export function sanitizeSettings(raw: unknown): Result<Settings> {
  if (!isRecord(raw)) return fail('Settings are not an object.');
  if (!isInt(raw.pegMl, PEG_MIN_ML, PEG_MAX_ML)) return fail(`Peg size must be a whole number from ${PEG_MIN_ML} to ${PEG_MAX_ML} ml.`);
  if (!isInt(raw.defaultLowPct, 0, 100)) return fail('The default low threshold must be a whole percent from 0 to 100.');
  return { ok: true, value: { pegMl: raw.pegMl, defaultLowPct: raw.defaultLowPct } };
}

/** JPEG files start with the bytes FF D8 FF. Anything else is not something this app wrote. */
export const looksLikeJpeg = (bytes: Uint8Array): boolean => bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

export function sanitizePhoto(raw: unknown): Result<Photo> {
  if (!isRecord(raw)) return fail('A photo is not an object.');
  if (!isValidId(raw.id)) return fail('A photo has an invalid id.');
  const bytes = raw.bytes;
  if (!(bytes instanceof Uint8Array)) return fail(`Photo ${raw.id}: no image data.`);
  if (bytes.length > MAX_PHOTO_BYTES) return fail(`Photo ${raw.id}: larger than ${MAX_PHOTO_BYTES} bytes.`);
  if (!looksLikeJpeg(bytes)) return fail(`Photo ${raw.id}: not a JPEG.`);
  return { ok: true, value: { id: raw.id, type: 'image/jpeg', bytes } };
}

/** A fresh random id for a new bottle. */
export function newId(): string {
  return crypto.randomUUID();
}
