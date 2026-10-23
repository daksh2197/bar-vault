import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AMAZON_NOTE, FETCHED, GUIDES, NOT_DOCUMENTED, NOT_DOCUMENTED_SUMMARY } from './smarthome-copy';

const everyString = (): string[] => [
  FETCHED,
  NOT_DOCUMENTED,
  ...NOT_DOCUMENTED_SUMMARY,
  ...GUIDES.flatMap((g) => [g.name, g.intro, ...g.steps, ...g.notDocumented, ...g.documented.flatMap((d) => [d.quote, d.url, d.note ?? ''])]),
];

describe('the smart-home guide copy', () => {
  it('has the three guides, in order', () => expect(GUIDES.map((g) => g.id)).toEqual(['alexa', 'google', 'apple']));

  it('gives every documented fact a quote and an official https page', () => {
    for (const g of GUIDES) {
      expect(g.documented.length).toBeGreaterThan(0);
      for (const d of g.documented) {
        expect(d.quote.length).toBeGreaterThan(10);
        expect(d.url).toMatch(/^https:\/\/(digprjsurvey\.amazon\.com|support\.google\.com|support\.apple\.com)\//);
      }
    }
  });

  it('uses the exact fetched and not-documented phrases', () => {
    expect(FETCHED).toBe('fetched Oct 23, 2026');
    expect(NOT_DOCUMENTED).toBe('not documented on the pages fetched for this build (Oct 23, 2026)');
  });

  it('never claims Alexa or Google can read a file', () => {
    const text = everyString().join('\n');
    expect(text).not.toMatch(/(alexa|google)[^.]{0,40}\b(can|will|does|is able to)\b[^.]{0,30}\b(read|import|sync|open|load)\b/i);
    expect(text).not.toMatch(/\b(alexa|google)\b[^.]{0,40}\bsupports?\b[^.]{0,20}\b(json|csv|file)/i);
  });

  it('lists the undocumented file reading for both Alexa and Google', () => {
    expect(GUIDES.find((g) => g.id === 'alexa')!.notDocumented.join(' ')).toMatch(/JSON or CSV file/);
    expect(GUIDES.find((g) => g.id === 'google')!.notDocumented.join(' ')).toMatch(/JSON or CSV file/);
  });

  it('keeps the unverified Apple actions in the not-documented list', () => {
    const apple = GUIDES.find((g) => g.id === 'apple')!.notDocumented.join(' ');
    for (const w of ['Get File', 'Speak Text', 'Reminders', 'Home automation']) expect(apple).toContain(w);
  });

  it('follows the voice rules: no exclamation marks, em dashes or hype words', () => {
    const text = everyString().join('\n');
    expect(text).not.toMatch(/!|—|–/);
    expect(text).not.toMatch(/revolutionary|powerful|seamless|blazing|game-changing|robust|cutting-edge|unlock|leverage|supercharge/i);
  });

  it('says plainly that the Alexa pages came from an Amazon-hosted copy', () => {
    expect(AMAZON_NOTE).toBe("Amazon's pages were reached through an Amazon-hosted copy of the Alexa help (digprjsurvey.amazon.com), fetched Oct 23, 2026");
    expect(GUIDES.find((g) => g.id === 'alexa')!.intro).toContain(AMAZON_NOTE);
    expect(readFileSync(new URL('../../docs/SMART-HOME.md', import.meta.url), 'utf8')).toContain(AMAZON_NOTE);
    expect(readFileSync(new URL('../../README.md', import.meta.url), 'utf8')).toContain(AMAZON_NOTE);
    expect(readFileSync(new URL('../../README.md', import.meta.url), 'utf8')).not.toContain('quoted from their own help pages');
  });

  it('is mirrored in docs/SMART-HOME.md: every URL and the exact not-documented phrase', () => {
    const doc = readFileSync(new URL('../../docs/SMART-HOME.md', import.meta.url), 'utf8');
    for (const g of GUIDES) for (const d of g.documented) expect(doc, d.url).toContain(d.url);
    expect(doc).toContain(NOT_DOCUMENTED);
    expect(doc).toContain(FETCHED);
    for (const g of GUIDES) for (const d of g.documented) expect(doc, d.quote).toContain(d.quote);
  });
});
