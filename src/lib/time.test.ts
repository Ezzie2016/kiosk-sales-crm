import { describe, expect, it } from 'vitest';
import {
  dayRangeInTimeZone,
  isBeforeToday,
  isSameDayInTimeZone,
  startOfDayInTimeZone,
} from './time';

const LAGOS = 'Africa/Lagos'; // UTC+1, no DST

describe('startOfDayInTimeZone (Africa/Lagos)', () => {
  it('is 23:00 UTC the previous day', () => {
    // 2026-08-29 10:00 UTC → Lagos day is 2026-08-29, which started at 2026-08-28 23:00 UTC.
    const start = startOfDayInTimeZone(new Date('2026-08-29T10:00:00Z'), LAGOS);
    expect(start.toISOString()).toBe('2026-08-28T23:00:00.000Z');
  });

  it('rolls the Lagos day at 23:00 UTC, not at 00:00 UTC', () => {
    // 22:30 UTC is still "yesterday" for UTC-thinking code but already the new day in Lagos.
    const beforeRoll = startOfDayInTimeZone(new Date('2026-08-29T22:30:00Z'), LAGOS);
    const afterRoll = startOfDayInTimeZone(new Date('2026-08-29T23:30:00Z'), LAGOS);
    expect(beforeRoll.toISOString()).toBe('2026-08-28T23:00:00.000Z');
    expect(afterRoll.toISOString()).toBe('2026-08-29T23:00:00.000Z');
  });
});

describe('dayRangeInTimeZone', () => {
  it('spans exactly 24 hours', () => {
    const { start, end } = dayRangeInTimeZone(new Date('2026-08-29T10:00:00Z'), LAGOS);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe('isSameDayInTimeZone', () => {
  it('treats 23:30 UTC and 00:30 UTC next day as the same Lagos day', () => {
    expect(
      isSameDayInTimeZone(new Date('2026-08-29T23:30:00Z'), new Date('2026-08-30T00:30:00Z'), LAGOS),
    ).toBe(true);
  });

  it('treats 22:30 UTC and 23:30 UTC as different Lagos days', () => {
    expect(
      isSameDayInTimeZone(new Date('2026-08-29T22:30:00Z'), new Date('2026-08-29T23:30:00Z'), LAGOS),
    ).toBe(false);
  });
});

describe('isBeforeToday (overdue check)', () => {
  const now = new Date('2026-08-29T10:00:00Z'); // Lagos: 2026-08-29 11:00

  it('is true for an instant on a previous Lagos day', () => {
    expect(isBeforeToday(new Date('2026-08-28T15:00:00Z'), now, LAGOS)).toBe(true);
  });

  it('is false for an instant earlier today', () => {
    expect(isBeforeToday(new Date('2026-08-29T06:00:00Z'), now, LAGOS)).toBe(false);
  });
});
