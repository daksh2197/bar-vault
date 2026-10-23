import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RUNS } from '../core/fixtures';
import { hrefFor, isPageAnchor, navGroup, parseRoute } from './route';

describe('hash routes', () => {
  it.each([
    ['', 'shelf'],
    ['#', 'shelf'],
    ['#/', 'shelf'],
    ['#/bottles', 'bottles'],
    ['#/bottles/', 'bottles'],
    ['#/bottles/new', 'new'],
    ['#/restock', 'restock'],
    ['#/stats', 'stats'],
    ['#/more', 'more'],
    ['#/backup', 'backup'],
    ['#/smart-home', 'smart-home'],
    ['#/settings', 'settings'],
    ['#/about', 'about'],
    ['restock', 'restock'],
  ])('reads %j as the %s screen', (hash, name) => {
    expect(parseRoute(hash).name).toBe(name);
  });

  it('reads a bottle id', () => {
    expect(parseRoute('#/bottles/sample-01')).toEqual({ name: 'edit', id: 'sample-01' });
    expect(parseRoute('#/bottles/0f8fad5b-d9cb-469f-a165-70867728950e')).toEqual({ name: 'edit', id: '0f8fad5b-d9cb-469f-a165-70867728950e' });
  });

  it.each([
    '#/nope',
    '#/bottles/A B',
    '#/bottles/%E0%A4%A',
    '#/bottles/../../etc',
    '#/bottles/a/b',
    '#//',
    '#/%%%',
    '#/bottles/<script>',
    '#/__proto__',
    '#/constructor',
    '#/toString',
    '#/bottles/' + 'x'.repeat(65),
    '#/STATS',
    '#/stats?x=1',
    '#/bottles/new/extra',
  ])('treats %j as not found', (hash) => {
    expect(parseRoute(hash).name).toBe('notfound');
  });

  it.each(['#app', '#main', '#hero', '#restock', '#' + 'x'.repeat(500), '#bottles/new'])('treats %j as a jump on the page, not a screen', (hash) => {
    expect(isPageAnchor(hash)).toBe(true);
    expect(parseRoute(hash)).toEqual({ name: 'shelf' });
    expect(parseRoute(hash).name).not.toBe('notfound');
  });

  it.each(['', '#', '#/', '#/stats', '#/nope', '#/bottles/abc', 'restock'])('does not treat %j as a page anchor', (hash) => {
    expect(isPageAnchor(hash)).toBe(false);
  });

  it('points the skip link at an anchor, so it never shows "Page not found"', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const href = /<a class="skip" href="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(isPageAnchor(href)).toBe(true);
    expect(parseRoute(href).name).not.toBe('notfound');
  });

  it('never throws and always gives a route, whatever the hash (property)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (hash) => {
        const r = parseRoute(hash);
        expect(typeof r.name).toBe('string');
        if (r.name === 'edit') expect(r.id).toMatch(/^[a-z0-9-]{1,64}$/);
      }),
      RUNS,
    );
  });

  it('writes a link that reads back as the same route', () => {
    for (const hash of ['#/', '#/bottles', '#/bottles/new', '#/bottles/abc', '#/restock', '#/stats', '#/more', '#/backup', '#/smart-home', '#/settings', '#/about']) {
      const r = parseRoute(hash);
      expect(parseRoute(hrefFor(r))).toEqual(r);
    }
    expect(hrefFor({ name: 'notfound' })).toBe('#/');
  });

  it('groups screens under the right bottom-nav item', () => {
    expect(navGroup(parseRoute('#/'))).toBe('shelf');
    expect(navGroup(parseRoute('#/bottles/abc'))).toBe('bottles');
    expect(navGroup(parseRoute('#/bottles/new'))).toBe('bottles');
    expect(navGroup(parseRoute('#/backup'))).toBe('more');
    expect(navGroup(parseRoute('#/smart-home'))).toBe('more');
    expect(navGroup(parseRoute('#/stats'))).toBe('stats');
    expect(navGroup(parseRoute('#/restock'))).toBe('restock');
    expect(navGroup(parseRoute('#/zzz'))).toBeNull();
  });
});
