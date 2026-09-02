/**
 * Phase 2 verification — admin salesperson management (spec §15), against live
 * kiosk-nonprod. NOT part of `npm test`; runs via `npm run test:integration`.
 *
 * Covers the reversible paths (overview, activate/deactivate) live, and the
 * edge-function's authorization (a non-admin is refused). The happy-path
 * "create a salesperson" is a manual checklist item — it provisions real auth
 * infra.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

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
  deactivated: ENV.QA_DEACTIVATED_EMAIL ?? 'chidi@example.test',
};

const cache = new Map<string, { access_token: string; refresh_token: string }>();
async function switchTo(email: string): Promise<void> {
  let c = cache.get(email);
  if (!c) {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message ?? 'no session'}`);
    c = { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
    cache.set(email, c);
  }
  const { error } = await supabase.auth.setSession(c);
  if (error) throw new Error(`setSession failed for ${email}: ${error.message}`);
}

let deactivatedStaffId = '';

beforeAll(async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (non-prod)');
  if (APP_ENV === 'production') throw new Error('VITE_APP_ENV=production — refusing to run');
  for (const ref of PRODUCTION_PROJECT_REFS) {
    if (SUPABASE_URL.includes(ref)) throw new Error(`URL points at production (${ref}) — refusing`);
  }
  await switchTo(EMAILS.admin);
  const row = await supabase.from('staff').select('id').eq('email', EMAILS.deactivated).single();
  deactivatedStaffId = row.data!.id as string;
});

afterAll(async () => {
  // Restore chidi to the seeded (inactive) state.
  if (deactivatedStaffId) {
    await switchTo(EMAILS.admin);
    await supabase.from('staff').update({ is_active: false }).eq('id', deactivatedStaffId);
  }
});

describe('staff overview (spec §15)', () => {
  it('an admin gets every staff row with per-rep counts', async () => {
    await switchTo(EMAILS.admin);
    const { data, error } = await supabase.rpc('staff_overview');
    expect(error).toBeNull();
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThanOrEqual(4);
    const amaka = rows.find((r) => r.email === EMAILS.salesA);
    expect(amaka).toBeTruthy();
    expect(Number(amaka!.assigned_count)).toBeGreaterThan(0);
    expect(rows.every((r) => 'active_prospect_count' in r && 'confirmed_revenue_kobo' in r)).toBe(true);
  });

  it('a salesperson gets nothing from staff_overview', async () => {
    await switchTo(EMAILS.salesA);
    const { data } = await supabase.rpc('staff_overview');
    expect(data ?? []).toEqual([]);
  });
});

describe('activate / deactivate (spec §15)', () => {
  it('an admin can reactivate then deactivate a rep; each is stamped + audited', async () => {
    await switchTo(EMAILS.admin);

    const on = await supabase.from('staff').update({ is_active: true }).eq('id', deactivatedStaffId).select().single();
    expect(on.error).toBeNull();
    expect(on.data.is_active).toBe(true);
    expect(on.data.deactivated_at).toBeNull();

    const off = await supabase.from('staff').update({ is_active: false }).eq('id', deactivatedStaffId).select().single();
    expect(off.error).toBeNull();
    expect(off.data.is_active).toBe(false);
    expect(off.data.deactivated_at).toBeTruthy();

    const audit = await supabase
      .from('audit_log')
      .select('action')
      .eq('target_id', deactivatedStaffId)
      .in('action', ['staff.activated', 'staff.deactivated']);
    expect((audit.data ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('a salesperson cannot change anyone\'s active flag', async () => {
    await switchTo(EMAILS.salesA);
    const res = await supabase.from('staff').update({ is_active: false }).eq('id', deactivatedStaffId).select();
    expect((res.data ?? []).length).toBe(0);
  });
});

/** Call crm-admin as a specific account (explicit bearer, no singleton race). */
async function invokeAs(email: string, body: Record<string, unknown>): Promise<{ status: number; message: string }> {
  await switchTo(email); // ensures the session is cached
  const token = cache.get(email)!.access_token;
  const { error } = await supabase.functions.invoke('crm-admin', {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!error) return { status: 200, message: '' };
  const ctx = (error as { context?: Response }).context;
  const parsed = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
  return { status: ctx?.status ?? 0, message: String(parsed?.error ?? error.message) };
}

describe('create-salesperson edge function authorization (spec §15, §19)', () => {
  it('refuses a non-admin caller (403)', async () => {
    const res = await invokeAs(EMAILS.salesA, {
      action: 'create_salesperson',
      email: `qa-${Date.now()}@example.test`,
      full_name: 'QA',
      password: 'longenough1',
    });
    expect(res.status).toBe(403);
    expect(res.message).toMatch(/admin access required/i);
  });

  it('rejects a malformed request from an admin (400) without creating anything', async () => {
    const res = await invokeAs(EMAILS.admin, {
      action: 'create_salesperson',
      email: 'not-an-email',
      full_name: 'X',
      password: 'short',
    });
    expect(res.status).toBe(400);
    expect(res.message).toBeTruthy();
    await switchTo(EMAILS.admin);
    const check = await supabase.from('staff').select('id').eq('email', 'not-an-email');
    expect(check.data ?? []).toEqual([]);
  });
});
