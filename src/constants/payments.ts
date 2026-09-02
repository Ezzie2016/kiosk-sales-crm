/**
 * Payment / revenue constants (spec §10). V1 is manual entry by Admin; the shape
 * here is deliberately close to what an automated Kiosk payment event would
 * carry so the integration later is a writer swap, not a schema change.
 */

/** Initial currency. Stored per-payment so multi-currency is a data change, not a migration. */
export const DEFAULT_CURRENCY = 'NGN' as const;

export const SUPPORTED_CURRENCIES = ['NGN'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const PAYMENT_STATUSES = ['pending', 'confirmed', 'refunded', 'failed'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  refunded: 'Refunded',
  failed: 'Failed',
};

/** Only these count toward revenue totals (spec §9 — "do not count the same event multiple times"). */
export const REVENUE_COUNTING_STATUSES = ['confirmed'] as const satisfies readonly PaymentStatus[];

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === 'string' && (PAYMENT_STATUSES as readonly string[]).includes(value);
}

export function isRevenueCounting(status: PaymentStatus): boolean {
  return (REVENUE_COUNTING_STATUSES as readonly PaymentStatus[]).includes(status);
}
