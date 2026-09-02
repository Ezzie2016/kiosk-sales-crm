/**
 * Phase 1 verification harness — RLS + auth + duplicate detection.
 *
 * This is NOT part of `npm test`. It talks to a live Supabase project and is run
 * on demand with `npm run test:integration`.
 *
 * Safety: it refuses to run unless it is pointed at a non-production target
 * (VITE_APP_ENV must not be "production" and the Supabase URL must not be the
 * Kiosk production project ref). It creates and then deletes its own fixtures;
 * it does not depend on any seed data other than the five test accounts listed
 * in docs/qa/PHASE-1-QA-CHECKLIST.md.
 *
 * Prereq: apply supabase/migrations/0001_crm_foundation.sql and run
 * supabase/seed/dev_seed.sql against the non-prod project first.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  normalizeBusinessName,
  normalizeEmail,
  normalizeInstagramHandle,
  normalizePhone,
  normalizeWebsite,
} from '@/modules/prospects/normalization';

// --------------------------------------------------------------------------
//  Environment + safety guard
// --------------------------------------------------------------------------
const ENV: Record<string, string | undefined> = {
  ...process.env,
  ...(import.meta.env as unknown as Record<string, string | undefined>),
};

const SUPABASE_URL = ENV.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = ENV.VITE_SUPABASE_ANON_KEY ?? '';
const APP_ENV = (ENV.VITE_APP_ENV ?? '').toLowerCase();

/** Kiosk production project ref — this harness must never touch it. */
const PRODUCTION_PROJECT_REFS = ['amdahjmozvgcscpmmyoe'];

const PASSWORD = ENV.QA_PASSWORD ?? 'kiosk-dev-1234';
const EMAILS = {
  admin: ENV.QA_ADMIN_EMAIL ?? 'admin@example.test',
  salesA: ENV.QA_SALES_A_EMAIL ?? 'amaka@example.test',
  salesB: ENV.QA_SALES_B_EMAIL ?? 'david@example.test',
  deactivated: ENV.QA_DEACTIVATED_EMAIL ?? 'chidi@example.test',
  noStaff: ENV.QA_NOSTAFF_EMAIL ?? 'nostaff@example.test',
};

function assertSafeTarget(): void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Phase 1 harness: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to a NON-PRODUCTION project before running.',
    );
  }
  if (APP_ENV === 'production') {
    throw new Error('Phase 1 harness: VITE_APP_ENV=production — refusing to run against production.');
  }
  for (const ref of PRODUCTION_PROJECT_REFS) {
    if (SUPABASE_URL.includes(ref)) {
      throw new Error(`Phase 1 harness: Supabase URL points at the production project (${ref}) — refusing to run.`);
    }
  }
}

// --------------------------------------------------------------------------
//  Client / session helpers
// --------------------------------------------------------------------------
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
  if (error || !data.user) {
    throw new Error(
      `Phase 1 harness: could not sign in as ${email} (${error?.message ?? 'no user'}). ` +
        'Run supabase/seed/dev_seed.sql against the non-prod project first.',
    );
  }
  return { client, userId: data.user.id };
}

interface Sessions {
  anon: Client;
  admin: Client;
  salesA: Client;
  salesB: Client;
  deactivated: Client;
  noStaff: Client;
  ids: { admin: string; salesA: string; salesB: string };
}

let S: Sessions;

// Prospects created by this run; deleted in afterAll (payment-pinned ones survive).
const createdProspectIds = new Set<string>();

// Per-run tag + phone block so a rerun never collides with rows a previous run
// left behind (the harness cannot delete crm.payments by design, so the handful
// of payment-pinned `pay` prospects it creates persist in non-prod — harmless).
const RUN_TAG = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PHONE_BLOCK = String(100 + Math.floor(Math.random() * 900)); // 3 digits
let seq = 0;

/** Valid 11-digit 0709… number, unique within and across runs. */
function qaPhone(): string {
  seq += 1;
  return `0709${PHONE_BLOCK}${String(seq).padStart(4, '0')}`;
}

function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  const { business_name, ...rest } = over;
  return {
    // Always run-tagged so residue is identifiable and reruns never collide;
    // `over` cannot clobber it.
    business_name: `QA-${RUN_TAG} ${(business_name as string | undefined) ?? `P${seq}`}`,
    business_category: 'other',
    source: 'referral',
    phone: qaPhone(),
    ...rest,
  };
}

