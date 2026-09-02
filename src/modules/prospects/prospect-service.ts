/**
 * Prospect service — orchestration that sits between the UI and the repository
 * (KIOSK constitution: business logic never lives in components).
 *
 * Responsibilities:
 *   - turn validated form input into the raw payload the DB expects,
 *   - run duplicate detection (normalize → search → rank),
 *   - decide whether a create is blocked.
 *
 * Normalized identifier columns are GENERATED in Postgres (see
 * 0001_crm_foundation.sql) — the payloads here carry RAW values only. The TS
 * normalizers are still used to rank/explain candidates client-side.
 *
 * It has no direct Supabase dependency: the candidate search is injected, so the
 * whole flow is unit-testable.
 */
import {
  normalizeProspectIdentifiers,
  type NormalizedProspectIdentifiers,
} from './normalization';
import {
  findDuplicates,
  hasBlockingDuplicate,
  type DuplicateCandidate,
  type DuplicateMatch,
} from './duplicate-detection';
import type { ProspectCreateInput, ProspectEditInput } from './prospect-schemas';

/** Raw identifier values, as typed into the form. */
export interface RawIdentifierInput {
  businessName?: string | undefined;
  phone?: string | undefined;
  whatsappNumber?: string | undefined;
  email?: string | undefined;
  instagramHandle?: string | undefined;
  website?: string | undefined;
}

/** The candidate search is given RAW values; Postgres normalizes them authoritatively. */
export type CandidateFinder = (raw: RawIdentifierInput) => Promise<DuplicateCandidate[]>;

function normalizedFrom(input: RawIdentifierInput): NormalizedProspectIdentifiers {
  return normalizeProspectIdentifiers({
    businessName: input.businessName ?? null,
    phone: input.phone ?? null,
    whatsappNumber: input.whatsappNumber ?? null,
    email: input.email ?? null,
    instagramHandle: input.instagramHandle ?? null,
    website: input.website ?? null,
  });
}

/** Assemble the jsonb payload for `crm.create_prospect(payload, override)` — raw fields only. */
export function buildCreatePayload(input: ProspectCreateInput): Record<string, unknown> {
  return {
    business_name: input.businessName,
    contact_name: input.contactName ?? null,
    phone: input.phone ?? null,
    whatsapp_number: input.whatsappNumber ?? null,
    email: input.email ?? null,
    instagram_handle: input.instagramHandle ?? null,
    website: input.website ?? null,
    business_category: input.businessCategory,
    location: input.location ?? null,
    source: input.source,
    notes: input.notes ?? null,
    next_follow_up_at: input.nextFollowUpAt ?? null,
    follow_up_note: input.followUpNote ?? null,
    assigned_salesperson_id: input.assignedSalespersonId ?? null,
  };
}

/** Column patch for an edit — raw fields only; normalized columns recompute themselves. */
export function buildEditPatch(input: ProspectEditInput): Record<string, unknown> {
  return {
    contact_name: input.contactName ?? null,
    phone: input.phone ?? null,
    whatsapp_number: input.whatsappNumber ?? null,
    email: input.email ?? null,
    instagram_handle: input.instagramHandle ?? null,
    website: input.website ?? null,
    location: input.location ?? null,
    notes: input.notes ?? null,
    next_follow_up_at: input.nextFollowUpAt ?? null,
    follow_up_note: input.followUpNote ?? null,
  };
}

export interface DuplicateEvaluation {
  identifiers: NormalizedProspectIdentifiers;
  matches: DuplicateMatch[];
  /** True when there is a strong match — the create is blocked pending admin override. */
  blocked: boolean;
}

/** Normalize the input (for ranking), search for candidates, rank them, decide if blocked. */
export async function evaluateDuplicates(
  input: RawIdentifierInput,
  findCandidates: CandidateFinder,
): Promise<DuplicateEvaluation> {
  const identifiers = normalizedFrom(input);
  const hasAnyIdentifier = Object.values(identifiers).some((v) => v !== null);
  if (!hasAnyIdentifier) {
    return { identifiers, matches: [], blocked: false };
  }
  const candidates = await findCandidates(input);
  const matches = findDuplicates(identifiers, candidates);
  return { identifiers, matches, blocked: hasBlockingDuplicate(matches) };
}
