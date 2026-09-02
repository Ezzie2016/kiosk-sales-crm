import { describe, expect, it } from 'vitest';
import { koboToNaira, nairaToKobo, parseNairaInput } from './payment-money';

describe('nairaToKobo', () => {
  it('converts whole and fractional naira to integer kobo', () => {
    expect(nairaToKobo(1500)).toBe(150000);
    expect(nairaToKobo(1500.5)).toBe(150050);
    expect(nairaToKobo(0)).toBe(0);
  });

  it('rounds half-up to the nearest kobo (no silent truncation)', () => {
    expect(nairaToKobo(1500.005)).toBe(150001);
    expect(nairaToKobo(0.001)).toBe(0);
  });

  it('rejects negative and non-finite amounts', () => {
    expect(() => nairaToKobo(-1)).toThrow(/negative/);
    expect(() => nairaToKobo(Number.NaN)).toThrow(/number/);
    expect(() => nairaToKobo(Infinity)).toThrow(/number/);
  });
});

describe('koboToNaira', () => {
  it('is the inverse of nairaToKobo for representable amounts', () => {
    for (const naira of [0, 1, 1500, 3500.25, 999999.99]) {
      expect(koboToNaira(nairaToKobo(naira))).toBe(naira);
    }
  });
});

describe('parseNairaInput', () => {
  it('strips currency symbol, commas and spaces', () => {
    expect(parseNairaInput('₦1,500.50')).toBe(150050);
    expect(parseNairaInput(' 3 500 ')).toBe(350000);
  });

  it('returns null for empty or unparseable input', () => {
    expect(parseNairaInput('')).toBeNull();
    expect(parseNairaInput('   ')).toBeNull();
    expect(parseNairaInput('abc')).toBeNull();
    expect(parseNairaInput('-5')).toBeNull();
  });
});
