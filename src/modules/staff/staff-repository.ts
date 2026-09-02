/**
 * Staff management data access (spec §15). Admin only.
 *
 * - overview(): `crm.staff_overview()` RPC (SECURITY DEFINER, is_admin guard) —
 *   every staff row + assigned / active / paying / revenue counts.
 * - setActive(): a plain UPDATE on crm.staff, allowed by the `staff_update`
 *   policy; triggers stamp `deactivated_at` and write the audit row.
 * - createSalesperson(): the `crm-admin` edge function (service role, re-checks
 *   the caller is an admin) — the browser can't create an auth user.
 */
import { supabase } from '@/lib/supabase';
import type { StaffRole } from '@/constants/roles';

export interface StaffOverviewRow {
  id: string;
  fullName: string;
  email: string;
  role: StaffRole;
  isActive: boolean;
  deactivatedAt: string | null;
  assignedCount: number;
  activeProspectCount: number;
  paidCount: number;
  confirmedRevenueKobo: number;
}

export const staffRepository = {
  async overview(): Promise<StaffOverviewRow[]> {
    const { data, error } = await supabase.rpc('staff_overview');
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      fullName: r.full_name as string,
      email: r.email as string,
      role: r.role as StaffRole,
      isActive: Boolean(r.is_active),
      deactivatedAt: (r.deactivated_at as string | null) ?? null,
      assignedCount: Number(r.assigned_count ?? 0),
      activeProspectCount: Number(r.active_prospect_count ?? 0),
      paidCount: Number(r.paid_count ?? 0),
      confirmedRevenueKobo: Number(r.confirmed_revenue_kobo ?? 0),
    }));
  },

  async setActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase.from('staff').update({ is_active: isActive }).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async createSalesperson(input: { email: string; fullName: string; password: string }): Promise<StaffOverviewRow> {
    const { data, error } = await supabase.functions.invoke('crm-admin', {
      body: { action: 'create_salesperson', email: input.email, full_name: input.fullName, password: input.password },
    });
    if (error) {
      // A non-2xx response comes back as an error; the JSON body is on `context`.
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json().catch(() => null);
        if (body && typeof body.error === 'string') throw new Error(body.error);
      }
      throw new Error(error.message);
    }
    if (data?.error) throw new Error(String(data.error));
    const s = data.staff as Record<string, unknown>;
    return {
      id: s.id as string,
      fullName: s.full_name as string,
      email: s.email as string,
      role: s.role as StaffRole,
      isActive: Boolean(s.is_active),
      deactivatedAt: null,
      assignedCount: 0,
      activeProspectCount: 0,
      paidCount: 0,
      confirmedRevenueKobo: 0,
    };
  },
};
