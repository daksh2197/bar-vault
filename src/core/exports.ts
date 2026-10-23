/** The two files the owner can take out: the whole bar as CSV, and the smart-home JSON. */

import { centsToPlain } from './money';
import { derive } from './peg';
import { csvRow } from './restock';
import type { Bottle } from './types';

export const BAR_CSV_HEADER = 'name,category,size_ml,fill_pct,ml_left,pegs_left,price_per_peg_cad,low,limited,rarity,bought_where,bought_on';
export const SMART_HOME_FORMAT = 'bar-vault-smart-home/1';
/** A spoken summary stays short: past this many names it says how many more. */
export const SUMMARY_NAMES = 8;

export function barCsv(bottles: readonly Bottle[], pegMl: number): string {
  const rows = bottles.map((b) => {
    const d = derive(b, pegMl);
    return csvRow([
      b.name,
      b.category,
      String(b.sizeMl),
      String(b.fillPct),
      String(d.mlLeft),
      String(d.pegsLeft),
      centsToPlain(d.pricePerPegCents),
      String(d.low),
      String(b.limited),
      b.rarity,
      b.boughtWhere ?? '',
      b.boughtOn ?? '',
    ]);
  });
  return [BAR_CSV_HEADER, ...rows].join('\n') + '\n';
}

/** "3 bottles low: Campari, dry vermouth, gin." Zero and one read naturally. */
export function lowSummary(names: readonly string[]): string {
  if (names.length === 0) return 'No bottles are low.';
  const shown = names.slice(0, SUMMARY_NAMES);
  const extra = names.length - shown.length;
  const list = shown.join(', ') + (extra > 0 ? ` and ${extra} more` : '');
  return `${names.length} ${names.length === 1 ? 'bottle' : 'bottles'} low: ${list}.`;
}

export interface SmartHomeFile {
  format: typeof SMART_HOME_FORMAT;
  generated: string;
  pegMl: number;
  bottles: {
    name: string;
    category: string;
    sizeMl: number;
    fillPct: number;
    mlLeft: number;
    pegsLeft: number;
    pricePerPegCents: number;
    low: boolean;
    limited: boolean;
  }[];
  lowBottles: string[];
  summary: string;
}

export function smartHome(bottles: readonly Bottle[], pegMl: number, now: Date): SmartHomeFile {
  const rows = bottles.map((b) => {
    const d = derive(b, pegMl);
    return {
      name: b.name,
      category: b.category,
      sizeMl: b.sizeMl,
      fillPct: b.fillPct,
      mlLeft: d.mlLeft,
      pegsLeft: d.pegsLeft,
      pricePerPegCents: d.pricePerPegCents,
      low: d.low,
      limited: b.limited,
    };
  });
  const lowNames = rows.filter((r) => r.low).sort((a, b) => a.fillPct - b.fillPct || a.name.localeCompare(b.name, 'en')).map((r) => r.name);
  return { format: SMART_HOME_FORMAT, generated: now.toISOString(), pegMl, bottles: rows, lowBottles: lowNames, summary: lowSummary(lowNames) };
}

export const smartHomeJson = (bottles: readonly Bottle[], pegMl: number, now: Date): string => JSON.stringify(smartHome(bottles, pegMl, now), null, 2);
