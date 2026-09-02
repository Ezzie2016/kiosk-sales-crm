import { describe, expect, it } from 'vitest';
import { auditActionLabel, summarizeChange } from './audit-format';

describe('auditActionLabel', () => {
  it('maps known slugs to labels and passes through unknown ones', () => {
    expect(auditActionLabel('prospect.status_changed')).toBe('Status changed');
    expect(auditActionLabel('payment.created')).toBe('Payment recorded');
    expect(auditActionLabel('something.else')).toBe('something.else');
  });
});

describe('summarizeChange', () => {
  it('renders "field: old → new" for changed keys and "field: value" for unchanged', () => {
    expect(
      summarizeChange(
        { status: 'contacted', reason: null },
        { status: 'demo', reason: 'booked' },
      ),
    ).toBe('status: contacted → demo\nreason: — → booked');
  });

  it('covers keys present in only one side', () => {
    expect(summarizeChange({ a: 1 }, { a: 1, b: 2 })).toBe('a: 1\nb: — → 2');
  });

  it('shows an em dash for null / empty-string values', () => {
    expect(summarizeChange({ assigned_salesperson_id: null }, { assigned_salesperson_id: 'rep-1' })).toBe(
      'assigned_salesperson_id: — → rep-1',
    );
  });

  it('handles a create (only new_value) as a compact field list', () => {
    expect(summarizeChange(null, { matched_prospect_id: 'p9' })).toBe('matched_prospect_id: — → p9');
  });

  it('falls back to was/now for non-object values', () => {
    expect(summarizeChange('old', 'new')).toBe('was old, now new');
    expect(summarizeChange(null, null)).toBe('');
  });
});
