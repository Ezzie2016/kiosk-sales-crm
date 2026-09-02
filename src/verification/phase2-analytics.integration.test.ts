/**
 * Phase 2 verification — leaderboard + funnel metrics, against live kiosk-nonprod.
 *
 * NOT part of `npm test`. Runs via `npm run test:integration`. Refuses to run
 * outside a non-production target. Read-only (no fixtures created).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { computeFunnelCounts } from '@/modules/analytics/funnel-metrics';
import { rankLeaderboard, type LeaderboardRow } from '@/modules/analytics/leaderboard';
import type { ProspectFunnelInput } from '@/modules/analytics/funnel-metrics';
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
const EMAILS = {
  admin: ENV.QA_ADMIN_EMAIL ?? 'admin@example.test',
  salesA: ENV.QA_SALES_A_EMAIL ?? 'amaka@example.test',
  salesB: ENV.QA_SALES_B_EMAIL ?? 'david@example.test',
  noStaff: ENV.QA_NOSTAFF_EMAIL ?? 'nostaff@example.test',
};

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

async function readLeaderboard(client: Client): Promise<LeaderboardRow[]> {
  const { data, error } = await client.rpc('leaderboard');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    salespersonId: r.salesperson_id as string,
    fullName: r.full_name as string,
    isActive: Boolean(r.is_active),
    assignedCount: Number(r.assigned_count),
    paidCount: Number(r.paid_count),
    confirmedRevenueKobo: Number(r.confirmed_revenue_kobo),
  }));
}

/**
 * Reads the funnel input under RLS. `seedOnly` restricts to `Dev Store %`
 * prospects so counts are deterministic even if another harness left fixtures.
 */
async function readFunnel(client: Client, seedOnly = false): Promise<ProspectFunnelInput[]> {
  let q = client.from('prospects').select('id, status, business_name');
  if (seedOnly) q = q.like('business_name', 'Dev Store %');
  const [p, h] = await Promise.all([q, client.from('prospect_status_history').select('prospect_id, to_status')]);
  if (p.error) throw new Error(p.error.message);
  if (h.error) throw new Error(h.error.message);
  const byId = new Map<string, PipelineStatus[]>();
  for (const row of (h.data ?? []) as Array<{ prospect_id: string; to_status: PipelineStatus }>) {
    byId.set(row.prospect_id, [...(byId.get(row.prospect_id) ?? []), row.to_status]);
  }
  return ((p.data ?? []) as Array<{ id: string; status: PipelineStatus }>).map((row) => ({
    status: row.status,
    statusHistory: byId.get(row.id) ?? [],
  }));
}

let S: { anon: Client; admin: Client; salesA: Client; salesB: Client; noStaff: Client; salesAId: string };

beforeAll(async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (non-prod)');
  if (APP_ENV === 'production') throw new Error('VITE_APP_ENV=production — refusing to run');
  for (const ref of PRODUCTION_PROJECT_REFS) {
    if (SUPABASE_URL.includes(ref)) throw new Error(`URL points at production (${ref}) — refusing`);
  }
  const [admin, salesA, salesB, noStaff] = await Promise.all([
    signIn(EMAILS.admin),
    signIn(EMAILS.salesA),
    signIn(EMAILS.salesB),
    signIn(EMAILS.noStaff),
  ]);
  S = {
    anon: makeClient(),
    admin: admin.client,
    salesA: salesA.client,
    salesB: salesB.client,
    noStaff: noStaff.client,
    salesAId: salesA.userId,
  };
}, 30000);

describe('leaderboard RPC (spec §8)', () => {
  it('returns a ranked aggregate visible to any active staff member', async () => {
    const asAdmin = await readLeaderboard(S.admin);
    const asSalesA = await readLeaderboard(S.salesA);
    const asSalesB = await readLeaderboard(S.salesB);

    expect(asAdmin.length).toBeGreaterThan(0);
    // A salesperson sees the same board (no prospect-level access needed).
    expect(asSalesA).toEqual(asAdmin);
    expect(asSalesB).toEqual(asAdmin);

    // Only aggregate columns — no prospect ids / names leak through.
    for (const row of asAdmin) {
      expect(Object.keys(row).sort()).toEqual(
        ['assignedCount', 'confirmedRevenueKobo', 'fullName', 'isActive', 'paidCount', 'salespersonId'].sort(),
      );
    }
  });

  it('ranks by paying merchants then revenue (seed: Amaka ahead of David)', async () => {
    const ranked = rankLeaderboard(await readLeaderboard(S.admin));
    const amaka = ranked.find((r) => r.fullName === 'Amaka Nwosu');
    const david = ranked.find((r) => r.fullName === 'David Okon');
    expect(amaka && david).toBeTruthy();
    expect(amaka!.paidCount).toBeGreaterThanOrEqual(david!.paidCount);
    expect(amaka!.rank).toBeLessThan(david!.rank);
    expect(amaka!.conversionRate).toMatchObject({ numerator: amaka!.paidCount, denominator: amaka!.assignedCount });
  });

  it('is empty for anon and for a signed-in non-staff user', async () => {
    const anon = await S.anon.rpc('leaderboard');
    expect((anon.data ?? []).length === 0 || anon.error).toBeTruthy();
    const noStaff = await S.noStaff.rpc('leaderboard');
    expect(noStaff.error).toBeNull();
    expect(noStaff.data ?? []).toEqual([]);
  });
});

describe('funnel metrics (spec §9)', () => {
  it('admin funnel covers the whole team, is monotonic, and matches the seed', async () => {
    const counts = computeFunnelCounts(await readFunnel(S.admin, true));
    expect(counts.total).toBe(60); // seed baseline (Dev Store 1..60)
    expect(counts.contacted).toBeGreaterThanOrEqual(counts.replied);
    expect(counts.replied).toBeGreaterThanOrEqual(counts.demo);
    expect(counts.demo).toBeGreaterThanOrEqual(counts.trial);
    expect(counts.trial).toBeGreaterThanOrEqual(counts.paid);
    expect(counts.paid).toBe(6); // seed: 6 converted prospects
  });

  it("a salesperson's funnel is scoped to their own prospects", async () => {
    const all = computeFunnelCounts(await readFunnel(S.admin, true));
    const mine = computeFunnelCounts(await readFunnel(S.salesA, true));
    expect(mine.total).toBeGreaterThan(0);
    expect(mine.total).toBeLessThan(all.total);
    // Everything the salesperson sees is a subset of the whole-team funnel.
    expect(mine.paid).toBeLessThanOrEqual(all.paid);
  });
});
