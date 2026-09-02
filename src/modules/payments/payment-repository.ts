/**
 * Payment data access (spec §10). Admin-only writes are enforced by the
 * `payments_insert` / `payments_update` RLS policies — this layer just shapes
 * the calls. There is no delete: financial records are never removed
 * (`crm.payments` has no delete policy).
 */
import { supabase } from '@/lib/supabase';
import type { Payment } from '@/types/domain';
import type { PaymentStatus } from '@/constants/payments';

export const paymentRepository = {
  async create(row: Record<string, unknown>): Promise<Payment> {
    const { data, error } = await supabase.from('payments').insert(row).select().single();
    if (error) throw new Error(error.message);
    return data as Payment;
  },

  async updateStatus(id: string, status: PaymentStatus): Promise<void> {
    const { error } = await supabase.from('payments').update({ status }).eq('id', id);
    if (error) throw new Error(error.message);
  },
};
