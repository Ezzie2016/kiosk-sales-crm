import { describe, expect, it } from 'vitest';
import { buildPaymentRow } from './payment-service';
import { paymentCreateSchema } from './payment-schemas';

const parse = (o: Record<string, unknown>) => paymentCreateSchema.parse(o);

describe('buildPaymentRow', () => {
  it('converts naira to integer kobo and fills the crm.payments row', () => {
    const input = parse({ plan: 'Growth', amountNaira: '1,500.50', paidOn: '2026-02-01', status: 'confirmed' });
    const { row } = buildPaymentRow(input, 'prospect-1', 'admin-1', 'rep-a');
    expect(row).toEqual({
      prospect_id: 'prospect-1',
      attributed_salesperson_id: 'rep-a',
      plan: 'Growth',
      amount_kobo: 150050,
      currency: 'NGN',
      status: 'confirmed',
      paid_on: '2026-02-01',
      external_reference: null,
      recorded_by: 'admin-1',
    });
  });

  it('defaults status to pending and attribution to the prospect owner', () => {
    const input = parse({ plan: 'Starter', amountNaira: '5000', paidOn: '2026-03-03' });
    const { row } = buildPaymentRow(input, 'p', 'admin', 'owner-x');
    expect(row.status).toBe('pending');
    expect(row.attributed_salesperson_id).toBe('owner-x');
  });

  it('lets an explicit attribution override the prospect owner', () => {
    const input = parse({ plan: 'Pro', amountNaira: '35000', paidOn: '2026-03-03', attributedSalespersonId: 'rep-b' });
    const { row } = buildPaymentRow(input, 'p', 'admin', 'owner-x');
    expect(row.attributed_salesperson_id).toBe('rep-b');
  });

  it('keeps attribution null when the prospect is unassigned and none is given', () => {
    const input = parse({ plan: 'Starter', amountNaira: '5000', paidOn: '2026-03-03' });
    const { row } = buildPaymentRow(input, 'p', 'admin', null);
    expect(row.attributed_salesperson_id).toBeNull();
  });

  it('carries an external reference through when provided', () => {
    const input = parse({ plan: 'Pro', amountNaira: '35000', paidOn: '2026-03-03', externalReference: 'psk_abc123' });
    expect(buildPaymentRow(input, 'p', 'admin', null).row.external_reference).toBe('psk_abc123');
  });

  it('throws on an unparseable amount', () => {
    const input = parse({ plan: 'X', amountNaira: 'not-money', paidOn: '2026-03-03' });
    expect(() => buildPaymentRow(input, 'p', 'admin', null)).toThrow(/valid amount/);
  });
});
