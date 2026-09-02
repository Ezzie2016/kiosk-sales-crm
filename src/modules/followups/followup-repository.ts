/**
 * Follow-up data access. RLS-scoped: an admin gets every prospect with a
 * `next_follow_up_at`, a salesperson gets their own.
 */
import { supabase } from '@/lib/supabase';
import type { FollowUpProspect } from './followup-buckets';
import type { PipelineStatus } from '@/constants/pipeline';

const SELECT =
  'id, business_name, status, next_follow_up_at, follow_up_note, assigned_salesperson:staff!prospects_assigned_salesperson_id_fkey(full_name)';

export const followUpRepository = {
  async list(): Promise<FollowUpProspect[]> {
    const { data, error } = await supabase
      .from('prospects')
      .select(SELECT)
      .not('next_follow_up_at', 'is', null)
      .order('next_follow_up_at', { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      businessName: row.business_name as string,
      status: row.status as PipelineStatus,
      nextFollowUpAt: (row.next_follow_up_at as string | null) ?? null,
      followUpNote: (row.follow_up_note as string | null) ?? null,
      ownerName:
        ((row.assigned_salesperson as { full_name?: string } | null)?.full_name as string | undefined) ?? null,
    }));
  },
};