async function createProspect(
  client: Client,
  over: Record<string, unknown> = {},
  override = false,
): Promise<{ id: string; error: string | null }> {
  const { data, error } = await client.rpc('create_prospect', { p_payload: payload(over), p_override: override });
  if (!error && data?.id) createdProspectIds.add(data.id as string);
  return { id: (data?.id as string) ?? '', error: error?.message ?? null };
}

// --------------------------------------------------------------------------
//  Setup / teardown
// --------------------------------------------------------------------------
beforeAll(async () => {
  assertSafeTarget();

  const [admin, salesA, salesB, deactivated, noStaff] = await Promise.all([
    signIn(EMAILS.admin),
    signIn(EMAILS.salesA),
    signIn(EMAILS.salesB),
    signIn(EMAILS.deactivated),
    signIn(EMAILS.noStaff),
  ]);

  S = {
    anon: makeClient(),
    admin: admin.client,
    salesA: salesA.client,
    salesB: salesB.client,
    deactivated: deactivated.client,
    noStaff: noStaff.client,
    ids: { admin: admin.userId, salesA: salesA.userId, salesB: salesB.userId },
  };
}, 60_000);

afterAll(async () => {
  if (!S) return;
  // Payments are intentionally undeletable (spec §10), so a prospect that has a
  // payment cannot be removed either. Those few `pay` prospects persist in
  // non-prod — the per-run RUN_TAG / phone block keeps reruns from colliding.
  for (const id of createdProspectIds) {
    await S.admin.from('prospects').delete().eq('id', id);
  }
  await Promise.all([
    S.admin.auth.signOut(),
    S.salesA.auth.signOut(),
    S.salesB.auth.signOut(),
    S.deactivated.auth.signOut(),
    S.noStaff.auth.signOut(),
  ]);
});

// --------------------------------------------------------------------------
//  2. anon / no-staff / deactivated
// --------------------------------------------------------------------------
describe('anon / no-staff / deactivated lockout', () => {
  it('anon sees nothing and cannot use RPCs', async () => {
    for (const table of ['prospects', 'staff', 'activities', 'payments', 'audit_log'] as const) {
      const { data, error } = await S.anon.from(table).select('*');
      // Lockout is proven by EITHER a permission error (anon has no grant) or an
      // empty result — but NOT by PGRST106, which would mean the schema is not
      // exposed (a false pass).
      expect(error?.code, `crm.${table}: schema must be exposed to the API`).not.toBe('PGRST106');
      expect(data ?? []).toEqual([]);
    }
    const create = await S.anon.rpc('create_prospect', { p_payload: payload(), p_override: false });
    expect(create.error).toBeTruthy();
    expect(create.error?.code).not.toBe('PGRST106');
  });

  it('a signed-in user with no crm.staff row sees nothing', async () => {
    for (const table of ['prospects', 'staff', 'activities', 'payments', 'audit_log'] as const) {
      const { data, error } = await S.noStaff.from(table).select('*');
      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);
    }
    const create = await S.noStaff.rpc('create_prospect', { p_payload: payload(), p_override: false });
    expect(create.error).toBeTruthy();
  });

  it('a deactivated staff member is locked out like a non-staff user', async () => {
    const { data, error } = await S.deactivated.from('prospects').select('*');
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
    const create = await S.deactivated.rpc('create_prospect', { p_payload: payload(), p_override: false });
    expect(create.error).toBeTruthy();
  });
});

