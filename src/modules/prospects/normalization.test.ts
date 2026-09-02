import { describe, expect, it } from 'vitest';
import {
  normalizeBusinessName,
  normalizeEmail,
  normalizeInstagramHandle,
  normalizePhone,
  normalizeProspectIdentifiers,
  normalizeWebsite,
} from './normalization';

describe('normalizeInstagramHandle', () => {
  it('strips a leading @ and lowercases', () => {
    expect(normalizeInstagramHandle('@ExampleStore')).toBe('examplestore');
  });

  it('unwraps a full profile URL with query string', () => {
    expect(normalizeInstagramHandle('https://www.instagram.com/ExampleStore/?hl=en')).toBe('examplestore');
  });

  it('handles a bare domain form', () => {
    expect(normalizeInstagramHandle('instagram.com/example.store')).toBe('example.store');
  });

  it('treats different casings of the same handle as equal', () => {
    expect(normalizeInstagramHandle('@AmakaStores')).toBe(normalizeInstagramHandle('amakastores'));
  });

  it('returns null for blank/empty input', () => {
    expect(normalizeInstagramHandle('   ')).toBeNull();
    expect(normalizeInstagramHandle(null)).toBeNull();
    expect(normalizeInstagramHandle(undefined)).toBeNull();
    expect(normalizeInstagramHandle('@')).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('converts local 0-prefixed format to +234', () => {
    expect(normalizePhone('0803 123 4567')).toBe('+2348031234567');
  });

  it('converts 234-prefixed digits (no plus) to +234', () => {
    expect(normalizePhone('234 803 123 4567')).toBe('+2348031234567');
  });

  it('keeps an already-normalized +234 number', () => {
    expect(normalizePhone('+2348031234567')).toBe('+2348031234567');
  });

  it('expands a bare 10-digit subscriber number to +234', () => {
    expect(normalizePhone('8031234567')).toBe('+2348031234567');
  });

  it('collapses formatting differences to one canonical value', () => {
    const forms = ['0803-123-4567', '0803 123 4567', '+234 803 123 4567', '234-803-123-4567', '8031234567'];
    const normalized = new Set(forms.map((f) => normalizePhone(f)));
    expect(normalized.size).toBe(1);
    expect([...normalized][0]).toBe('+2348031234567');
  });

  it('preserves a non-Nigerian international number as +digits', () => {
    expect(normalizePhone('+1 (415) 555 0100')).toBe('+14155550100');
  });

  it('returns null when there are no digits', () => {
    expect(normalizePhone('n/a')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Owner@Example.COM ')).toBe('owner@example.com');
  });

  it('does not strip plus tags', () => {
    expect(normalizeEmail('owner+kiosk@example.com')).toBe('owner+kiosk@example.com');
  });

  it('returns null for blank', () => {
    expect(normalizeEmail('  ')).toBeNull();
  });
});

describe('normalizeWebsite', () => {
  it('reduces to a bare hostname', () => {
    expect(normalizeWebsite('https://www.ExampleStore.com/shop?ref=ig')).toBe('examplestore.com');
  });

  it('treats protocol/www variants as equal', () => {
    expect(normalizeWebsite('http://examplestore.com')).toBe(normalizeWebsite('https://www.examplestore.com/'));
  });

  it('returns null for blank', () => {
    expect(normalizeWebsite('')).toBeNull();
  });
});

describe('normalizeBusinessName', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeBusinessName("  Amaka's   Stores!!  ")).toBe('amakas stores');
  });

  it('drops generic company words so "Example Stores Ltd" matches "example stores"', () => {
    expect(normalizeBusinessName('Example Stores Ltd')).toBe(normalizeBusinessName('example stores'));
  });

  it('normalizes an ampersand to "and" and then removes it as generic', () => {
    expect(normalizeBusinessName('Bola & Sons')).toBe('bola sons');
  });

  it('falls back to the unfiltered form when every word is generic', () => {
    expect(normalizeBusinessName('The Ltd')).toBe('the ltd');
  });

  it('returns null for blank/punctuation-only input', () => {
    expect(normalizeBusinessName('  ')).toBeNull();
    expect(normalizeBusinessName('!!!')).toBeNull();
  });
});

describe('normalizeProspectIdentifiers', () => {
  it('normalizes every field and nulls the empty ones', () => {
    expect(
      normalizeProspectIdentifiers({
        businessName: 'Example Stores Ltd',
        phone: '0803 123 4567',
        whatsappNumber: '',
        email: 'Owner@Example.com',
        instagramHandle: '@ExampleStore',
        website: null,
      }),
    ).toEqual({
      businessNameNormalized: 'example stores',
      phoneNormalized: '+2348031234567',
      whatsappNormalized: null,
      emailNormalized: 'owner@example.com',
      instagramNormalized: 'examplestore',
      websiteNormalized: null,
    });
  });
});
