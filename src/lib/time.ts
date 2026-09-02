/**
 * Day-boundary helpers, computed in a named time zone rather than UTC.
 *
 * Mirrors the Kiosk mobile app's Architecture Decision 11: "today" for the sales
 * team means today in Africa/Lagos (WAT, UTC+1, no DST), which can differ from
 * UTC by an hour. Every "added today" / "contacted today" count goes through
 * here so the whole app agrees on one definition of the day.
 */

export const APP_TIME_ZONE = 'Africa/Lagos';

/** The calendar date (year, month, day) that `instant` falls on in `timeZone`. */
function calendarPartsInTimeZone(instant: Date, timeZone: string): { year: number; month: number; day: number } {
  // en-CA formats as YYYY-MM-DD, which is trivial to split.
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  const [year, month, day] = formatted.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

/**
 * The offset of `timeZone` from UTC, in minutes, at `instant`
 * (e.g. Africa/Lagos → 60). Positive means ahead of UTC.
 */
function timeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const localAsUtc = new Date(
    instant.toLocaleString('en-US', { timeZone }) + ' UTC',
  );
  // Fallback for engines that reject the " UTC" suffix: use the parts diff.
  if (Number.isNaN(localAsUtc.getTime())) {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = Object.fromEntries(dtf.formatToParts(instant).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return Math.round((asUtc - instant.getTime()) / 60000);
  }
  return Math.round((localAsUtc.getTime() - instant.getTime()) / 60000);
}

/** The instant at which the current day starts in `timeZone`, as a `Date` (UTC instant). */
export function startOfDayInTimeZone(now: Date, timeZone: string = APP_TIME_ZONE): Date {
  const { year, month, day } = calendarPartsInTimeZone(now, timeZone);
  const offsetMinutes = timeZoneOffsetMinutes(now, timeZone);
  // Local midnight expressed as a UTC instant.
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMinutes * 60000);
}

/** `[start, end)` for the day that `now` falls on in `timeZone`. */
export function dayRangeInTimeZone(now: Date, timeZone: string = APP_TIME_ZONE): { start: Date; end: Date } {
  const start = startOfDayInTimeZone(now, timeZone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function isSameDayInTimeZone(a: Date, b: Date, timeZone: string = APP_TIME_ZONE): boolean {
  const pa = calendarPartsInTimeZone(a, timeZone);
  const pb = calendarPartsInTimeZone(b, timeZone);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

/** True when `instant` is strictly before the start of today in `timeZone` (i.e. overdue). */
export function isBeforeToday(instant: Date, now: Date, timeZone: string = APP_TIME_ZONE): boolean {
  return instant.getTime() < startOfDayInTimeZone(now, timeZone).getTime();
}
