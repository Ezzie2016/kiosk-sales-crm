/**
 * Duplicate detection (spec §4) — the ranking + explanation layer.
 *
 * The authoritative candidate search runs in Postgres
 * (`crm.find_duplicate_prospect_candidates`, a SECURITY DEFINER function) so that
 * a salesperson can be told "already assigned to Amaka" without being able to
 * read Amaka's prospects. This module takes those candidate rows and:
 *
 *   1. works out WHY each one matched (which identifier collided),
 *   2. grades the match strength, and
 *   3. produces the warning string shown in the UI.
 *
 * Keeping this in tested TypeScript rather than SQL means the "is this a
 * blocking duplicate?" rule has one readable implementation.
 */
import type { NormalizedProspectIdentifiers } from './normalization';

export type MatchStrength = 'strong' | 'moderate';

/**
 * Which identifier caused a match. Unique contact identifiers are `strong`;
 * a business-name collision alone is `moderate` (two real shops can share a name).
 */
export type MatchField = 'phone' | 'whatsapp' | 'email' | 'instagram' | 'website' | 'business_name';

const STRONG_FIELDS: ReadonlySet<MatchField> = new Set(['phone', 'whatsapp', 'email', 'instagram', 'website']);

/** A candidate row as returned by the DB search — only non-sensitive columns. */
export interface DuplicateCandidate {
  id: string;
  businessName: string;
  status: string;
  assignedSalespersonName: string | null;
  businessNameNormalized: string | null;
  phoneNormalized: string | null;
  whatsappNormalized: string | null;
  emailNormalized: string | null;
  instagramNormalized: string | null;
  websiteNormalized: string | null;
}

export interface DuplicateMatch {
  id: string;
  businessName: string;
  status: string;
  assignedSalespersonName: string | null;
  matchedOn: MatchField[];
  strength: MatchStrength;
  /** Human-readable, e.g. `A prospect with @examplestore already exists and is assigned to Amaka.` */
  message: string;
}

const FIELD_LABEL: Record<MatchField, string> = {
  phone: 'phone number',
  whatsapp: 'WhatsApp number',
  email: 'email',
  instagram: 'Instagram handle',
  website: 'website',
  business_name: 'business name',
};

/**
 * Compare one candidate against the new prospect's normalized identifiers.
 * A phone value is checked against BOTH the candidate's phone and WhatsApp slots
 * (and vice-versa) because the same number is routinely entered in either.
 */
function fieldsMatched(
  candidate: DuplicateCandidate,
  identifiers: NormalizedProspectIdentifiers,
): MatchField[] {
  const matched: MatchField[] = [];
  const candidatePhoneValues = [candidate.phoneNormalized, candidate.whatsappNormalized].filter(
    (v): v is string => v !== null,
  );

  if (identifiers.phoneNormalized && candidatePhoneValues.includes(identifiers.phoneNormalized)) {
    matched.push('phone');
  }
  if (
    identifiers.whatsappNormalized &&
    identifiers.whatsappNormalized !== identifiers.phoneNormalized &&
    candidatePhoneValues.includes(identifiers.whatsappNormalized)
  ) {
    matched.push('whatsapp');
  }
  if (identifiers.emailNormalized && identifiers.emailNormalized === candidate.emailNormalized) {
    matched.push('email');
  }
  if (identifiers.instagramNormalized && identifiers.instagramNormalized === candidate.instagramNormalized) {
    matched.push('instagram');
  }
  if (identifiers.websiteNormalized && identifiers.websiteNormalized === candidate.websiteNormalized) {
    matched.push('website');
  }
  if (
    identifiers.businessNameNormalized &&
    identifiers.businessNameNormalized === candidate.businessNameNormalized
  ) {
    matched.push('business_name');
  }
  return matched;
}

function buildMessage(candidate: DuplicateCandidate, matchedOn: MatchField[], identifiers: NormalizedProspectIdentifiers): string {
  const owner = candidate.assignedSalespersonName
    ? `assigned to ${candidate.assignedSalespersonName}`
    : 'unassigned';

  // Lead with the most specific identifier we can name.
  if (matchedOn.includes('instagram') && identifiers.instagramNormalized) {
    return `A prospect with @${identifiers.instagramNormalized} already exists and is ${owner}.`;
  }
  if (matchedOn.includes('phone') && identifiers.phoneNormalized) {
    return `A prospect with phone ${identifiers.phoneNormalized} already exists and is ${owner}.`;
  }
  if (matchedOn.includes('whatsapp') && identifiers.whatsappNormalized) {
    return `A prospect with WhatsApp ${identifiers.whatsappNormalized} already exists and is ${owner}.`;
  }
  if (matchedOn.includes('email') && identifiers.emailNormalized) {
    return `A prospect with email ${identifiers.emailNormalized} already exists and is ${owner}.`;
  }
  if (matchedOn.includes('website') && identifiers.websiteNormalized) {
    return `A prospect with website ${identifiers.websiteNormalized} already exists and is ${owner}.`;
  }
  const labels = matchedOn.map((f) => FIELD_LABEL[f]).join(' and ');
  return `"${candidate.businessName}" looks like an existing prospect (same ${labels}) and is ${owner}.`;
}

/**
 * Rank candidate rows into duplicate matches, strongest first. Candidates that
 * do not actually share a normalized identifier with the new prospect are
 * dropped (the DB search is an OR over several columns and can over-return).
 */
export function findDuplicates(
  identifiers: NormalizedProspectIdentifiers,
  candidates: DuplicateCandidate[],
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];

  for (const candidate of candidates) {
    const matchedOn = fieldsMatched(candidate, identifiers);
    if (matchedOn.length === 0) continue;

    const strength: MatchStrength = matchedOn.some((f) => STRONG_FIELDS.has(f)) ? 'strong' : 'moderate';
    matches.push({
      id: candidate.id,
      businessName: candidate.businessName,
      status: candidate.status,
      assignedSalespersonName: candidate.assignedSalespersonName,
      matchedOn,
      strength,
      message: buildMessage(candidate, matchedOn, identifiers),
    });
  }

  return matches.sort((a, b) => {
    if (a.strength !== b.strength) return a.strength === 'strong' ? -1 : 1;
    return b.matchedOn.length - a.matchedOn.length;
  });
}

/**
 * A create should be blocked (pending explicit override) when there is at least
 * one strong match. Moderate-only matches warn but do not block.
 */
export function hasBlockingDuplicate(matches: DuplicateMatch[]): boolean {
  return matches.some((m) => m.strength === 'strong');
}
