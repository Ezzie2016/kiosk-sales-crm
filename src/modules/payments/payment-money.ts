/**
 * Money conversion for payment records. Amounts are stored as integer kobo
 * (minor units) — never a float. The form takes naira; these convert at the
 * boundary and round half-up so "1500.005" can't silently drop a kobo.
 */

/** Naira (may have up to 2 decimals) → integer kobo. Throws on non-finite input. */
export function nairaToKobo(naira: number): number {
  if (!Number.isFinite(naira)) throw new Error('Amount must be a number');
  if (naira < 0) throw new Error('Amount cannot be negative');
  return Math.round(naira * 100);
}

/** Integer kobo → naira number (for pre-filling an edit form). */
export function koboToNaira(kobo: number): number {
  return kobo / 100;
}

/** Parse a user-typed amount string ("1,500.50", "₦1500") → kobo, or null if unparseable. */
export function parseNairaInput(raw: string): number | null {
  const cleaned = raw.replace(/[₦,\s]/g, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return nairaToKobo(n);
}