// --------------------------------------------------------------------------
//  3. Prospect ownership
// --------------------------------------------------------------------------
describe('prospect ownership (RLS)', () => {
  let prospectOfA = '';
  let prospectOfB = '';

  beforeAll(async () => {
    prospectOfA = (await createProspect(S.salesA, { business_name: 'ownership-A' })).id;
    prospectOfB = (await createProspect(S.salesB, { business_name: 'ownership-B' })).id;
    expect(prospectOfA).toBeTruthy();
    expect(prospectOfB).toBeTruthy();
  });

  it('a salesperson sees only their own prospects', async () => {
    const { data } = await S.salesA.from('prospects').select('id, assigned_salesperson_id');
    expect((data ?? []).length).toBeGreaterThan(0);
    for (const row of data ?? []) {
      expect(row.assigned_salesperson_id).toBe(S.ids.salesA);
    }
    expect((data ?? []).some((r) => r.id === prospectOfB)).toBe(false);
  });

  it('an admin sees prospects for every salesperson', async () => {
    const { data } = await S.admin.from('prospects').select('id').in('id', [prospectOfA, prospectOfB]);
    expect((data ?? []).map((r) => r.id).sort()).toEqual([prospectOfA, prospectOfB].sort());
  });

  it("a salesperson's update on another rep's prospect changes nothing", async () => {
    const res = await S.salesA.from('prospects').update({ notes: 'hax' }).eq('id', prospectOfB).select();
    expect(res.error).toBeNull();
    expect(res.data ?? []).toEqual([]);
    const check = await S.admin.from('prospects').select('notes').eq('id', prospectOfB).single();
    expect(check.data?.notes ?? null).not.toBe('hax');
  });

  it('a salesperson cannot delete a prospect', async () => {
    const res = await S.salesA.from('prospects').delete().eq('id', prospectOfA).select();
    // Either an error, or zero rows removed — never an actual delete.
    expect((res.data ?? []).length).toBe(0);
    const check = await S.admin.from('prospects').select('id').eq('id', prospectOfA).maybeSingle();
    expect(check.data?.id).toBe(prospectOfA);
  });

  it('a salesperson cannot create a prospect assigned to someone else', async () => {
    const res = await createProspect(S.salesA, {
      business_name: 'assigned-to-B',
      assigned_salesperson_id: S.ids.salesB,
    });
    expect(res.error).toBeTruthy();
    expect(res.id).toBe('');
  });

  it('an admin can create a prospect assigned to a salesperson', async () => {
    const res = await createProspect(S.admin, {
      business_name: 'admin-creates-for-A',
      assigned_salesperson_id: S.ids.salesA,
    });
    expect(res.error).toBeNull();
    const row = await S.admin.from('prospects').select('created_by, assigned_salesperson_id').eq('id', res.id).single();
    expect(row.data?.created_by).toBe(S.ids.admin);
    expect(row.data?.assigned_salesperson_id).toBe(S.ids.salesA);
  });
});

// --------------------------------------------------------------------------
//  4. Assignment & attribution lock
// --------------------------------------------------------------------------
describe('assignment & attribution lock', () => {
  let paidProspect = '';

  beforeAll(async () => {
    paidProspect = (await createProspect(S.admin, {
      business_name: 'attribution',
      assigned_salesperson_id: S.ids.salesA,
    })).id;
    const move = await S.admin.rpc('change_prospect_status', { p_prospect_id: paidProspect, p_to: 'paid' });
    expect(move.error).toBeNull();
  });

  it('a salesperson cannot reassign via the RPC', async () => {
    const res = await S.salesA.rpc('assign_prospect', {
      p_prospect_id: paidProspect,
      p_salesperson_id: S.ids.salesB,
    });
    expect(res.error).toBeTruthy();
  });

  it('a salesperson cannot reassign via a direct update', async () => {
    const ownProspect = (await createProspect(S.salesA, { business_name: 'direct-reassign' })).id;
    const res = await S.salesA
      .from('prospects')
      .update({ assigned_salesperson_id: S.ids.salesB })
      .eq('id', ownProspect)
      .select();
    expect(res.error).toBeTruthy();
  });

  it('an admin reassigning a paid prospect writes a prospect.attribution_changed audit row', async () => {
    const res = await S.admin.rpc('assign_prospect', {
      p_prospect_id: paidProspect,
      p_salesperson_id: S.ids.salesB,
      p_reason: 'qa attribution check',
    });
    expect(res.error).toBeNull();

    const audit = await S.admin
      .from('audit_log')
      .select('action, target_id')
      .eq('target_id', paidProspect)
      .eq('action', 'prospect.attribution_changed');
    expect((audit.data ?? []).length).toBeGreaterThan(0);

    // restore
    await S.admin.rpc('assign_prospect', { p_prospect_id: paidProspect, p_salesperson_id: S.ids.salesA });
  });
});

