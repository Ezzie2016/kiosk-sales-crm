/**
 * Prospect acquisition sources (spec §3).
 *
 * Unlike role/status, this list is expected to GROW over time. It is stored as a
 * `text` column with a CHECK constraint that references exactly this list, and
 * the canonical copy lives here. Promoting it to a `crm.sources` reference table
 * (for runtime-editable values without a deploy) is a documented follow-up — see
 * ARCHITECTURE.md, "Configurable enums".
 */
export const PROSPECT_SOURCES = [
  'instagram',
  'whatsapp',
  'tiktok',
  'facebook',
  'website',
  'referral',
  'physical_outreach',
  'market_association',
  'distributor',
  'other',
] as const;

export type ProspectSource = (typeof PROSPECT_SOURCES)[number];

export const PROSPECT_SOURCE_LABEL: Record<ProspectSource, string> = {
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  website: 'Website',
  referral: 'Referral',
  physical_outreach: 'Physical outreach',
  market_association: 'Market association',
  distributor: 'Distributor',
  other: 'Other',
};

export function isProspectSource(value: unknown): value is ProspectSource {
  return typeof value === 'string' && (PROSPECT_SOURCES as readonly string[]).includes(value);
}
