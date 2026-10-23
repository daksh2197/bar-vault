// Adapted from coin-vault (MIT, Daksh Dua)
/** Sentences the screen shows that depend on numbers. Pure, so they can be tested. */

import { ageWords, daysBetween } from '../core/dates';
import { formatCents } from '../core/money';
import type { Derived } from '../core/peg';
import { type Bottle, RARITY_LABEL } from '../core/types';

/** Safari can clear a site's storage after seven days without use, so a backup older than this gets a reminder. */
export const BACKUP_NAG_DAYS = 7;

export const plural = (n: number, one: string, many: string = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export const pegsWords = (n: number): string => plural(n, 'peg');

export function backupStatus(lastBackup: string | null, today: string, hasBottles: boolean): string {
  if (!lastBackup) {
    return hasBottles
      ? 'You have not saved a backup from this browser yet. Nothing here is copied anywhere else.'
      : 'No backup yet. Nothing is stored anywhere but this browser.';
  }
  const day = lastBackup.slice(0, 10);
  const age = daysBetween(day, today);
  const base = `Last backup: ${day} (${ageWords(age)}).`;
  return age > BACKUP_NAG_DAYS && hasBottles ? `${base} Safari can clear a site left alone for seven days, so save a new one.` : base;
}

/** "40% left, 280 ml, 9 pegs" */
export const leftWords = (b: Pick<Bottle, 'fillPct'>, d: Pick<Derived, 'mlLeft' | 'pegsLeft'>): string => `${b.fillPct}% left, ${d.mlLeft} ml, ${pegsWords(d.pegsLeft)}`;

export function priceLine(d: Pick<Derived, 'pricePerPegCents'>, paidCents: number): string {
  return paidCents === 0 ? 'Gift or free: no price per peg' : `${formatCents(BigInt(d.pricePerPegCents))} a peg`;
}

/** The tag the owner picked, with the bottle number when there is one. */
export function rarityLine(b: Pick<Bottle, 'rarity' | 'limited' | 'bottleNumber'>): string {
  const parts = [RARITY_LABEL[b.rarity]];
  if (b.limited) parts.push('limited or numbered');
  if (b.bottleNumber) parts.push(b.bottleNumber);
  return parts.join(', ');
}

/** The reference price the owner typed, with where and when. It is never looked up. */
export function marketLine(b: Pick<Bottle, 'market'>): string {
  if (!b.market) return '';
  const bits = [b.market.source ? `source: ${b.market.source}` : '', b.market.date ? `date: ${b.market.date}` : ''].filter(Boolean);
  return `Reference you typed: ${formatCents(BigInt(b.market.amountCents))}${bits.length > 0 ? ` (${bits.join(', ')})` : ''}`;
}

export function lowCountWords(n: number): string {
  if (n === 0) return 'Nothing is low.';
  return `${plural(n, 'bottle')} ${n === 1 ? 'is' : 'are'} low.`;
}

/** The histogram bucket as a range, with the top end inclusive: 180 to 269 cents is "$1.80 to $2.69". */
export function bucketRange(fromCents: number, toCents: number): string {
  return `${formatCents(BigInt(fromCents))} to ${formatCents(BigInt(toCents - 1))}`;
}
