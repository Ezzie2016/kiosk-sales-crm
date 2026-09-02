import { describe, expect, it } from 'vitest';
import { findDuplicates, hasBlockingDuplicate, type DuplicateCandidate } from './duplicate-detection';
import { normalizeProspectIdentifiers } from './normalization';

function candidate(overrides: Partial<DuplicateCandidate>): DuplicateCandidate {
  return {
    id: 'p1',
    businessName: 'Example Store',
    status: 'contacted',
    assignedSalespersonName: 'Amaka',
    businessNameNormalized: null,
    phoneNormalized: null,
    whatsappNormalized: null,
    emailNormalized: null,
    instagramNormalized: null,
    websiteNormalized: null,
    ...overrides,
  };
}

describe('findDuplicates', () => {
  it('detects two prospects with the same normalized Instagram handle (spec §23)', () => {
    const identifiers = normalizeProspectIdentifiers({ instagramHandle: '@ExampleStore' });
    const matches = findDuplicates(identifiers, [
      candidate({ instagramNormalized: 'examplestore', assignedSalespersonName: 'Amaka' }),
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.strength).toBe('strong');
    expect(matches[0]?.matchedOn).toEqual(['instagram']);
    expect(matches[0]?.message).toBe(
      'A prospect with @examplestore already exists and is assigned to Amaka.',
    );
  });

  it('matches a phone number entered in the other prospect\'s WhatsApp slot', () => {
    const identifiers = normalizeProspectIdentifiers({ phone: '0803 123 4567' });
    const matches = findDuplicates(identifiers, [
      candidate({ whatsappNormalized: '+2348031234567' }),
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.matchedOn).toEqual(['phone']);
    expect(matches[0]?.strength).toBe('strong');
  });

  it('grades a business-name-only collision as moderate, not blocking', () => {
    const identifiers = normalizeProspectIdentifiers({ businessName: 'Mama Put Kitchen' });
    const matches = findDuplicates(identifiers, [
      candidate({ businessNameNormalized: 'mama put kitchen', assignedSalespersonName: null }),
    ]);

    expect(matches[0]?.strength).toBe('moderate');
    expect(matches[0]?.message).toContain('unassigned');
    expect(hasBlockingDuplicate(matches)).toBe(false);
  });

  it('blocks when any strong match is present even alongside moderate ones', () => {
    const identifiers = normalizeProspectIdentifiers({
      businessName: 'Example Store',
      email: 'owner@example.com',
    });
    const matches = findDuplicates(identifiers, [
      candidate({ businessNameNormalized: 'example store', id: 'a' }),
      candidate({ emailNormalized: 'owner@example.com', id: 'b' }),
    ]);

    expect(hasBlockingDuplicate(matches)).toBe(true);
    // Strong match ranked first.
    expect(matches[0]?.id).toBe('b');
    expect(matches[0]?.strength).toBe('strong');
  });

  it('drops candidates that share no normalized identifier (DB search over-returns)', () => {
    const identifiers = normalizeProspectIdentifiers({ instagramHandle: '@newhandle' });
    const matches = findDuplicates(identifiers, [
      candidate({ instagramNormalized: 'someoneelse', emailNormalized: 'x@y.com' }),
    ]);
    expect(matches).toHaveLength(0);
  });

  it('returns nothing when the new prospect has no identifiers to compare', () => {
    const identifiers = normalizeProspectIdentifiers({});
    const matches = findDuplicates(identifiers, [candidate({ instagramNormalized: 'anything' })]);
    expect(matches).toHaveLength(0);
  });

  it('ranks a multi-identifier match above a single-identifier match of the same strength', () => {
    const identifiers = normalizeProspectIdentifiers({
      phone: '08031234567',
      email: 'owner@example.com',
    });
    const matches = findDuplicates(identifiers, [
      candidate({ id: 'single', emailNormalized: 'owner@example.com' }),
      candidate({ id: 'double', phoneNormalized: '+2348031234567', emailNormalized: 'owner@example.com' }),
    ]);
    expect(matches[0]?.id).toBe('double');
  });
});
