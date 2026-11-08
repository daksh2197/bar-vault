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

  it('carries the adapted-from header in the first line of every file taken from coin-vault', () => {
    const adapted = ['src/core/decimal.ts', 'src/core/money.ts', 'src/core/dates.ts', 'src/core/lock.ts', 'src/core/db.ts', 'src/core/vaultfile.ts', 'src/core/schema.ts', 'src/core/form.ts', 'src/core/sample.ts', 'src/core/types.ts', 'src/ui/dom.ts', 'src/ui/words.ts', 'vite.config.ts', 'public/sw.js', 'scripts/stamp-sw.mjs', '.github/workflows/ship.yml'];
    for (const f of adapted) expect(read(join(root, f)).split('\n', 1)[0], f).toMatch(/^(\/\/|#) Adapted from coin-vault \(MIT, Daksh Dua\)$/);
  });

  it('keeps a deploy that is already running from being cancelled, and says Pages must be switched on first', () => {
    const wf = read(join(root, '.github/workflows/ship.yml'));
    expect(wf).toContain('cancel-in-progress: false');
    expect(wf).toContain('Settings > Pages > Source to GitHub Actions BEFORE the first public push');
    expect(read(join(root, 'docs/CTO-NOTES.md'))).toContain('Set Settings > Pages > Source to GitHub Actions before the first public push');
  });

  it('does not say the policy stops everything, only what it does', () => {
    for (const f of ['README.md', 'docs/CTO-NOTES.md']) {
      expect(read(join(root, f)), f).not.toMatch(/cannot send anything anywhere|blocks every connection/);
      expect(read(join(root, f)), f).toContain('blocks fetch, XHR and outside images');
    }
  });

  it('keeps the dark-mode empty-bottle outline at 3:1 against the page', () => {
    const css = read(join(root, 'src/styles/app.css'));
    const alpha = Number(/is-empty \.outline \{[^}]*rgba\(237, 232, 221, ([\d.]+)\)/.exec(css)?.[1]);
    const mix = (a: number, c: number, g: number): number => Math.round(g + a * (c - g));
    const lin = (v: number): number => ((v / 255) ** 2.2);
    const lum = (r: number, g: number, b: number): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const fg = lum(mix(alpha, 237, 17), mix(alpha, 232, 18), mix(alpha, 221, 20));
    const bg = lum(17, 18, 20);
    expect((fg + 0.05) / (bg + 0.05)).toBeGreaterThanOrEqual(3);
  });
});
