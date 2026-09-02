/**
 * Conversion between a stored ISO timestamp and the value an
 * `<input type="datetime-local">` expects (`YYYY-MM-DDTHH:mm`, local time, no zone).
 *
 * The form edits a wall-clock time in the user's own timezone; on save we turn
 * it back into a zoned ISO string so Postgres stores an unambiguous instant.
 */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** ISO timestamp → `YYYY-MM-DDTHH:mm` in the viewer's local time. Empty input → ''. */
export function toDateTimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * `YYYY-MM-DDTHH:mm` (local wall-clock from the input) → full ISO string with
 * offset. Blank / unparseable input → null.
 */
export function fromDateTimeLocalValue(value: string | null | undefined): string | null {
  if (!value || value.trim().length === 0) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
