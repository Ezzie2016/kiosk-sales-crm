/**
 * Phase 2 verification — payments management (spec §10), against live kiosk-nonprod.
 *
 * NOT part of `npm test`. Runs via `npm run test:integration`. Refuses to run
 * outside a non-production target. Creates one prospect + payment it cannot
 * delete (payments are undeletable by design) — tagged `PAY-<run>`; reset
 * non-prod with the snippet in docs/qa/PHASE-1-QA-CHECKLIST.md §0.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { buildPaymentRow } from '@/modules/payments/payment-service';
import { paymentCreateSchema } from '@/modules/payments/payment-schemas';

const ENV: Record<string, string | undefined> = {
  ...process.env,
  ...(import.meta.env as unknown as Record<string, string | undefined>),
};
const SUPABASE_URL = ENV.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = ENV.VITE_SUPABASE_ANON_KEY ?? '';
const APP_ENV = (ENV.VITE_APP_ENV ?? '').toLowerCase();
const PRODUCTION_PROJECT_REFS = ['amdahjmozvgcscpmmyoe'];
const PASSWORD = ENV.QA_PASSWORD ?? 'kiosk-dev-1234';
const EMAILS = {
  admin: ENV.QA_ADMIN_EMAIL ?? 'admin@example.test',
  salesA: ENV.QA_SALES_A_EMAIL ?? 'amaka@example.test',
};
const RUN_TAG = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'crm' },
  });
}
type Client = ReturnType<typeof makeClient>;

async function signIn(email: string): Promise<{ client: Client; userId: string }> {
  const client = makeClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.user) throw new Error(`sign-in failed for ${email}: ${error?.message ?? 'no user'}`);
  return { client, userId: data.user.id };
}

let S: { admin: Client; adminId: string; salesA: Client; salesAId: string };
let prospectId = '';
let paymentId = '';

beforeAll(async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (non-prod)');
  if (APP_ENV === 'production') throw new Error('VITE_APP_ENV=production — refusing to run');
  for (const ref of PRODUCTION_PROJECT_REFS) {
    if (SUPABASE_URL.includes(ref)) throw new Error(`URL points at production (${ref}) — refusing`);
  }
  const [admin, salesA] = await Promise.all([signIn(EMAILS.admin), signIn(EMAILS.salesA)]);
  S = { admin: admin.client, adminId: admin.userId, salesA: salesA.client, salesAId: salesA.userId };

  const created = await S.admin.rpc('create_prospect', {
    p_payload: {
      business_name: `PAY-${RUN_TAG} merchant`,
      business_category: 'other',
      source: 'referral',
      phone: `0708${String(Date.now()).slice(-7)}`,
      assigned_salesperson_id: S.salesAId,
    },
    p_override: false,
  });
  expect(created.error, 'payments fixture prospect').toBeNull();
  prospectId = created.data.id as string;
}, 30000);

afterAll(async () => {
  await Promise.all([S?.admin?.auth.signOut(), S?.salesA?.auth.signOut()]);
});

function row(status: 'pending' | 'confirmed') {
  const input = paymentCreateSchema.parse({
    plan: 'Growth',
    amountNaira: '1,500.50',
    paidOn: new Date().toISOString().slice(0, 10),
    status,
  });
  return buildPaymentRow(input, prospectId, S.adminId, S.salesAId).row;
}

describe('payments management (spec §10)', () => {
  it('a salesperson cannot record a payment', async () => {
    const res = await S.salesA.from('payments').insert(row('pending')).select();
    expect(res.error).toBeTruthy();
  });

  it('an admin records a payment (kobo-correct) and it writes a timeline + audit entry', async () => {
    const res = await S.admin.from('payments').insert(row('pending')).select().single();
    expect(res.error).toBeNull();
    paymentId = res.data.id as string;
    expect(res.data.amount_kobo).toBe(150050);
    expect(res.data.currency).toBe('NGN');
    expect(res.data.attributed_salesperson_id).toBe(S.salesAId);

    const act = await S.admin
      .from('activities')
      .select('activity_type')
      .eq('prospect_id', prospectId)
      .eq('activity_type', 'payment_received');
    expect((act.data ?? []).length).toBeGreaterThan(0);

    const audit = await S.admin
      .from('audit_log')
      .select('action')
      .eq('target_id', paymentId)
      .eq('action', 'payment.created');
    expect((audit.data ?? []).length).toBe(1);
  });

  it('an admin can move a payment pending → confirmed (audited); it then counts toward revenue', async () => {
    const upd = await S.admin.from('payments').update({ status: 'confirmed' }).eq('id', paymentId).select().single();
    expect(upd.error).toBeNull();
    expect(upd.data.status).toBe('confirmed');

    const audit = await S.admin
      .from('audit_log')
      .select('action')
      .eq('target_id', paymentId)
      .eq('action', 'payment.updated');
    expect((audit.data ?? []).length).toBeGreaterThan(0);

    // The attributed rep's leaderboard revenue now includes this ₦1,500.50.
    const { data } = await S.admin.rpc('leaderboard');
    const amaka = (data ?? []).find((r: Record<string, unknown>) => r.salesperson_id === S.salesAId);
    expect(Number(amaka?.confirmed_revenue_kobo ?? 0)).toBeGreaterThanOrEqual(150050);
  });

  it('a salesperson cannot change a payment status', async () => {
    const res = await S.salesA.from('payments').update({ status: 'refunded' }).eq('id', paymentId).select();
    expect((res.data ?? []).length).toBe(0);
  });
});
