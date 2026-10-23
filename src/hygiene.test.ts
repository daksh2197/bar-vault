import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url).pathname;
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
const source = files(join(root, 'src')).filter((f) => /\.(ts|css)$/.test(f) && !f.endsWith('hygiene.test.ts'));
const page = [...source, join(root, 'index.html'), join(root, 'public/sw.js')];
const read = (f: string): string => readFileSync(f, 'utf8');

describe('rules that hold for the whole repo', () => {
  it('finds the source files it is meant to scan', () => expect(source.length).toBeGreaterThan(30));

  it('has no health, drinking-pace or consumption copy, not even in comments', () => {
    const banned = /\b(health|healthy|calorie|calories|blood|alcohol content|abv|intoxicat\w*|binge|hangover|units? per (day|week)|drink more|drinks? per (day|week|hour)|pace yourself|consumption|consumed|sober\w*|recovery|addict\w*)\b/i;
    for (const f of source) expect(read(f), f).not.toMatch(banned);
  });

  it('never writes user data into the page as markup', () => {
    for (const f of source) {
      const text = read(f);
      expect(text, f).not.toMatch(/\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=|document\.write|\beval\(|new Function\(/);
    }
  });

  it('makes no network request from the app code', () => {
    for (const f of source) expect(read(f), f).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/);
  });

  it('leaves no TODO, FIXME, lorem or debug output behind', () => {
    for (const f of [...page, ...files(join(root, 'docs')).filter((d) => d.endsWith('.md'))]) {
      expect(read(f), f).not.toMatch(/\b(TODO|FIXME|XXX|lorem ipsum)\b|console\.(log|debug)\(/i);
    }
  });

  it('uses no exclamation marks or em dashes in screen copy', () => {
    for (const f of source.filter((x) => x.includes('/ui/') && !x.endsWith('.test.ts'))) {
      const strings = read(f).match(/'[^'\n]{3,}'|`[^`\n]{3,}`/g) ?? [];
      for (const str of strings) {
        if (/^'(?:!|!=|=|\w+!)/.test(str)) continue;
        expect(str, f).not.toMatch(/—|[a-z.,]!(?=\s|'|`)/);
      }
    }
  });

  it('keeps real brand names out of the sample and the screens', () => {
    const brands = /\b(jack daniel|jim beam|johnnie walker|jameson|bacardi|smirnoff|absolut|grey goose|tanqueray|bombay|hendrick|beefeater|bitterwick-never|campari|aperol|cinzano|courvoisier|hennessy|patr[oó]n|cuervo|captain morgan|diageo|macallan|lagavulin|laphroaig|bulleit)\b/i;
    for (const f of source.filter((x) => !x.endsWith('.test.ts'))) expect(read(f), f).not.toMatch(brands);
  });

  it('ships a policy that blocks all connections from the page', () => {
    const config = read(join(root, 'vite.config.ts'));
    expect(config).toContain("connect-src 'none'");
    expect(config).toContain("default-src 'none'");
    expect(read(join(root, 'index.html'))).toContain('%CSP%');
  });

  it('carries the adapted-from header on every file taken from coin-vault', () => {
    for (const f of ['core/decimal.ts', 'core/money.ts', 'core/dates.ts', 'core/lock.ts', 'core/db.ts', 'core/vaultfile.ts', 'core/schema.ts', 'core/form.ts', 'core/sample.ts', 'ui/dom.ts', 'ui/words.ts']) {
      expect(read(join(root, 'src', f)).split('\n', 3).join('\n'), f).toContain('Adapted from coin-vault (MIT, Daksh Dua)');
    }
  });
});