// --------------------------------------------------------------------------
//  5. Pipeline transitions & history
// --------------------------------------------------------------------------
describe('pipeline transitions & history', () => {
  it('marking lost requires a reason, then stamps + logs history', async () => {
    const id = (await createProspect(S.salesA, { business_name: 'lost-flow' })).id;

    const noReason = await S.salesA.rpc('change_prospect_status', { p_prospect_id: id, p_to: 'lost' });
    expect(noReason.error).toBeTruthy();

    await S.salesA.from('prospects').update({ lost_reason: 'qa: not interested' }).eq('id', id);
    const withReason = await S.salesA.rpc('change_prospect_status', {
      p_prospect_id: id,
      p_to: 'lost',
      p_reason: 'qa',
    });
    expect(withReason.error).toBeNull();

    const row = await S.salesA.from('prospects').select('status, lost_at').eq('id', id).single();
    expect(row.data?.status).toBe('lost');
    expect(row.data?.lost_at).toBeTruthy();

    const history = await S.salesA.from('prospect_status_history').select('to_status').eq('prospect_id', id);
    expect((history.data ?? []).some((h) => h.to_status === 'lost')).toBe(true);

    const acts = await S.salesA.from('activities').select('activity_type').eq('prospect_id', id);
    const types = (acts.data ?? []).map((a) => a.activity_type);
    expect(types).toContain('status_changed');
    expect(types).toContain('marked_lost');
  });

  it('a paid prospect can only move to lost', async () => {
    const id = (await createProspect(S.admin, {
      business_name: 'paid-lock',
      assigned_salesperson_id: S.ids.salesA,
    })).id;
    expect((await S.admin.rpc('change_prospect_status', { p_prospect_id: id, p_to: 'paid' })).error).toBeNull();

    const backToFunnel = await S.admin.rpc('change_prospect_status', { p_prospect_id: id, p_to: 'trial' });
    expect(backToFunnel.error).toBeTruthy();

    await S.admin.from('prospects').update({ lost_reason: 'qa churn' }).eq('id', id);
    const churn = await S.admin.rpc('change_prospect_status', { p_prospect_id: id, p_to: 'lost' });
    expect(churn.error).toBeNull();
  });

  it('trial_started_at is stamped once and survives a backward move', async () => {
    const id = (await createProspect(S.salesA, { business_name: 'trial-stamp' })).id;
    expect((await S.salesA.rpc('change_prospect_status', { p_prospect_id: id, p_to: 'trial' })).error).toBeNull();
    const first = await S.salesA.from('prospects').select('trial_started_at').eq('id', id).single();
    expect(first.data?.trial_started_at).toBeTruthy();

    expect((await S.salesA.rpc('change_prospect_status', { p_prospect_id: id, p_to: 'contacted' })).error).toBeNull();
    const after = await S.salesA.from('prospects').select('trial_started_at').eq('id', id).single();
    expect(after.data?.trial_started_at).toBe(first.data?.trial_started_at);
  });
});

