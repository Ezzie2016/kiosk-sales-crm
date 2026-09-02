/**
 * Payment orchestration (spec §10). Turns validated form input into the row
 * `crm.payments` expects. Money is converted to integer kobo here, at the
 * boundary. No Supabase dependency — unit-testable.
 *
 * Recording a payment does NOT change the pipeline status: payment tracking and
 * the funnel stage are deliberately separate (spec §2 vs §10). The UI says so.
 */
import { DEFAULT_CURRENCY } from '@/constants/payments';
import { parseNairaInput } from './payment-money';
import type { PaymentCreateInput } from './payment-schemas';

export interface BuildPaymentResult {
  row: Record<string, unknown>;
}

/**
 * @param input       validated form input
 * @param prospectId  the prospect this payment is attributed to
 * @param recordedBy   the admin recording it (auth.uid())
 * @param defaultAttribution  the prospect's current assigned salesperson (fallback)
 */
export function buildPaymentRow(
  input: PaymentCreateInput,
  prospectId: string,
  recordedBy: string,
  defaultAttribution: string | null,
): BuildPaymentResult {
  const amountKobo = parseNairaInput(input.amountNaira);
  if (amountKobo === null) {
    throw new Error('Enter a valid amount in naira');
  }
  return {
    row: {
      prospect_id: prospectId,
      attributed_salesperson_id: input.attributedSalespersonId ?? defaultAttribution ?? null,
      plan: input.plan,
      amount_kobo: amountKobo,
      currency: DEFAULT_CURRENCY,
      status: input.status,
      paid_on: input.paidOn,
      external_reference: input.externalReference ?? null,
      recorded_by: recordedBy,
    },
  };
}
