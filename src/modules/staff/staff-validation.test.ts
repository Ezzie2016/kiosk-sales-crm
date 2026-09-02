import { describe, expect, it } from 'vitest';
import { suggestPassword, validateNewSalesperson } from './staff-validation';

describe('validateNewSalesperson', () => {
  it('accepts a well-formed entry (no errors)', () => {
    expect(validateNewSalesperson({ email: 'rep@example.com', fullName: 'Ada Rep', password: 'kiosk-lagos-1234' })).toEqual(
      {},
    );
  });

  it('rejects a bad email', () => {
    expect(validateNewSalesperson({ email: 'not-an-email', fullName: 'Ada Rep', password: 'longenough' }).email).toBeTruthy();
    expect(validateNewSalesperson({ email: '', fullName: 'Ada Rep', password: 'longenough' }).email).toBeTruthy();
  });

  it('requires a full name of at least 2 chars', () => {
    expect(validateNewSalesperson({ email: 'a@b.co', fullName: 'A', password: 'longenough' }).fullName).toBeTruthy();
  });

  it('requires an 8+ char password', () => {
    expect(validateNewSalesperson({ email: 'a@b.co', fullName: 'Ada Rep', password: 'short' }).password).toBeTruthy();
    expect(validateNewSalesperson({ email: 'a@b.co', fullName: 'Ada Rep', password: '12345678' }).password).toBeUndefined();
  });
});

describe('suggestPassword', () => {
  it('produces a word-word-#### string that passes validation', () => {
    for (let i = 0; i < 20; i++) {
      const pw = suggestPassword();
      expect(pw).toMatch(/^[a-z]+-[a-z]+-\d{4}$/);
      expect(validateNewSalesperson({ email: 'a@b.co', fullName: 'Ada Rep', password: pw }).password).toBeUndefined();
    }
  });
});