// --------------------------------------------------------------------------
//  6. Duplicate detection
// --------------------------------------------------------------------------
describe('duplicate detection', () => {
  const IG_HANDLE = `qa_dup_${RUN_TAG}`; // bare, lowercase, run-unique
  const IG = `@${IG_HANDLE}`;
  const PHONE = qaPhone(); // 11-digit 0709… reserved for this suite
  let phoneNormalized = '';
  let phone234Form = ''; // "234 XXXXXXXXXX" — same number, no leading +/0

  beforeAll(async () => {
    const res = await createProspect(S.admin, {
      business_name: 'dup-base',
      assigned_salesperson_id: S.ids.salesA,
      instagram_handle: IG,
      phone: PHONE,
    });
    expect(res.error, 'dup-base fixture').toBeNull();
    phoneNormalized = normalizePhone(PHONE) as string; // +234XXXXXXXXXX
    phone234Form = `234 ${phoneNormalized.slice(4)}`;
  });

  it('blocks a case-different instagram handle', async () => {
    const res = await createProspect(S.salesB, {
      business_name: 'dup-ig-case',
      instagram_handle: `@${IG_HANDLE.toUpperCase()}`,
    });
    expect(res.error).toContain('DUPLICATE_BLOCKED');
  });

  it('blocks an instagram profile URL that normalizes to the same handle', async () => {
    const res = await createProspect(S.salesB, {
      business_name: 'dup-ig-url',
      instagram_handle: `https://instagram.com/${IG_HANDLE}/`,
    });
    expect(res.error).toContain('DUPLICATE_BLOCKED');
  });

  it('blocks the same number in a different format', async () => {
    const res = await createProspect(S.salesB, { business_name: 'dup-phone-fmt', phone: phoneNormalized });
    expect(res.error).toContain('DUPLICATE_BLOCKED');
  });

  it('blocks a phone/WhatsApp cross-slot match', async () => {
    const res = await createProspect(S.salesB, {
      business_name: 'dup-cross-slot',
      phone: null,
      whatsapp_number: phone234Form,
    });
    expect(res.error).toContain('DUPLICATE_BLOCKED');
  });

  it('allows a business-name-only collision (moderate, not blocking)', async () => {
    // Same normalized business name as dup-base, but a fresh phone + no handle.
    const res = await createProspect(S.salesB, { business_name: 'dup-base' });
    expect(res.error).toBeNull();
    expect(res.id).toBeTruthy();
  });

  it('lets an admin override and records a prospect.duplicate_override audit row', async () => {
    const res = await createProspect(
      S.admin,
      { business_name: 'dup-override', instagram_handle: IG, assigned_salesperson_id: S.ids.salesA },
      true,
    );
    expect(res.error).toBeNull();
    const audit = await S.admin
      .from('audit_log')
      .select('action')
      .eq('target_id', res.id)
      .eq('action', 'prospect.duplicate_override');
    expect((audit.data ?? []).length).toBe(1);
  });

  it('does not let a non-admin override', async () => {
    const res = await createProspect(S.salesA, { business_name: 'dup-no-override', instagram_handle: IG }, true);
    expect(res.error).toBeTruthy();
    expect(res.error).not.toContain('DUPLICATE_BLOCKED'); // it's the override-permission error
  });

  it('rejects any attempt to write a generated *_normalized column', async () => {
    const res = await S.admin
      .from('prospects')
      .insert({
        business_name: 'QA spoof',
        business_category: 'other',
        source: 'referral',
        phone: qaPhone(),
        phone_normalized: 'SPOOFED',
        created_by: S.ids.admin,
        assigned_salesperson_id: S.ids.admin,
      })
      .select();
    expect(res.error).toBeTruthy();
  });
});

// --------------------------------------------------------------------------
//  7. Activities
// --------------------------------------------------------------------------
describe('activities', () => {
  let mine = '';
  let theirs = '';

  beforeAll(async () => {
    mine = (await createProspect(S.salesA, { business_name: 'act-mine' })).id;
    theirs = (await createProspect(S.salesB, { business_name: 'act-theirs' })).id;
  });

  it('rejects logging a system activity type via the RPC', async () => {
    const res = await S.salesA.rpc('log_activity', { p_prospect_id: mine, p_type: 'status_changed' });
    expect(res.error).toBeTruthy();
  });

  it('rejects a direct insert of a system activity type', async () => {
    const res = await S.salesA
      .from('activities')
      .insert({ prospect_id: mine, user_id: S.ids.salesA, activity_type: 'note_added' })
      .select();
    expect(res.error).toBeTruthy();
  });

  it('allows a manual contact activity on an owned prospect and advances last_contacted_at', async () => {
    const res = await S.salesA.rpc('log_activity', {
      p_prospect_id: mine,
      p_type: 'dm_sent',
      p_description: 'qa dm',
    });
    expect(res.error).toBeNull();
    const row = await S.salesA.from('prospects').select('last_contacted_at').eq('id', mine).single();
    expect(row.data?.last_contacted_at).toBeTruthy();
  });

  it("rejects logging an activity on another rep's prospect", async () => {
    const res = await S.salesA.rpc('log_activity', { p_prospect_id: theirs, p_type: 'dm_sent' });
    expect(res.error).toBeTruthy();
  });

  it('rejects update / delete on the timeline (immutable)', async () => {
    const upd = await S.salesA.from('activities').update({ description: 'x' }).eq('prospect_id', mine).select();
    expect((upd.data ?? []).length).toBe(0);
    const del = await S.salesA.from('activities').delete().eq('prospect_id', mine).select();
    expect((del.data ?? []).length).toBe(0);
  });
});

