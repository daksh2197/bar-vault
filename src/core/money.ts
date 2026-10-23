// Adapted from coin-vault (MIT, Daksh Dua)
/**
 * Money in integer cents.
 *
 * Typed amounts become whole cents (Canadian dollars) the moment they are read.
 * Totals are bigints, so a sum can never overflow or pick up a float crumb.
 * Text is built by hand, not with Intl, because Intl wants a float.
 */

import { type Result, fail, parseDecimal, toScale } from './decimal';

export const MAX_CENTS = 1_000_000_000_000; // $10 billion for one bottle: a typo, not a purchase

export function parseCents(text: string, opts: { allowZero: boolean }): Result<number> {
  const parsed = parseDecimal(text, { maxDecimals: 2, maxIntDigits: 11 });
  if (!parsed.ok) return parsed;
  const cents = toScale(parsed.value, 2);
  if (cents === 0n && !opts.allowZero) return fail('This must be above zero.');
  if (cents > BigInt(MAX_CENTS)) return fail('That amount is too large.');
  return { ok: true, value: Number(cents) };
}

/** A whole number between `min` and `max`, typed as plain digits. `what` names it in the message. */
export function parseWhole(text: string, min: number, max: number, what: string): Result<number> {
  const parsed = parseDecimal(text, { maxDecimals: 0, maxIntDigits: 9 });
  if (!parsed.ok) return parsed.error === 'Whole numbers only.' ? fail(`${what} must be a whole number.`) : parsed;
  const n = parsed.value.mantissa;
  if (n < BigInt(min)) return fail(`${what} must be at least ${min}.`);
  if (n > BigInt(max)) return fail(`${what} cannot be above ${group(String(max))}.`);
  return { ok: true, value: Number(n) };
}

const group = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 4500 -> "$45.00". Negative amounts use a real minus sign: "−$5.00". */
export function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = (negative ? -cents : cents).toString().padStart(3, '0');
  const body = `$${group(abs.slice(0, -2))}.${abs.slice(-2)}`;
  return negative ? `−${body}` : body;
}

/** Cents as a plain decimal for a CSV or a text box: 4500 -> "45.00". No symbol, no grouping. */
export function centsToPlain(cents: number): string {
  const abs = Math.abs(cents).toString().padStart(3, '0');
  return `${cents < 0 ? '-' : ''}${abs.slice(0, -2)}.${abs.slice(-2)}`;
}
