import { z } from 'zod';
import { PAYMENT_STATUSES } from '@/constants/payments';

/** Admin records a payment against a prospect (spec §10). */
export const paymentCreateSchema = z.object({
  plan: z.string().trim().min(1, 'Plan is required'),
  /** Naira as typed; converted to kobo at the repository boundary. */
  amountNaira: z
    .string()
    .trim()
    .min(1, 'Amount is required'),
  paidOn: z.string().trim().min(1, 'Payment date is required'),
  status: z.enum(PAYMENT_STATUSES).default('pending'),
  /** Stable-id attribution snapshot; defaults to the prospect's current owner. */
  attributedSalespersonId: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional(),
  externalReference: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional(),
});

export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;

export const paymentStatusChangeSchema = z.object({
  status: z.enum(PAYMENT_STATUSES),
});
