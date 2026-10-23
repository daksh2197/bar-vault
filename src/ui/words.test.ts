// Adapted from coin-vault (MIT, Daksh Dua)
import { describe, expect, it } from 'vitest';
import { bottle } from '../core/fixtures';
import { BACKUP_NAG_DAYS, backupStatus, bucketRange, leftWords, lowCountWords, marketLine, plural, pegsWords, priceLine, rarityLine } from './words';

describe('backup status', () => {
  it('says there is no backup yet, with and without bottles', () => {
    expect(backupStatus(null, '2026-10-23', false)).toBe('No backup yet. Nothing is stored anywhere but this browser.');
    expect(backupStatus(null, '2026-10-23', true)).toMatch(/not saved a backup/);
  });
  it('gives the date and age of the last backup', () => {
    expect(backupStatus('2026-10-23T08:00:00.000Z', '2026-10-23', true)).toBe('Last backup: 2026-10-23 (today).');
    expect(backupStatus('2026-10-20T08:00:00.000Z', '2026-10-23', true)).toBe('Last backup: 2026-10-20 (3 days ago).');
  });
  it('adds the seven-day eviction note only after seven days, and only with bottles', () => {
    expect(BACKUP_NAG_DAYS).toBe(7);
    expect(backupStatus('2026-10-16T00:00:00.000Z', '2026-10-23', true)).toBe('Last backup: 2026-10-16 (7 days ago).');
    expect(backupStatus('2026-10-15T00:00:00.000Z', '2026-10-23', true)).toMatch(/Safari can clear a site left alone for seven days/);
    expect(backupStatus('2026-01-01T00:00:00.000Z', '2026-10-23', false)).not.toMatch(/Safari/);
  });
});

describe('small sentences', () => {
  it.each([
    [0, '0 pegs'],
    [1, '1 peg'],
    [2, '2 pegs'],
    [25, '25 pegs'],
  ])('writes %i pegs as %s', (n, text) => expect(pegsWords(n)).toBe(text));

  it('pluralises', () => {
    expect(plural(1, 'bottle')).toBe('1 bottle');
    expect(plural(0, 'bottle')).toBe('0 bottles');
    expect(plural(2, 'box', 'boxes')).toBe('2 boxes');
  });

  it('says how much is left', () => {
    expect(leftWords({ fillPct: 40 }, { mlLeft: 280, pegsLeft: 9 })).toBe('40% left, 280 ml, 9 pegs');
    expect(leftWords({ fillPct: 0 }, { mlLeft: 0, pegsLeft: 0 })).toBe('0% left, 0 ml, 0 pegs');
  });

  it('says the price per peg, or that a gift has none', () => {
    expect(priceLine({ pricePerPegCents: 180 }, 4500)).toBe('$1.80 a peg');
    expect(priceLine({ pricePerPegCents: 0 }, 0)).toBe('Gift or free: no price per peg');
  });

  it('says the rarity tag with the number', () => {
    expect(rarityLine({ rarity: 'common', limited: false })).toBe('Common');
    expect(rarityLine({ rarity: 'numbered', limited: true, bottleNumber: '214 of 1,000' })).toBe('Numbered, limited or numbered, 214 of 1,000');
  });

  it('says the typed reference price and never more', () => {
    expect(marketLine(bottle('a'))).toBe('');
    expect(marketLine({ market: { amountCents: 26000 } })).toBe('Reference you typed: $260.00');
    expect(marketLine({ market: { amountCents: 26000, source: 'a note', date: '2026-10-20' } })).toBe('Reference you typed: $260.00 at a note on 2026-10-20');
  });

  it('counts low bottles', () => {
    expect(lowCountWords(0)).toBe('Nothing is low.');
    expect(lowCountWords(1)).toBe('1 bottle is low.');
    expect(lowCountWords(4)).toBe('4 bottles are low.');
  });

  it('writes a histogram bucket with its top end inclusive', () => {
    expect(bucketRange(100, 200)).toBe('$1.00 to $1.99');
    expect(bucketRange(0, 50)).toBe('$0.00 to $0.49');
  });

  it('never writes NaN, undefined or -0 for any figure', () => {
    const text = [pegsWords(0), leftWords({ fillPct: 0 }, { mlLeft: 0, pegsLeft: 0 }), priceLine({ pricePerPegCents: 0 }, 5), bucketRange(0, 1)].join(' ');
    expect(text).not.toMatch(/NaN|undefined|Infinity|-0/);
  });
});
