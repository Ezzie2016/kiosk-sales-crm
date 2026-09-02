/**
 * Identifier normalization for duplicate detection (spec §4).
 *
 * This module is the single source of truth for how an Instagram handle, phone
 * number, email, website or business name is reduced to a canonical form before
 * two prospects are compared. The `crm.prospects` table stores the normalized
 * forms in dedicated columns; the service layer computes them with these
 * functions on every write, so there is exactly one implementation.
 *
 * Every function returns `null` for input that normalizes to nothing, so callers
 * never compare "" against "".
 */

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function blankToNull(value: string): string | null {
  return value.length === 0 ? null : value;
}

/**
 * Instagram handle → bare lowercase handle.
 *
 *   "@ExampleStore"                         → "examplestore"
 *   "https://www.instagram.com/ExampleStore/?hl=en" → "examplestore"
 *   "instagram.com/example.store"           → "example.store"
 */
export function normalizeInstagramHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim().toLowerCase();
  if (value.length === 0) return null;

  // Strip a URL wrapper if present.
  value = value.replace(/^https?:\/\//, '').replace(/^www\./, '');
  value = value.replace(/^(?:m\.)?instagram\.com\//, '');

  // Drop query string / fragment / trailing slash.
  value = value.split(/[?#]/)[0] ?? value;
  value = value.replace(/\/+$/, '');

  // Strip a leading @ and any stray whitespace.
  value = value.replace(/^@+/, '').trim();

  // A handle has no slashes; if something path-like slipped through, take the first segment.
  value = value.split('/')[0] ?? value;

  return blankToNull(value);
}

/**
 * Phone / WhatsApp number → E.164-style string, biased to Nigeria (+234) because
 * that is the entire current market. Non-Nigerian-looking input is preserved as
 * `+<digits>` rather than forced into +234.
 *
 *   "0803 123 4567"   → "+2348031234567"
 *   "234 803 1234567" → "+2348031234567"
 *   "+2348031234567"  → "+2348031234567"
 *   "8031234567"      → "+2348031234567"
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const hadPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 0) return null;

  // Local format: 0XXXXXXXXXX (11 digits, leading 0).
  if (!hadPlus && digits.length === 11 && digits.startsWith('0')) {
    return `+234${digits.slice(1)}`;
  }
  // Country code without plus: 234XXXXXXXXXX (13 digits).
  if (digits.startsWith('234') && digits.length === 13) {
    return `+${digits}`;
  }
  // Bare subscriber number: XXXXXXXXXX (10 digits, no leading 0, no plus).
  if (!hadPlus && digits.length === 10) {
    return `+234${digits}`;
  }
  // Anything else: keep the digits, preserve that it was/was not international.
  return `+${digits}`;
}

/** Email → trimmed lowercase. Deliberately does NOT strip +tags or gmail dots (too surprising). */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  return blankToNull(value);
}

/**
 * Website → bare lowercase hostname (no protocol, no `www.`, no path).
 *
 *   "https://www.ExampleStore.com/shop" → "examplestore.com"
 *   "ExampleStore.com"                  → "examplestore.com"
 */
export function normalizeWebsite(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim().toLowerCase();
  if (value.length === 0) return null;

  value = value.replace(/^https?:\/\//, '');
  value = value.replace(/^www\./, '');
  value = value.split(/[/?#]/)[0] ?? value; // hostname only
  value = value.replace(/\/+$/, '');

  return blankToNull(value);
}

/**
 * Business name → lowercase, punctuation removed, whitespace collapsed, and a
 * short list of generic trailing/standalone words dropped ("ltd", "nigeria",
 * "stores", …). Intentionally conservative: it catches "Example Stores Ltd" vs
 * "example stores" but will not merge genuinely different businesses.
 */
const GENERIC_NAME_WORDS = new Set([
  'ltd',
  'limited',
  'plc',
  'inc',
  'enterprise',
  'enterprises',
  'ventures',
  'nigeria',
  'nig',
  'ng',
  'and',
  'the',
]);

export function normalizeBusinessName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.toLowerCase();

  // Apostrophes are elided, not spaced, so "Amaka's" → "amakas" rather than "amaka s".
  value = value.replace(/['’`]/g, '');
  // Replace ampersand with "and" so it is handled by the generic-word filter.
  value = value.replace(/&/g, ' and ');
  // Any other punctuation becomes a space.
  value = value.replace(/[^a-z0-9\s]/g, ' ');
  value = collapseWhitespace(value);
  if (value.length === 0) return null;

  const kept = value.split(' ').filter((word) => !GENERIC_NAME_WORDS.has(word));
  // If filtering removed everything (e.g. name was literally "The Ltd"), fall back to the unfiltered form.
  const result = kept.length > 0 ? kept.join(' ') : value;

  return blankToNull(result);
}

export interface RawProspectIdentifiers {
  businessName?: string | null;
  phone?: string | null;
  whatsappNumber?: string | null;
  email?: string | null;
  instagramHandle?: string | null;
  website?: string | null;
}

export interface NormalizedProspectIdentifiers {
  businessNameNormalized: string | null;
  phoneNormalized: string | null;
  whatsappNormalized: string | null;
  emailNormalized: string | null;
  instagramNormalized: string | null;
  websiteNormalized: string | null;
}

/** Normalize every identifier on a prospect in one call. */
export function normalizeProspectIdentifiers(input: RawProspectIdentifiers): NormalizedProspectIdentifiers {
  return {
    businessNameNormalized: normalizeBusinessName(input.businessName),
    phoneNormalized: normalizePhone(input.phone),
    whatsappNormalized: normalizePhone(input.whatsappNumber),
    emailNormalized: normalizeEmail(input.email),
    instagramNormalized: normalizeInstagramHandle(input.instagramHandle),
    websiteNormalized: normalizeWebsite(input.website),
  };
}
