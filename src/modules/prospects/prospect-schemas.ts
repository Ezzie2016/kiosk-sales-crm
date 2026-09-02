import { z } from 'zod';
import { PROSPECT_SOURCES } from '@/constants/sources';
import { BUSINESS_CATEGORIES } from '@/constants/categories';
import { PIPELINE_STATUSES } from '@/constants/pipeline';

const optionalTrimmed = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? undefined : v))
  .optional();

/**
 * Prospect creation input (spec §14). Required: business name, source, category,
 * and at least one contact method. Validated here before anything is normalized
 * or sent to the server; the server re-checks with its own constraints + RLS.
 */
export const prospectCreateSchema = z
  .object({
    businessName: z.string().trim().min(1, 'Business name is required'),
    contactName: optionalTrimmed,
    phone: optionalTrimmed,
    whatsappNumber: optionalTrimmed,
    email: optionalTrimmed.pipe(z.string().email('Not a valid email').optional()),
    instagramHandle: optionalTrimmed,
    website: optionalTrimmed,
    businessCategory: z.enum(BUSINESS_CATEGORIES),
    source: z.enum(PROSPECT_SOURCES),
    location: optionalTrimmed,
    notes: optionalTrimmed,
    followUpNote: optionalTrimmed,
    nextFollowUpAt: optionalTrimmed,
    assignedSalespersonId: optionalTrimmed,
  })
  .refine(
    (v) => Boolean(v.phone || v.whatsappNumber || v.email || v.instagramHandle || v.website),
    { message: 'Enter at least one contact method', path: ['phone'] },
  );

export type ProspectCreateInput = z.infer<typeof prospectCreateSchema>;

export const prospectEditSchema = z.object({
  contactName: optionalTrimmed,
  phone: optionalTrimmed,
  whatsappNumber: optionalTrimmed,
  email: optionalTrimmed.pipe(z.string().email('Not a valid email').optional()),
  instagramHandle: optionalTrimmed,
  website: optionalTrimmed,
  location: optionalTrimmed,
  notes: optionalTrimmed,
  nextFollowUpAt: optionalTrimmed,
  followUpNote: optionalTrimmed,
});

export type ProspectEditInput = z.infer<typeof prospectEditSchema>;

export const statusChangeSchema = z.object({
  to: z.enum(PIPELINE_STATUSES),
  reason: optionalTrimmed,
  lostReason: optionalTrimmed,
});
