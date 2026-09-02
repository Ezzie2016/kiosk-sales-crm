import { describe, expect, it } from 'vitest';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from './datetime-local';

describe('toDateTimeLocalValue', () => {
  it('formats an ISO timestamp as local YYYY-MM-DDTHH:mm', () => {
    // Build an instant from known local components so the assertion is tz-independent.
    const local = new Date(2026, 7, 30, 9, 5); // 2026-08-30 09:05 local
    expect(toDateTimeLocalValue(local.toISOString())).toBe('2026-08-30T09:05');
  });

  it('zero-pads month, day, hour and minute', () => {
    const local = new Date(2026, 0, 3, 4, 7);
    expect(toDateTimeLocalValue(local.toISOString())).toBe('2026-01-03T04:07');
  });

  it('returns an empty string for null / undefined / unparseable input', () => {
    expect(toDateTimeLocalValue(null)).toBe('');
    expect(toDateTimeLocalValue(undefined)).toBe('');
    expect(toDateTimeLocalValue('not-a-date')).toBe('');
  });
});

describe('fromDateTimeLocalValue', () => {
  it('turns a local wall-clock value into a zoned ISO instant', () => {
    const iso = fromDateTimeLocalValue('2026-08-30T09:05');
    expect(iso).not.toBeNull();
    // Same instant as the local Date the input represents.
    expect(new Date(iso as string).getTime()).toBe(new Date(2026, 7, 30, 9, 5).getTime());
  });

  it('round-trips with toDateTimeLocalValue', () => {
    const original = new Date(2026, 4, 1, 16, 45).toISOString();
    expect(fromDateTimeLocalValue(toDateTimeLocalValue(original))).toBe(original);
  });

  it('returns null for blank input', () => {
    expect(fromDateTimeLocalValue('')).toBeNull();
    expect(fromDateTimeLocalValue('   ')).toBeNull();
    expect(fromDateTimeLocalValue(null)).toBeNull();
  });
});
