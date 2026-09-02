/**
 * Analytics data access.
 *
 * - Funnel: read `prospects` + `prospect_status_history` under RLS, so an admin
 *   gets the whole-team funnel and a salesperson gets their own.
 * - Leaderboard: the `crm.leaderboard()` SECURITY DEFINER RPC returns only the
 *   ranked aggregate (name / paid / revenue / assigned) — no prospect rows.
 */
import { supabase } from '@/lib/supabase';
import type { PipelineStatus } from '@/constants/pipeline';
import type { ProspectFunnelInput } from './funnel-metrics';
import type { LeaderboardRow } from './leaderboard';

export const analyticsRepository = {
  async getFunnelData(): Promise<ProspectFunnelInput[]> {
    const [prospectsRes, historyRes] = await Promise.all([
      supabase.from('prospects').select('id, status'),
      supabase.from('prospect_status_history').select('prospect_id, to_status'),
    ]);
    if (prospectsRes.error) throw new Error(prospectsRes.error.message);
    if (historyRes.error) throw new Error(historyRes.error.message);

    const historyByProspect = new Map<string, PipelineStatus[]>();
    for (const row of (historyRes.data ?? []) as Array<{ prospect_id: string; to_status: PipelineStatus }>) {
      const list = historyByProspect.get(row.prospect_id) ?? [];
      list.push(row.to_status);
      historyByProspect.set(row.prospect_id, list);
    }

    return ((prospectsRes.data ?? []) as Array<{ id: string; status: PipelineStatus }>).map((p) => ({
      status: p.status,
      statusHistory: historyByProspect.get(p.id) ?? [],
    }));
  },

  async getLeaderboard(): Promise<LeaderboardRow[]> {
    const { data, error } = await supabase.rpc('leaderboard');
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      salespersonId: row.salesperson_id as string,
      fullName: row.full_name as string,
      isActive: Boolean(row.is_active),
      assignedCount: Number(row.assigned_count ?? 0),
      paidCount: Number(row.paid_count ?? 0),
      confirmedRevenueKobo: Number(row.confirmed_revenue_kobo ?? 0),
    }));
  },
};
