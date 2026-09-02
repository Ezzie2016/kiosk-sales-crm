/**
 * Phase 2 verification — prospect CSV export (spec §21), against live kiosk-nonprod.
 * Read-only. NOT part of `npm test`; runs via `npm run test:integration`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { exportRepository } from '@/modules/export/export-repository';
import { CSV_COLUMNS, prospectsCsv } from '@/modules/export/prospect-csv';
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
async function primeAndSwitch(email: string): Promise<void> {
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
  await Promise.all([primeAndSwitch(EMAILS.admin), primeAndSwitch(EMAILS.salesA)]);
});

describe('prospect CSV export (spec §21)', () => {
  it('an admin exports every visible prospect, one CSV row each, with the §21 header', async () => {
    await primeAndSwitch(EMAILS.admin);
    const { prospects, payments } = await exportRepository.fetch();
    const seedRows = prospects.filter((p) => p.businessName.startsWith('Dev Store '));
    expect(seedRows.length).toBe(60);

    const csv = prospectsCsv(seedRows, payments);
    const lines = csv.split('\r\n').filter((l) => l.length > 0);
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(lines).toHaveLength(1 + 60);
    expect(csv).toContain('Dev Store 2');
  });

  it('a paid prospect exports with a Confirmed payment status and non-empty revenue', async () => {
    await primeAndSwitch(EMAILS.admin);
    const { prospects, payments } = await exportRepository.fetch({ status: 'paid' });
    expect(prospects.length).toBeGreaterThan(0);
    const rows = prospectsCsv(prospects, payments).split('\r\n').slice(1).filter((l) => l.length > 0);
    for (const line of rows) {
      const cells = line.split(',');
      expect(cells[9]).toBe('Paid'); // Status column
      expect(cells[14]).toBe('Confirmed'); // Payment status
      expect(Number(cells[15])).toBeGreaterThan(0); // Revenue
    }
  });

  it("a salesperson's export is RLS-scoped to their own prospects", async () => {
    await primeAndSwitch(EMAILS.admin);
    const all = (await exportRepository.fetch()).prospects.length;
    await primeAndSwitch(EMAILS.salesA);
    const mine = (await exportRepository.fetch()).prospects.length;
    expect(mine).toBeGreaterThan(0);
    expect(mine).toBeLessThan(all);
  });
});
