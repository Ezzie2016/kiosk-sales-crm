/**
 * Export data access. RLS-scoped — the caller only ever gets prospects they may
 * see (spec §21: "Do not expose information the current user is not authorized
 * to see"). Honours the same filters as the prospect list.
 */
import { supabase } from '@/lib/supabase';
import type { ProspectFilters } from '@/modules/prospects/prospect-repository';
import type { ExportPayment, ExportProspect } from './prospect-csv';
import type { PipelineStatus } from '@/constants/pipeline';
import type { PaymentStatus } from '@/constants/payments';
import type { BusinessCategory } from '@/constants/categories';
import type { ProspectSource } from '@/constants/sources';

const SELECT =
  'id, business_name, contact_name, phone, instagram_handle, whatsapp_number, business_category, location, source, status, created_at, last_contacted_at, next_follow_up_at, trial_started_at, assigned_salesperson:staff!prospects_assigned_salesperson_id_fkey(full_name)';

export const exportRepository = {
  async fetch(filters: ProspectFilters = {}): Promise<{ prospects: ExportProspect[]; payments: ExportPayment[] }> {
    let query = supabase.from('prospects').select(SELECT).order('created_at', { ascending: false });
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.salespersonId) query = query.eq('assigned_salesperson_id', filters.salespersonId);
    if (filters.source) query = query.eq('source', filters.source);
    if (filters.category) query = query.eq('business_category', filters.category);
    if (filters.search && filters.search.trim().length > 0) {
      const term = `%${filters.search.trim()}%`;
      query = query.or(
        [
          `business_name.ilike.${term}`,
          `contact_name.ilike.${term}`,
          `phone.ilike.${term}`,
          `whatsapp_number.ilike.${term}`,
          `email.ilike.${term}`,
          `instagram_handle.ilike.${term}`,
        ].join(','),
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const prospects: ExportProspect[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      businessName: row.business_name as string,
      contactName: (row.contact_name as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      instagramHandle: (row.instagram_handle as string | null) ?? null,
      whatsappNumber: (row.whatsapp_number as string | null) ?? null,
      businessCategory: row.business_category as BusinessCategory,
      location: (row.location as string | null) ?? null,
      source: row.source as ProspectSource,
      ownerName: ((row.assigned_salesperson as { full_name?: string } | null)?.full_name as string | undefined) ?? null,
      status: row.status as PipelineStatus,
      createdAt: row.created_at as string,
      lastContactedAt: (row.last_contacted_at as string | null) ?? null,
      nextFollowUpAt: (row.next_follow_up_at as string | null) ?? null,
      trialStartedAt: (row.trial_started_at as string | null) ?? null,
    }));

    if (prospects.length === 0) return { prospects, payments: [] };

    const { data: payData, error: payError } = await supabase
      .from('payments')
      .select('prospect_id, status, amount_kobo')
      .in('prospect_id', prospects.map((p) => p.id));
    if (payError) throw new Error(payError.message);

    const payments: ExportPayment[] = ((payData ?? []) as Array<Record<string, unknown>>).map((row) => ({
      prospectId: row.prospect_id as string,
      status: row.status as PaymentStatus,
      amountKobo: Number(row.amount_kobo ?? 0),
    }));

    return { prospects, payments };
  },
};