// --------------------------------------------------------------------------
//  8. Payments
// --------------------------------------------------------------------------
describe('payments', () => {
  let prospectOfA = '';
  let paymentId = '';

  beforeAll(async () => {
    const created = await createProspect(S.admin, {
      business_name: 'pay',
      assigned_salesperson_id: S.ids.salesA,
    });
    expect(created.error, 'payments fixture prospect').toBeNull();
    prospectOfA = created.id;

    // Create the payment here so the delete/visibility tests do not depend on
    // sibling `it` ordering.
    const res = await S.admin
      .from('payments')
      .insert({
        prospect_id: prospectOfA,
        attributed_salesperson_id: S.ids.salesA,
        plan: 'Growth',
        amount_kobo: 1_500_000,
        paid_on: '2026-01-15',
        status: 'confirmed',
        recorded_by: S.ids.admin,
      })
      .select()
      .single();
    expect(res.error, 'payments fixture payment').toBeNull();
    paymentId = res.data!.id as string;
  });

  it('a salesperson cannot insert a payment', async () => {
    const res = await S.salesA
      .from('payments')
      .insert({
        prospect_id: prospectOfA,
        plan: 'Starter',
        amount_kobo: 500000,
        paid_on: '2026-01-01',
        recorded_by: S.ids.salesA,
      })
      .select();
    expect(res.error).toBeTruthy();
  });

  it('the admin insert is visible to the owner and hidden from other reps', async () => {
    expect(paymentId).toBeTruthy();
    const aSees = await S.salesA.from('payments').select('id').eq('id', paymentId);
    expect((aSees.data ?? []).length).toBe(1);
    const bSees = await S.salesB.from('payments').select('id').eq('id', paymentId);
    expect((bSees.data ?? []).length).toBe(0);
  });

  it('nobody — not even an admin — can delete a payment', async () => {
    const res = await S.admin.from('payments').delete().eq('id', paymentId).select();
    expect((res.data ?? []).length).toBe(0);
    const stillThere = await S.admin.from('payments').select('id').eq('id', paymentId).maybeSingle();
    expect(stillThere.data?.id).toBe(paymentId);
  });
});

// --------------------------------------------------------------------------
//  9. Audit log
// --------------------------------------------------------------------------
describe('audit log', () => {
  it('is invisible to salespeople and readable by admins', async () => {
    const a = await S.salesA.from('audit_log').select('id');
    expect(a.data ?? []).toEqual([]);
    const b = await S.salesB.from('audit_log').select('id');
    expect(b.data ?? []).toEqual([]);
    const admin = await S.admin.from('audit_log').select('id').limit(1);
    expect((admin.data ?? []).length).toBe(1);
  });

  it('cannot be written directly by a client', async () => {
    const res = await S.admin
      .from('audit_log')
      .insert({ action: 'qa.hax', target_table: 'crm.prospects' })
      .select();
    expect(res.error).toBeTruthy();
  });
});

// --------------------------------------------------------------------------
//  10. SQL <-> TypeScript normalization parity
// --------------------------------------------------------------------------
describe('normalization parity (SQL vs TypeScript)', () => {
  const cases: Array<{ fn: string; ts: (v: string) => string | null; input: string; expected: string }> = [
    { fn: 'normalize_phone', ts: normalizePhone, input: '0803 123 4567', expected: '+2348031234567' },
    { fn: 'normalize_phone', ts: normalizePhone, input: '+234 803 123 4567', expected: '+2348031234567' },
    { fn: 'normalize_phone', ts: normalizePhone, input: '8031234567', expected: '+2348031234567' },
    { fn: 'normalize_instagram', ts: normalizeInstagramHandle, input: '@ExampleStore', expected: 'examplestore' },
    {
      fn: 'normalize_instagram',
      ts: normalizeInstagramHandle,
      input: 'https://www.instagram.com/ExampleStore/?hl=en',
      expected: 'examplestore',
    },
    {
      fn: 'normalize_website',
      ts: normalizeWebsite,
      input: 'https://www.ExampleStore.com/shop',
      expected: 'examplestore.com',
    },
    { fn: 'normalize_email', ts: normalizeEmail, input: '  Owner@Example.COM ', expected: 'owner@example.com' },
    { fn: 'normalize_business_name', ts: normalizeBusinessName, input: "Amaka's Stores Ltd", expected: 'amakas stores' },
  ];

  it.each(cases)('$fn("$input") agrees and equals "$expected"', async ({ fn, ts, input, expected }) => {
    const { data, error } = await S.admin.rpc(fn, { p: input });
    expect(error).toBeNull();
    expect(data).toBe(expected);
    expect(ts(input)).toBe(expected);
  });
});
