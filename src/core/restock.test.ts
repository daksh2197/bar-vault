import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bottle, bottlesArb, RUNS } from './fixtures';
import { csvField, csvRow, lowBottles, shoppingItems, shoppingListCsv, SHOPPING_CSV_HEADER, shoppingListText, watchlist } from './restock';

const bar = [
  bottle('a', { name: 'Bitterwick-ish', fillPct: 15, category: 'liqueur' }),
  bottle('b', { name: 'Gin', fillPct: 5 }),
  bottle('c', { name: 'Rum', fillPct: 80, watch: true, watchNote: 'Cheaper on Oct 20' }),
  bottle('d', { name: 'Vermouth', fillPct: 10, watch: true, watchNote: 'ask, "dry"' }),
  bottle('e', { name: 'Vodka', fillPct: 90 }),
];

describe('what is low', () => {
  it('lists bottles at or under their own threshold, emptiest first', () => {
    expect(lowBottles(bar).map((b) => b.id)).toEqual(['b', 'd', 'a']);
  });
  it('uses each bottle\'s own threshold', () => {
    expect(lowBottles([bottle('x', { fillPct: 40, lowPct: 40 }), bottle('y', { fillPct: 40, lowPct: 39 })]).map((b) => b.id)).toEqual(['x']);
  });
  it('lists the watchlist by name', () => expect(watchlist(bar).map((b) => b.id)).toEqual(['c', 'd']));
  it('puts a bottle that is low and watched in the list once', () => {
    const items = shoppingItems(bar);
    expect(items.map((i) => i.bottle.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(items.find((i) => i.bottle.id === 'd')).toMatchObject({ low: true, watch: true });
    expect(items.find((i) => i.bottle.id === 'c')).toMatchObject({ low: false, watch: true });
  });
  it('lists every bottle at most once (property)', () => {
    fc.assert(
      fc.property(bottlesArb(10), (bottles) => {
        const ids = shoppingItems(bottles).map((i) => i.bottle.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.length).toBe(bottles.filter((b) => b.watch || b.fillPct <= b.lowPct).length);
      }),
      RUNS,
    );
  });
});

describe('the shopping list as text', () => {
  const text = shoppingListText(bar, 30, '2026-10-23');
  it('has a title and the date', () => {
    expect(text.startsWith('Bar Vault shopping list\nMade 2026-10-23\n')).toBe(true);
  });
  it('has a Low section and a Watching section', () => {
    expect(text).toContain('\nLow\n');
    expect(text).toContain('\nWatching\n');
  });
  it('shows percent left and pegs left for a low bottle', () => {
    expect(text).toContain('- Gin (gin, 750 ml): 5% left, 1 peg');
    expect(text).toContain('- Bitterwick-ish (liqueur, 750 ml): 15% left, 3 pegs');
  });
  it('carries the owner\'s watch note', () => {
    expect(text).toContain('- Rum (gin, 750 ml): Cheaper on Oct 20');
  });
  it('says so when there is nothing to buy', () => {
    expect(shoppingListText([bottle('z', { fillPct: 90 })], 30, '2026-10-23')).toContain('Nothing is low and nothing is on the watchlist.');
    expect(shoppingListText([], 30, '2026-10-23')).toContain('Nothing is low');
  });
  it('ends with a newline', () => expect(text.endsWith('\n')).toBe(true));
});

describe('csv writing', () => {
  it.each([
    ['plain', 'plain'],
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['two\nlines', '"two\nlines"'],
    ['cr\rhere', '"cr\rhere"'],
    ['', ''],
  ])('writes %j as %j', (value, want) => {
    expect(csvField(value)).toBe(want);
  });
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])('puts a single quote in front of %j so a spreadsheet shows it as text', (value) => {
    const out = csvField(value);
    expect(out.replace(/^"/, '').startsWith("'")).toBe(true);
  });
  it('quotes and guards together', () => expect(csvField('=1,2')).toBe('"\'=1,2"'));
  it('leaves a name with a dash or equals sign in the middle alone', () => {
    expect(csvField('Gin - dry')).toBe('Gin - dry');
    expect(csvField('a=b')).toBe('a=b');
  });
  it('never writes a field that starts with a formula character (property)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (v) => {
        const out = csvField(v);
        const bare = out.startsWith('"') ? out.slice(1) : out;
        expect(/^[=+\-@\t\r]/.test(bare)).toBe(false);
      }),
      RUNS,
    );
  });
  it('joins a row with commas', () => expect(csvRow(['a', 'b,c', 'd'])).toBe('a,"b,c",d'));
  it('writes the shopping CSV header first', () => {
    expect(shoppingListCsv(bar).split('\n')[0]).toBe(SHOPPING_CSV_HEADER);
    expect(SHOPPING_CSV_HEADER).toBe('name,category,size_ml,fill_pct,reason,note');
  });
  it('names the reason for each row', () => {
    const csv = shoppingListCsv(bar);
    expect(csv).toContain('Gin,gin,750,5,low,');
    expect(csv).toContain('Rum,gin,750,80,watching,Cheaper on Oct 20');
    expect(csv).toContain('Vermouth,gin,750,10,low and watching,"ask, ""dry"""');
  });
  it('guards a bottle name and a watch note in the shopping CSV', () => {
    const csv = shoppingListCsv([bottle('z', { name: '=HYPERLINK("x")', fillPct: 1, watch: true, watchNote: '@home' })]);
    expect(csv).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csv).toContain(",'@home");
  });
  it('is only the header when there is nothing to buy', () => {
    expect(shoppingListCsv([])).toBe(SHOPPING_CSV_HEADER + '\n');
  });
});
