import { supabase } from '@/lib/supabase';
import type { PipelineStatus } from '@/constants/pipeline';
import type { PaymentStatus } from '@/constants/payments';

/**
 * Dashboard reads. Everything here is automatically scoped by RLS: an admin sees
 * all rows, a salesperson sees only their assigned prospects and the activity /
 * payments hanging off them. The numbers a salesperson sees are therefore "their"
 * numbers with no extra filtering needed.
 */
export interface DashboardData {
  statuses: PipelineStatus[];
  prospectSnapshots: { createdAt: string; trialStartedAt: string | null; paidAt: string | null }[];
  recentActivities: { type: string; prospectId: string; createdAt: string }[];
  payments: { status: PaymentStatus; amountKobo: number }[];
}

export const dashboardRepository = {
  async load(sinceIso: string): Promise<DashboardData> {
    const [prospectsRes, activitiesRes, paymentsRes] = await Promise.all([
      supabase.from('prospects').select('status, created_at, trial_started_at, paid_at'),
      supabase
        .from('activities')
        .select('activity_type, prospect_id, created_at')
        .gte('created_at', sinceIso),
      supabase.from('payments').select('status, amount_kobo'),
    ]);

    if (prospectsRes.error) throw new Error(prospectsRes.error.message);
    if (activitiesRes.error) throw new Error(activitiesRes.error.message);
    if (paymentsRes.error) throw new Error(paymentsRes.error.message);

    const prospectRows = (prospectsRes.data ?? []) as Array<{
      status: PipelineStatus;
      created_at: string;
      trial_started_at: string | null;
      paid_at: string | null;
    }>;

    return {
      statuses: prospectRows.map((r) => r.status),
      prospectSnapshots: prospectRows.map((r) => ({
        createdAt: r.created_at,
        trialStartedAt: r.trial_started_at,
        paidAt: r.paid_at,
      })),
      recentActivities: ((activitiesRes.data ?? []) as Array<{ activity_type: string; prospect_id: string; created_at: string }>).map(
        (r) => ({ type: r.activity_type, prospectId: r.prospect_id, createdAt: r.created_at }),
      ),
      payments: ((paymentsRes.data ?? []) as Array<{ status: PaymentStatus; amount_kobo: number }>).map((r) => ({
        status: r.status,
        amountKobo: r.amount_kobo,
      })),
    };
  },
};
