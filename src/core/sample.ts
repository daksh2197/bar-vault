// Adapted from coin-vault (MIT, Daksh Dua)
/**
 * Invented demo data, so a first visit has something to look at. None of it is a real bottle,
 * a real purchase or a real price, and no name is a real brand. Every row carries `sample: true`,
 * every name starts with SAMPLE, and the page says "Invented sample bar, not a real one" wherever they show.
 * "Clear sample" deletes exactly the rows with that flag.
 */

import type { Bottle } from './types';

export const SAMPLE_LABEL = 'Invented sample bar, not a real one';

export function sampleBottles(now: Date): Bottle[] {
  const stamp = now.toISOString();
  const day = stamp.slice(0, 10);
  const base = { limited: false, rarity: 'common' as const, watch: false, lowPct: 20, createdAt: stamp, updatedAt: stamp, sample: true as const };
  return [
    { ...base, id: 'sample-01', name: 'SAMPLE Brindlemoor Malt 12', category: 'whisky', sizeMl: 700, fillPct: 40, paidCents: 7500, boughtWhere: 'Sample Spirits Shop', boughtOn: day },
    { ...base, id: 'sample-02', name: 'SAMPLE Brindlemoor Cask Strength', category: 'whisky', sizeMl: 700, fillPct: 90, paidCents: 21000, limited: true, rarity: 'numbered', bottleNumber: '214 of 1,000', market: { amountCents: 26000, source: 'Sample auction note', date: day }, notes: 'Invented demo row.' },
    { ...base, id: 'sample-03', name: 'SAMPLE Quillon Dry Gin', category: 'gin', sizeMl: 750, fillPct: 12, paidCents: 4500, watch: true, watchNote: 'Sample note: seen at a lower price on a shelf tag.' },
    { ...base, id: 'sample-04', name: 'SAMPLE Tallowby Vodka', category: 'vodka', sizeMl: 1000, fillPct: 75, paidCents: 3800 },
    { ...base, id: 'sample-05', name: 'SAMPLE Marrowdene Dark Rum', category: 'rum', sizeMl: 750, fillPct: 55, paidCents: 5200, limited: true, rarity: 'discontinued' },
    { ...base, id: 'sample-06', name: 'SAMPLE Verdelune Blanco', category: 'tequila', sizeMl: 750, fillPct: 100, paidCents: 6400 },
    { ...base, id: 'sample-07', name: 'SAMPLE Haverstone VS', category: 'brandy', sizeMl: 700, fillPct: 30, paidCents: 6900 },
    { ...base, id: 'sample-08', name: 'SAMPLE Bitterwick Red', category: 'liqueur', sizeMl: 1000, fillPct: 15, paidCents: 3600, watch: true },
    { ...base, id: 'sample-09', name: 'SAMPLE Orchard Almond Liqueur', category: 'liqueur', sizeMl: 500, fillPct: 65, paidCents: 3100 },
    { ...base, id: 'sample-10', name: 'SAMPLE Cassory Dry Vermouth', category: 'vermouth', sizeMl: 750, fillPct: 8, paidCents: 1800 },
    { ...base, id: 'sample-11', name: 'SAMPLE Dunmere Red Blend', category: 'wine', sizeMl: 750, fillPct: 100, paidCents: 2200, rarity: 'unknown' },
  ];
}
