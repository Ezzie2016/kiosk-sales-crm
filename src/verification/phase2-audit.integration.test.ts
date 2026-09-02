/**
 * Phase 2 verification — audit-log viewer (spec §16), against live kiosk-nonprod.
 * Read-only. NOT part of `npm test`; runs via `npm run test:integration`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { auditRepository } from '@/modules/audit/audit-repository';
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
const EMAILS = { admin: ENV.QA_ADMIN_EMAIL ?? 'admin@example.test', salesA: ENV.QA_SALES_A_EMAIL ?? 'amaka@example.test' };

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

beforeAll(async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (non-prod)');
  if (APP_ENV === 'production') throw new Error('VITE_APP_ENV=production — refusing to run');
  for (const ref of PRODUCTION_PROJECT_REFS) {
    if (SUPABASE_URL.includes(ref)) throw new Error(`URL points at production (${ref}) — refusing`);
  }
  await Promise.all([switchTo(EMAILS.admin), switchTo(EMAILS.salesA)]);
});

describe('audit-log viewer (spec §16)', () => {
  it('an admin sees entries, newest first, each with an action', async () => {
    await switchTo(EMAILS.admin);
    const rows = await auditRepository.list({ limit: 50 });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(typeof r.action).toBe('string');
    const times = rows.map((r) => new Date(r.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('filtering by action returns only that action', async () => {
    await switchTo(EMAILS.admin);
    const rows = await auditRepository.list({ action: 'prospect.created', limit: 20 });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.action).toBe('prospect.created');
  });

  it('the action list is distinct, sorted, and includes seeded slugs', async () => {
    await switchTo(EMAILS.admin);
    const actions = await auditRepository.actions();
    expect(actions).toEqual([...actions].sort());
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions).toContain('prospect.created');
  });

  it('a salesperson cannot read the audit log at all', async () => {
    await switchTo(EMAILS.salesA);
    await expect(auditRepository.list({ limit: 5 })).resolves.toEqual([]);
    const raw = await supabase.from('audit_log').select('id').limit(5);
    expect(raw.data ?? []).toEqual([]);
  });
});
