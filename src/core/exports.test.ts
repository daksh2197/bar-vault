import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BAR_CSV_HEADER, barCsv, lowSummary, SMART_HOME_FORMAT, smartHome, smartHomeJson, SUMMARY_NAMES } from './exports';
import { bottle, bottlesArb, NOW, RUNS } from './fixtures';
import { csvField } from './restock';

/** A small CSV reader written for the test, so the writer is checked against something other than itself. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const guard = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

describe('the bar CSV', () => {
  it('starts with the exact header the spec names', () => {
    expect(BAR_CSV_HEADER).toBe('name,category,size_ml,fill_pct,ml_left,pegs_left,price_per_peg_cad,low,limited,rarity,bought_where,bought_on');
    expect(barCsv([], 30)).toBe(BAR_CSV_HEADER + '\n');
  });

  it('writes one row per bottle with the figures worked out', () => {
    const csv = barCsv([bottle('a', { name: 'Gin', sizeMl: 750, fillPct: 100, paidCents: 4500, limited: true, rarity: 'numbered', boughtWhere: 'Shop', boughtOn: '2026-10-01' })], 30);
    expect(csv.split('\n')[1]).toBe('Gin,gin,750,100,750,25,1.80,false,true,numbered,Shop,2026-10-01');
  });

  it('writes the price per peg in dollars with two places, never in cents', () => {
    const row = parseCsv(barCsv([bottle('a', { paidCents: 5, sizeMl: 1, fillPct: 100 })], 30))[1]!;
    expect(row[6]).toBe('1.50');
    expect(parseCsv(barCsv([bottle('b', { paidCents: 0 })], 30))[1]![6]).toBe('');
  });

  it('keeps commas, quotes and line breaks in a name (property)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }).filter((s) => s.trim() !== '' && !s.includes('\r')), (name) => {
        const rows = parseCsv(barCsv([bottle('a', { name: name.trim() })], 30));
        expect(rows).toHaveLength(2);
        expect(rows[1]![0]).toBe(guard(name.trim()));
        expect(rows[1]).toHaveLength(12);
      }),
      RUNS,
    );
  });

  it('round-trips every text field of random bottles through a reader (property)', () => {
    fc.assert(
      fc.property(bottlesArb(6), (bottles) => {
        const rows = parseCsv(barCsv(bottles, 30));
        expect(rows).toHaveLength(bottles.length + 1);
        bottles.forEach((b, i) => {
          const r = rows[i + 1]!;
          expect(r[0]).toBe(guard(b.name));
          expect(r[1]).toBe(b.category);
          expect(r[2]).toBe(String(b.sizeMl));
          expect(r[9]).toBe(b.rarity);
          expect(r[10]).toBe(guard(b.boughtWhere ?? ''));
          expect(r[11]).toBe(b.boughtOn ?? '');
        });
      }),
      RUNS,
    );
  });

  it('writes an empty price per peg for a gift, and a number for everything else', () => {
    const rows = parseCsv(barCsv([bottle('a', { paidCents: 0 }), bottle('b', { paidCents: 4500, sizeMl: 750 })], 30));
    expect(rows[1]![6]).toBe('');
    expect(rows[2]![6]).toBe('1.80');
  });

  it('never starts any field with a formula character (property)', () => {
    fc.assert(
      fc.property(bottlesArb(6), (bottles) => {
        const rows = parseCsv(barCsv(bottles, 30));
        for (const row of rows.slice(1)) for (const f of row) expect(/^[=+\-@\t\r]/.test(f), JSON.stringify(f)).toBe(false);
      }),
      RUNS,
    );
  });

  it('guards a name that looks like a formula', () => {
    expect(parseCsv(barCsv([bottle('a', { name: '=cmd|calc' })], 30))[1]![0]).toBe("'=cmd|calc");
  });

  it('quotes a field only when it needs to', () => {
    expect(csvField('Gin')).toBe('Gin');
    expect(csvField('Gin, dry')).toBe('"Gin, dry"');
  });
});

describe('the smart-home JSON', () => {
  const bar = [
    bottle('a', { name: 'Bitterwick', fillPct: 10, sizeMl: 1000, paidCents: 3000, category: 'liqueur' }),
    bottle('b', { name: 'dry vermouth', fillPct: 5, category: 'vermouth' }),
    bottle('c', { name: 'gin', fillPct: 15 }),
    bottle('d', { name: 'rum', fillPct: 80, limited: true }),
  ];
  const file = smartHome(bar, 30, NOW);

  it('carries the format string and the time it was made', () => {
    expect(file.format).toBe('bar-vault-smart-home/1');
    expect(SMART_HOME_FORMAT).toBe('bar-vault-smart-home/1');
    expect(file.generated).toBe('2026-10-23T12:00:00.000Z');
    expect(file.pegMl).toBe(30);
  });

  it('has exactly the fields the spec lists, in each bottle', () => {
    expect(Object.keys(file.bottles[0]!)).toEqual(['name', 'category', 'sizeMl', 'fillPct', 'mlLeft', 'pegsLeft', 'pricePerPegCents', 'low', 'limited']);
    expect(Object.keys(file)).toEqual(['format', 'generated', 'pegMl', 'bottles', 'lowBottles', 'summary']);
  });

  it('works out ml and pegs left', () => {
    expect(file.bottles[0]).toMatchObject({ name: 'Bitterwick', mlLeft: 100, pegsLeft: 3, pricePerPegCents: 90, low: true, limited: false });
    expect(file.bottles[3]).toMatchObject({ limited: true, low: false });
  });

  it('lists low bottles emptiest first and writes the summary sentence', () => {
    expect(file.lowBottles).toEqual(['dry vermouth', 'Bitterwick', 'gin']);
    expect(file.summary).toBe('3 bottles low: dry vermouth, Bitterwick, gin.');
  });

  it('is valid JSON that parses back to the same thing', () => {
    expect(JSON.parse(smartHomeJson(bar, 30, NOW))).toEqual(file);
  });

  it('writes null, not 0, for the price per peg of a gift', () => {
    const f = smartHome([bottle('g', { paidCents: 0 })], 30, NOW);
    expect(f.bottles[0]!.pricePerPegCents).toBeNull();
    expect(JSON.parse(smartHomeJson([bottle('g', { paidCents: 0 })], 30, NOW)).bottles[0].pricePerPegCents).toBeNull();
  });

  it('never contains NaN or a stray null for a random bar (property)', () => {
    fc.assert(
      fc.property(bottlesArb(8), fc.integer({ min: 5, max: 500 }), (bottles, peg) => {
        const text = smartHomeJson(bottles, peg, NOW);
        const back = JSON.parse(text) as ReturnType<typeof smartHome>;
        expect(back.bottles).toHaveLength(bottles.length);
        back.bottles.forEach((x, i) => expect(x.pricePerPegCents === null).toBe(bottles[i]!.paidCents === 0));
        for (const b of back.bottles) for (const [k, v] of Object.entries(b)) if (k !== 'pricePerPegCents') expect(v).not.toBeNull();
        expect(back.lowBottles).toHaveLength(bottles.filter((b) => b.fillPct <= b.lowPct).length);
      }),
      RUNS,
    );
  });
});

describe('the one-line summary', () => {
  it('says no bottles are low for none', () => expect(lowSummary([])).toBe('No bottles are low.'));
  it('uses the singular for one', () => expect(lowSummary(['Bitterwick'])).toBe('1 bottle low: Bitterwick.'));
  it('uses the plural and commas for two or more', () => {
    expect(lowSummary(['a', 'b'])).toBe('2 bottles low: a, b.');
    expect(lowSummary(['Bitterwick', 'dry vermouth', 'gin'])).toBe('3 bottles low: Bitterwick, dry vermouth, gin.');
  });
  it('names the first few and counts the rest', () => {
    const names = Array.from({ length: SUMMARY_NAMES + 3 }, (_, i) => `n${i}`);
    const s = lowSummary(names);
    expect(s.startsWith(`${names.length} bottles low: n0, `)).toBe(true);
    expect(s.endsWith(' and 3 more.')).toBe(true);
    expect(s).not.toContain(`n${SUMMARY_NAMES}`);
  });
  it('always ends in one full stop and starts with a digit or No (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.endsWith('.')), { maxLength: 20 }), (names) => {
        const s = lowSummary(names);
        expect(s.endsWith('.')).toBe(true);
        expect(/^(No|\d+) /.test(s)).toBe(true);
      }),
      RUNS,
    );
  });
});
