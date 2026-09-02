import { describe, expect, it } from 'vitest';
import { buildCreatePayload, buildEditPatch, evaluateDuplicates } from './prospect-service';
import type { DuplicateCandidate } from './duplicate-detection';
import { prospectCreateSchema } from './prospect-schemas';

const baseInput = prospectCreateSchema.parse({
  businessName: "Amaka's Stores Ltd",
  phone: '0803 123 4567',
  instagramHandle: '@AmakaStores',
  businessCategory: 'provision_store',
  source: 'instagram',
});

describe('buildCreatePayload', () => {
  it('carries raw fields only — normalized columns are GENERATED in Postgres', () => {
    const payload = buildCreatePayload(baseInput);
    expect(payload.business_name).toBe("Amaka's Stores Ltd");
    expect(payload.phone).toBe('0803 123 4567');
    expect(payload.instagram_handle).toBe('@AmakaStores');
    expect(payload.business_category).toBe('provision_store');
    // No client-supplied normalized values.
    expect(Object.keys(payload).some((k) => k.endsWith('_normalized'))).toBe(false);
  });
});

describe('buildEditPatch', () => {
  it('carries raw identifier fields only', () => {
    const patch = buildEditPatch({ phone: '234 803 123 4567', email: 'X@Y.com' });
    expect(patch.phone).toBe('234 803 123 4567');
    expect(patch.email).toBe('X@Y.com');
    expect(Object.keys(patch).some((k) => k.endsWith('_normalized'))).toBe(false);
  });
});

describe('evaluateDuplicates', () => {
  const candidate = (o: Partial<DuplicateCandidate>): DuplicateCandidate => ({
    id: 'existing-1',
    businessName: 'Amaka Provisions',
    status: 'contacted',
    assignedSalespersonName: 'Amaka',
    businessNameNormalized: null,
    phoneNormalized: null,
    whatsappNormalized: null,
    emailNormalized: null,
    instagramNormalized: null,
    websiteNormalized: null,
    ...o,
  });

  it('blocks when the normalized instagram handle matches an existing prospect', async () => {
    const result = await evaluateDuplicates(baseInput, async () => [
      candidate({ instagramNormalized: 'amakastores' }),
    ]);
    expect(result.blocked).toBe(true);
    expect(result.matches[0]?.message).toBe(
      'A prospect with @amakastores already exists and is assigned to Amaka.',
    );
  });

  it('passes the RAW identifier values to the candidate finder (Postgres normalizes them)', async () => {
    let received: unknown;
    await evaluateDuplicates(baseInput, async (raw) => {
      received = raw;
      return [];
    });
    expect(received).toMatchObject({
      phone: '0803 123 4567',
      instagramHandle: '@AmakaStores',
    });
  });

  it('does not block on a business-name-only collision', async () => {
    const nameOnly = prospectCreateSchema.parse({
      businessName: 'Corner Shop',
      email: 'unique@example.com',
      businessCategory: 'other',
      source: 'referral',
    });
    const result = await evaluateDuplicates(nameOnly, async () => [
      candidate({ businessNameNormalized: 'corner shop', emailNormalized: null }),
    ]);
    expect(result.blocked).toBe(false);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.strength).toBe('moderate');
  });

  it('short-circuits (no search) when every identifier normalizes to nothing', async () => {
    let called = false;
    const empty = { businessName: '   ' };
    const result = await evaluateDuplicates(empty, async () => {
      called = true;
      return [];
    });
    expect(called).toBe(false);
    expect(result.matches).toHaveLength(0);
  });
});
