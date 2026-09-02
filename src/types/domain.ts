/**
 * Row shapes for the `crm` schema, hand-written to match
 * supabase/migrations/0001_crm_foundation.sql.
 *
 * Once the migration is applied, replace this file with the output of
 * `supabase gen types typescript --schema crm` (see README) so the types are
 * generated, not maintained by hand.
 */
import type { StaffRole } from '@/constants/roles';
import type { PipelineStatus } from '@/constants/pipeline';
import type { ProspectSource } from '@/constants/sources';
import type { BusinessCategory } from '@/constants/categories';
import type { ActivityType } from '@/constants/activity-types';
import type { PaymentStatus, Currency } from '@/constants/payments';

export interface Staff {
  id: string;
  full_name: string;
  email: string;
  role: StaffRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
}

export interface Prospect {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  instagram_handle: string | null;
  whatsapp_number: string | null;
  website: string | null;
  business_category: BusinessCategory;
  location: string | null;
  source: ProspectSource;
  assigned_salesperson_id: string | null;
  status: PipelineStatus;
  notes: string | null;
  lost_reason: string | null;
  business_name_normalized: string | null;
  phone_normalized: string | null;
  whatsapp_normalized: string | null;
  email_normalized: string | null;
  instagram_normalized: string | null;
  website_normalized: string | null;
  converted_merchant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  follow_up_note: string | null;
  trial_started_at: string | null;
  paid_at: string | null;
  lost_at: string | null;
}

export interface ProspectWithOwner extends Prospect {
  assigned_salesperson: Pick<Staff, 'id' | 'full_name'> | null;
}

export interface Activity {
  id: string;
  prospect_id: string;
  user_id: string | null;
  activity_type: ActivityType;
  description: string | null;
  created_at: string;
}

export interface ActivityWithUser extends Activity {
  user: Pick<Staff, 'id' | 'full_name'> | null;
}

export interface ProspectStatusHistoryRow {
  id: string;
  prospect_id: string;
  from_status: PipelineStatus | null;
  to_status: PipelineStatus;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  prospect_id: string;
  attributed_salesperson_id: string | null;
  plan: string;
  amount_kobo: number;
  currency: Currency;
  status: PaymentStatus;
  paid_on: string;
  external_reference: string | null;
  recorded_by: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_table: string;
  target_id: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}
