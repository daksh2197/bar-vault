// Adapted from coin-vault (MIT, Daksh Dua)
import { describe, expect, it } from 'vitest';
import { ageWords, daysBetween, isIsoDate, isIsoTimestamp, parseDate, todayLocal } from './dates';

describe('dates', () => {
  it.each([
    ['2024-02-29', true],
    ['2026-02-29', false],
    ['2026-13-01', false],
    ['2026-00-10', false],
    ['2026-04-31', false],
    ['26-1-1', false],
    ['0999-01-01', false],
    ['2026-10-23', true],
    ['', false],
    ['2026-10-23 ', false],
  ])('knows whether %j is a real date: %s', (text, real) => {
    expect(isIsoDate(text)).toBe(real);
  });

  it('knows a real timestamp from a date or a guess', () => {
    expect(isIsoTimestamp('2026-10-23T12:00:00.000Z')).toBe(true);
    expect(isIsoTimestamp('2026-10-23')).toBe(false);
    expect(isIsoTimestamp('2026-10-23T25:00:00Z')).toBe(false);
    expect(isIsoTimestamp('2026-10-23T12:00:00Z'.repeat(2))).toBe(false);
  });

  it('reads today from the local clock', () => {
    expect(todayLocal(new Date(2026, 9, 23, 23, 59))).toBe('2026-10-23');
    expect(todayLocal(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
  });

  it('parses a typed date and refuses the future when asked', () => {
    expect(parseDate(' 2026-10-23 ', '2026-10-23', { allowFuture: false })).toEqual({ ok: true, value: '2026-10-23' });
    expect(parseDate('2026-10-24', '2026-10-23', { allowFuture: false }).ok).toBe(false);
    expect(parseDate('2026-10-24', '2026-10-23', { allowFuture: true }).ok).toBe(true);
    expect(parseDate('tomorrow', '2026-10-23', { allowFuture: true }).ok).toBe(false);
  });

  it('counts whole days, across a leap day and a year end', () => {
    expect(daysBetween('2026-10-01', '2026-10-23')).toBe(22);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(daysBetween('2026-10-23', '2026-10-01')).toBe(-22);
  });

  it('says how old a day is in words', () => {
    expect(ageWords(0)).toBe('today');
    expect(ageWords(1)).toBe('1 day ago');
    expect(ageWords(13)).toBe('13 days ago');
    expect(ageWords(-3)).toBe('dated in the future');
  });
});
