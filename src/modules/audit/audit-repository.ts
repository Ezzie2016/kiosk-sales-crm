/**
 * Audit-log data access (spec §16). Admin-only — `crm.audit_log`'s
 * `audit_log_select` policy is `is_admin()`, and there is no write policy.
 */
import { supabase } from '@/lib/supabase';

export interface AuditEntry {
  id: string;
  createdAt: string;
  actorName: string | null;
  action: string;
  targetTable: string;
  targetId: string | null;
  oldValue: unknown;
  newValue: unknown;
}

export interface AuditFilters {
  action?: string;
  targetId?: string;
  limit?: number;
}

export const auditRepository = {
  async list(filters: AuditFilters = {}): Promise<AuditEntry[]> {
    let query = supabase
      .from('audit_log')
      .select('id, created_at, action, target_table, target_id, old_value, new_value, actor:staff!audit_log_actor_id_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(filters.limit ?? 200);

    if (filters.action) query = query.eq('action', filters.action);
    if (filters.targetId) query = query.eq('target_id', filters.targetId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      createdAt: row.created_at as string,
      actorName: ((row.actor as { full_name?: string } | null)?.full_name as string | undefined) ?? null,
      action: row.action as string,
      targetTable: row.target_table as string,
      targetId: (row.target_id as string | null) ?? null,
      oldValue: row.old_value,
      newValue: row.new_value,
    }));
  },

  /** Distinct action slugs present, for the filter dropdown. */
  async actions(): Promise<string[]> {
    const { data, error } = await supabase.from('audit_log').select('action').limit(1000);
    if (error) throw new Error(error.message);
    return [...new Set(((data ?? []) as Array<{ action: string }>).map((r) => r.action))].sort();
  },
};
