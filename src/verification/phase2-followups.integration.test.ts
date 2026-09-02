/**
 * Phase 2 verification — follow-up reminders (spec §6), against live kiosk-nonprod.
 * Read-only. NOT part of `npm test`; runs via `npm run test:integration`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { bucketFollowUps, type FollowUpProspect } from '@/modules/followups/followup-buckets';
import type { PipelineStatus } from '@/constants/pipeline';

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

async function listFollowUps(client: Client): Promise<FollowUpProspect[]> {
  const { data, error } = await client
    .from('prospects')
    .select('id, business_name, status, next_follow_up_at, follow_up_note, assigned_salesperson_id')
    .not('next_follow_up_at', 'is', null);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    businessName: r.business_name as string,
    status: r.status as PipelineStatus,
    nextFollowUpAt: (r.next_follow_up_at as string | null) ?? null,
    followUpNote: (r.follow_up_note as string | null) ?? null,
    ownerName: null,
  }));
}

let S: { admin: Client; salesA: Client; salesAId: string };
/** A seeded, active prospect owned by amaka whose follow-up date we drive + restore. */
let fixtureId = '';
let fixtureOriginalFollowUp: string | null = null;

beforeAll(async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (non-prod)');
  if (APP_ENV === 'production') throw new Error('VITE_APP_ENV=production — refusing to run');
  for (const ref of PRODUCTION_PROJECT_REFS) {
    if (SUPABASE_URL.includes(ref)) throw new Error(`URL points at production (${ref}) — refusing`);
  }
  const [admin, salesA] = await Promise.all([signIn(EMAILS.admin), signIn(EMAILS.salesA)]);
  S = { admin: admin.client, salesA: salesA.client, salesAId: salesA.userId };

  const pick = await S.admin
    .from('prospects')
    .select('id, next_follow_up_at')
    .eq('assigned_salesperson_id', S.salesAId)
    .in('status', ['contacted', 'replied', 'demo', 'trial'])
    .limit(1)
    .single();
  fixtureId = pick.data!.id as string;
  fixtureOriginalFollowUp = (pick.data!.next_follow_up_at as string | null) ?? null;
}, 30000);

afterAll(async () => {
  if (S && fixtureId) {
    await S.admin.from('prospects').update({ next_follow_up_at: fixtureOriginalFollowUp }).eq('id', fixtureId);
  }
});

async function setFixtureFollowUp(iso: string): Promise<void> {
  const { error } = await S.admin.from('prospects').update({ next_follow_up_at: iso }).eq('id', fixtureId);
  expect(error).toBeNull();
}
function bucketOf(buckets: ReturnType<typeof bucketFollowUps>, id: string): 'overdue' | 'dueToday' | 'upcoming' | 'none' {
  if (buckets.overdue.some((p) => p.id === id)) return 'overdue';
  if (buckets.dueToday.some((p) => p.id === id)) return 'dueToday';
  if (buckets.upcoming.some((p) => p.id === id)) return 'upcoming';
  return 'none';
}

describe('follow-up reminders (spec §6)', () => {
  it('buckets a prospect by its follow-up date relative to "today" (Africa/Lagos)', async () => {
    const now = Date.now();
    await setFixtureFollowUp(new Date(now - 3 * 86400_000).toISOString());
    expect(bucketOf(bucketFollowUps(await listFollowUps(S.admin)), fixtureId)).toBe('overdue');

    await setFixtureFollowUp(new Date(now + 3 * 86400_000).toISOString());
    expect(bucketOf(bucketFollowUps(await listFollowUps(S.admin)), fixtureId)).toBe('upcoming');

    await setFixtureFollowUp(new Date(now + 60_000).toISOString()); // ~now → today
    expect(bucketOf(bucketFollowUps(await listFollowUps(S.admin)), fixtureId)).toBe('dueToday');
  });

  it('the admin view has follow-ups from more than one owner', async () => {
    const rows = await listFollowUps(S.admin);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('excludes terminal (paid / lost) prospects from every bucket', async () => {
    const buckets = bucketFollowUps(await listFollowUps(S.admin));
    for (const list of [buckets.overdue, buckets.dueToday, buckets.upcoming]) {
      for (const p of list) {
        expect(p.status).not.toBe('paid');
        expect(p.status).not.toBe('lost');
      }
    }
  });

  it("a salesperson's follow-ups are a strict RLS-scoped subset", async () => {
    const all = await listFollowUps(S.admin);
    const mine = await listFollowUps(S.salesA);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.length).toBeLessThan(all.length);
    const allIds = new Set(all.map((p) => p.id));
    for (const p of mine) expect(allIds.has(p.id)).toBe(true);
  });
});
