/**
 * Prospect data access. All reads/writes are filtered by row-level security in
 * the `crm` schema — this layer never re-implements authorization, it just
 * shapes queries and surfaces errors.
 */
import { supabase } from '@/lib/supabase';
import type {
  ActivityWithUser,
  Payment,
  Prospect,
  ProspectStatusHistoryRow,
  ProspectWithOwner,
  Staff,
} from '@/types/domain';
import type { PipelineStatus } from '@/constants/pipeline';
import type { DuplicateCandidate } from './duplicate-detection';
import type { RawIdentifierInput } from './prospect-service';

const OWNER_SELECT = '*, assigned_salesperson:staff!prospects_assigned_salesperson_id_fkey(id, full_name)';

export interface ProspectFilters {
  search?: string;
  status?: PipelineStatus;
  salespersonId?: string;
  source?: string;
  category?: string;
}

export const prospectRepository = {
  async list(filters: ProspectFilters = {}): Promise<ProspectWithOwner[]> {
    let query = supabase.from('prospects').select(OWNER_SELECT).order('created_at', { ascending: false });

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
    return (data ?? []) as ProspectWithOwner[];
  },

  async get(id: string): Promise<ProspectWithOwner | null> {
    const { data, error } = await supabase.from('prospects').select(OWNER_SELECT).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ProspectWithOwner | null) ?? null;
  },

  async activities(prospectId: string): Promise<ActivityWithUser[]> {
    const { data, error } = await supabase
      .from('activities')
      .select('*, user:staff!activities_user_id_fkey(id, full_name)')
      .eq('prospect_id', prospectId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ActivityWithUser[];
  },

  async statusHistory(prospectId: string): Promise<ProspectStatusHistoryRow[]> {
    const { data, error } = await supabase
      .from('prospect_status_history')
      .select('*')
      .eq('prospect_id', prospectId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ProspectStatusHistoryRow[];
  },

  async payments(prospectId: string): Promise<Payment[]> {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('prospect_id', prospectId)
      .order('paid_on', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Payment[];
  },

  /**
   * Server-side duplicate-candidate search (SECURITY DEFINER RPC). Raw values go
   * in; Postgres normalizes them with the authoritative crm.normalize_* functions.
   */
  async findDuplicateCandidates(raw: RawIdentifierInput, excludeId?: string): Promise<DuplicateCandidate[]> {
    const { data, error } = await supabase.rpc('find_duplicate_prospect_candidates', {
      p_phone: raw.phone ?? null,
      p_whatsapp: raw.whatsappNumber ?? null,
      p_email: raw.email ?? null,
      p_instagram: raw.instagramHandle ?? null,
      p_website: raw.website ?? null,
      p_business_name: raw.businessName ?? null,
      p_exclude_id: excludeId ?? null,
    });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      businessName: row.business_name as string,
      status: row.status as string,
      assignedSalespersonName: (row.assigned_salesperson_name as string | null) ?? null,
      businessNameNormalized: (row.business_name_normalized as string | null) ?? null,
      phoneNormalized: (row.phone_normalized as string | null) ?? null,
      whatsappNormalized: (row.whatsapp_normalized as string | null) ?? null,
      emailNormalized: (row.email_normalized as string | null) ?? null,
      instagramNormalized: (row.instagram_normalized as string | null) ?? null,
      websiteNormalized: (row.website_normalized as string | null) ?? null,
    }));
  },

  async create(payload: Record<string, unknown>, override = false): Promise<Prospect> {
    const { data, error } = await supabase.rpc('create_prospect', {
      p_payload: payload,
      p_override: override,
    });
    if (error) throw new Error(error.message);
    return data as Prospect;
  },

  async update(id: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.from('prospects').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async changeStatus(id: string, to: PipelineStatus, reason?: string, lostReason?: string): Promise<void> {
    // lost_reason must be on the row before the status trigger runs.
    if (to === 'lost' && lostReason) {
      const { error: preErr } = await supabase.from('prospects').update({ lost_reason: lostReason }).eq('id', id);
      if (preErr) throw new Error(preErr.message);
    }
    const { error } = await supabase.rpc('change_prospect_status', {
      p_prospect_id: id,
      p_to: to,
      p_reason: reason ?? null,
    });
    if (error) throw new Error(error.message);
  },

  async assign(id: string, salespersonId: string | null, reason?: string): Promise<void> {
    const { error } = await supabase.rpc('assign_prospect', {
      p_prospect_id: id,
      p_salesperson_id: salespersonId,
      p_reason: reason ?? null,
    });
    if (error) throw new Error(error.message);
  },

  async logActivity(id: string, type: string, description?: string): Promise<void> {
    const { error } = await supabase.rpc('log_activity', {
      p_prospect_id: id,
      p_type: type,
      p_description: description ?? null,
    });
    if (error) throw new Error(error.message);
  },

  async addNote(id: string, note: string): Promise<void> {
    const { error } = await supabase.rpc('add_prospect_note', { p_prospect_id: id, p_note: note });
    if (error) throw new Error(error.message);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('prospects').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async listStaff(activeOnly = true): Promise<Staff[]> {
    let query = supabase.from('staff').select('*').order('full_name');
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as Staff[];
  },
};
