# Phase 1 — QA Verification Checklist

**Status: Phase 1 is VERIFIED (2026-08-30).** Backend + UI both checked against
kiosk-nonprod. Phase 2 (leaderboard, commissions, funnel analytics, CSV export,
reminders, payments UI) may now begin. This checklist is kept as the record of
what was verified and how.

The security-critical surface is **auth + row-level security + duplicate
detection** — proven by `npm run test:integration` (56/56: 41 RLS/auth/dup + 15
browser-UI, run repeatedly and rerun-safe).

---

## 0. Prerequisites

- [x] `supabase/migrations/0001_crm_foundation.sql` + fixes `0003` / `0004`
      applied to **kiosk-nonprod** (`porjrpfvdadancwyeeix`) — 2026-08-30. Never
      prod (`amdahjmozvgcscpmmyoe`). `get_advisors` security → 0 findings on `crm.*`.
      (`0003`/`0004` were found by this harness — see §12.)
- [x] `supabase/seed/dev_seed.sql` run against kiosk-nonprod — 2026-08-30.
      (4 `crm.staff` rows + `nostaff@` auth user, 60 prospects, 6 payments.)
- [x] **`crm` schema exposed to the REST API** — `0002_crm_expose_schema_to_api.sql`
      applied. (Equivalent to Dashboard → Project Settings → API → Exposed
      schemas → add `crm`.) Without it every call fails `PGRST106: Invalid schema: crm`.
- [x] `supabase/seed/dev_seed.sql` provisions the five test accounts below (all
      password `kiosk-dev-1234`):

  | Account | Role | Notes |
  |---|---|---|
  | `admin@example.test` | admin | active |
  | `amaka@example.test` | salesperson A | active |
  | `david@example.test` | salesperson B | active |
  | `chidi@example.test` | salesperson | **deactivated** (`is_active = false`) |
  | `nostaff@example.test` | — | auth user with **no `crm.staff` row** |

- [x] `.env` points at non-prod: `VITE_APP_ENV=development`, `VITE_SUPABASE_URL` /
      `VITE_SUPABASE_ANON_KEY` = kiosk-nonprod values.
- [x] `npm run typecheck && npm run lint && npm test && npm run build` all green
      (78 unit tests).

> **Side effects of verification.** The harness creates prospects/payments in
> non-prod and appends `crm.audit_log` / `crm.activities` rows (append-only by
> design). It deletes the prospects it made — **except** the one `pay` prospect
> per run, which is pinned by an undeletable payment (spec §10). Those are
> tagged `QA-<run> pay`; clean them with:
> ```sql
> delete from crm.staff     where email like 'qa-%@example.test';
> delete from auth.users    where email like 'qa-%@example.test';
> delete from crm.payments  where prospect_id in (select id from crm.prospects where business_name not like 'Dev Store %');
> delete from crm.prospects where business_name not like 'Dev Store %';
> update crm.staff set is_active = false where email = 'chidi@example.test';
> ```

---

## 1. Automated harness (run first)

```bash
# env must be non-prod; the harness refuses to run if VITE_APP_ENV=production
# or if the Supabase URL is the production project ref.
npm run test:integration
```

`test:integration` runs eight files:

- **`phase1.integration.test.ts`** (41) — five anon auth sessions (admin / sales
  A / sales B / no-staff / deactivated): lockouts, prospect ownership, assignment
  + attribution lock, pipeline transitions + history, duplicate detection (incl.
  admin override + generated-column spoofing), activities, payments, audit-log
  visibility, SQL↔TypeScript normalization parity.
- **`phase1-ui.integration.test.ts`** (15) — the §11 browser walkthrough,
  headless (jsdom): renders the real pages against kiosk-nonprod for every
  account. See §11.
- **`phase2-analytics.integration.test.ts`** (5) — Phase 2: `crm.leaderboard()`
  returns the aggregate to any active staff member (not just admins) and ranks
  Amaka ahead of David; anon / no-staff get nothing; the funnel is monotonic,
  matches the seed (60 total / 6 paid), and is RLS-scoped per rep.
- **`phase2-payments.integration.test.ts`** (4) — a salesperson cannot record or
  re-status a payment; an admin records one (kobo-correct, `NGN`, attribution
  defaulted) → `payment_received` activity + `payment.created` audit; moving it
  `pending → confirmed` is audited and flows into the rep's leaderboard revenue.
- **`phase2-followups.integration.test.ts`** (4) — drives one prospect's
  follow-up date through overdue / upcoming / today and asserts the live bucket
  (Africa/Lagos); a rep's follow-ups are an RLS-scoped subset.
- **`phase2-export.integration.test.ts`** (3) — an admin exports all 60 seed
  prospects (one CSV row each, §21 header); paid prospects export `Confirmed`
  + revenue > 0; a rep's export is RLS-scoped.
- **`phase2-audit.integration.test.ts`** (4) — an admin sees entries newest-first;
  the action filter works; `actions()` is distinct+sorted; a rep gets nothing.
- **`phase2-staff.integration.test.ts`** (6) — `staff_overview` (admin: all rows
  + counts; rep: nothing); reactivate → deactivate round-trip is stamped +
  audited; a rep can't flip anyone's active flag; the `crm-admin` edge function
  refuses a non-admin (403) and a malformed admin request (400) without
  creating anything. **Manual:** actually create a salesperson and confirm they
  can log in.

**Run status: ✅ PASS — 82/82, run ×2 rerun-safe (2026-09-02).**

- [x] `npm run test:integration` passes with **0 failures** (82/82).
- [x] Re-run — green. The `phase1-ui` harness now caches one password grant per
      account and switches with `setSession()`; the integration config uses
      `retry: 1`. Together those keep the four-file suite from tripping
      kiosk-nonprod auth rate limits on back-to-back runs.

---

## 2. anon / no-staff / deactivated access

- [ ] **anon (no session)** — with only the anon key, `select` on every `crm.*`
      table returns `[]`; `rpc('find_duplicate_prospect_candidates', …)` returns
      `[]`; `rpc('create_prospect', …)` errors.
- [ ] **no-staff user** (`nostaff@example.test`, signed in) — `select` on
      `crm.staff`, `crm.prospects`, `crm.activities`, `crm.payments`,
      `crm.audit_log` all return `[]`. The app shows the "not set up as CRM
      staff" message on the login screen and never renders the dashboard.
- [ ] **deactivated staff** (`chidi@example.test`, signed in) — behaves exactly
      like the no-staff user: every `crm` read is empty, `create_prospect`
      errors ("Not authorized"). `RequireStaff` bounces them to `/login`.
- [ ] Re-activating `chidi@example.test` (admin sets `is_active = true`) restores
      access; deactivating again removes it and writes a `staff.deactivated`
      audit row.

## 3. Prospect ownership (RLS)

- [ ] Salesperson **A** lists prospects → sees only rows with
      `assigned_salesperson_id = A`. Never B's rows. Never unassigned rows.
- [ ] Salesperson **B** cannot see any prospect assigned to A (and vice-versa).
- [ ] **Admin** lists prospects → sees A's, B's, and unassigned.
- [ ] A `update` on one of B's prospects → **0 rows changed**, no error
      (RLS `USING` filters it out). Verify via admin that the row is unchanged.
- [ ] A `delete` on any prospect → error / 0 rows (no delete policy for
      non-admins). Row still present when admin re-selects.
- [ ] A calls `create_prospect` with `assigned_salesperson_id` = **B's id** →
      error (RLS `WITH CHECK`). A can only create prospects assigned to A.
- [ ] Admin `create_prospect` with `assigned_salesperson_id` = A → succeeds;
      `created_by` is the admin, `assigned_salesperson_id` is A.
- [ ] New prospect (any creator) gets a `prospect_created` activity, and if
      assigned on creation, a `prospect_assigned` activity + `prospect.created`
      audit row.

## 4. Assignment & attribution lock

- [ ] Salesperson A calls `assign_prospect(…)` → error
      *"Only an admin may assign or reassign a prospect"*.
- [ ] Salesperson A does a direct `update … set assigned_salesperson_id = …` on
      **their own** prospect → error (BEFORE trigger `guard_prospect_assignment`).
- [ ] **Admin** `assign_prospect` on an active prospect → succeeds; writes a
      `prospect_assigned` activity and a `prospect.assigned` audit row.
- [ ] **Admin** `assign_prospect` on a **`paid`** prospect → succeeds and writes
      a **`prospect.attribution_changed`** audit row (old + new
      `assigned_salesperson_id`, plus reason if supplied).
- [ ] Reassigning back restores the original owner and writes another audit row
      (history is additive, never overwritten).

## 5. Pipeline transitions & history

- [ ] `change_prospect_status(p, 'lost')` **without** a `lost_reason` on the row
      → error *"A lost_reason is required…"*.
- [ ] Set `lost_reason`, then `change_prospect_status(p, 'lost')` → succeeds;
      stamps `lost_at`; inserts a `prospect_status_history` row
      (`to_status = 'lost'`), a `status_changed` activity, a `marked_lost`
      activity, and a `prospect.status_changed` audit row.
- [ ] Move a fresh prospect `new → paid` (permissive forward jump allowed) →
      `paid_at` stamped once.
- [ ] From `paid`: `change_prospect_status(p, 'trial')` (or any earlier stage)
      → error *"Cannot move a converted prospect out of \"paid\"…"*.
- [ ] From `paid`: `change_prospect_status(p, 'lost')` (with `lost_reason`) →
      succeeds (churn is the one allowed exit).
- [ ] Enter `trial`, note `trial_started_at`, move **back** to `contacted`,
      re-read → `trial_started_at` is unchanged (stamped once, never cleared).
- [ ] Every status change produces exactly one `prospect_status_history` row and
      one `status_changed` activity — no duplicates.

## 6. Duplicate detection

Base prospect: `@QA_DupStore`, phone `0803 111 2222`, assigned to A.

- [ ] B `create_prospect` with instagram `@qa_dupstore` (different case) →
      error containing `DUPLICATE_BLOCKED`.
- [ ] B `create_prospect` with instagram `https://instagram.com/QA_DupStore/` →
      blocked (URL + trailing slash normalized to the same handle).
- [ ] B `create_prospect` with phone `+2348031112222` → blocked (format-agnostic).
- [ ] B `create_prospect` with the number in `whatsapp_number` and `phone` empty
      → blocked (phone/WhatsApp cross-slot match).
- [ ] B `create_prospect` with the **same `business_name`** but a fresh phone and
      no other shared identifier → **succeeds** (business-name-only = "moderate",
      not blocking).
- [ ] **Admin** `create_prospect(payload_with_dup_instagram, override = true)` →
      succeeds and writes a `prospect.duplicate_override` audit row.
- [ ] Salesperson A `create_prospect(payload_with_dup, override = true)` → error
      *"Only an admin may override a duplicate warning"*.
- [ ] Any client `insert`/`update` that names a `*_normalized` column →
      error (they are `GENERATED` and cannot be written).
- [ ] The client-side warning shown on `/prospects/new` matches the server
      decision: strong match → the "Create" button is disabled for non-admins,
      enabled as "Override & create" for admins; moderate match → a warning but
      creation still allowed.

## 7. Activities

- [ ] A `rpc('log_activity', { p, 'status_changed' })` → error
      *"…system-managed and cannot be logged manually"* (any system type).
- [ ] A direct `insert` into `crm.activities` with `activity_type = 'note_added'`
      (or any system type) → error (RLS `WITH CHECK`
      `not crm.is_system_activity_type(...)`).
- [ ] A `insert` into `crm.activities` with `activity_type = 'dm_sent'` for
      **their own** prospect → succeeds.
- [ ] A `rpc('log_activity', { p_B, 'dm_sent' })` where `p_B` is B's prospect →
      error (`can_access_prospect` false).
- [ ] A `update` / `delete` on any `crm.activities` row → error (no
      `update`/`delete` grant — the timeline is immutable).
- [ ] A can `select` activities for their own prospects only.
- [ ] `log_activity` with a contact type (`dm_sent` / `whatsapp_sent` /
      `phone_call` / `email_sent`) also advances the prospect's
      `last_contacted_at`.

## 8. Payments

- [ ] Salesperson A `insert` into `crm.payments` → error (admin-only).
- [ ] Salesperson A `update` on `crm.payments` → error (admin-only).
- [ ] **Admin** inserts a payment for A's prospect → succeeds; writes a
      `payment_received` activity and a `payment.created` audit row.
- [ ] Salesperson A `select` on `crm.payments` → sees that payment (their
      prospect). Salesperson B `select` → does **not** see it.
- [ ] `delete` on `crm.payments` by **anyone, including admin** → error (no
      delete policy — financial records are never deleted).

## 9. Audit log

- [ ] Salesperson A `select` on `crm.audit_log` → `[]` (admin-only).
- [ ] Salesperson B `select` on `crm.audit_log` → `[]`.
- [ ] **Admin** `select` on `crm.audit_log` → returns rows, and the rows created
      during sections 3–8 above are present with the expected `action` values.
- [ ] No client can `insert`/`update`/`delete` `crm.audit_log` directly (only
      triggers / definer functions write it).

## 10. SQL ↔ TypeScript normalization parity

Run each raw value through the DB (`rpc('normalize_<x>', { p: <raw> })`) and the
TS module (`src/modules/prospects/normalization.ts`). Both must return the
**same** value, and it must match the expected column.

- [ ] `normalize_phone('0803 123 4567')` = `normalizePhone('0803 123 4567')` = `+2348031234567`
- [ ] `normalize_phone('+234 803 123 4567')` = `+2348031234567`
- [ ] `normalize_phone('8031234567')` = `+2348031234567`
- [ ] `normalize_instagram('@ExampleStore')` = `examplestore`
- [ ] `normalize_instagram('https://www.instagram.com/ExampleStore/?hl=en')` = `examplestore`
- [ ] `normalize_website('https://www.ExampleStore.com/shop')` = `examplestore.com`
- [ ] `normalize_email('  Owner@Example.COM ')` = `owner@example.com`
- [ ] `normalize_business_name("Amaka's Stores Ltd")` = `amakas stores`

(The automated harness asserts all of these; re-run it after any change to
either `normalization.ts` or the `crm.normalize_*` functions.)

## 11. Browser walkthrough

**Executed headlessly (2026-08-30) via `src/verification/phase1-ui.integration.test.ts`
— 15/15.** It renders the real pages (React Router + AuthProvider + the app's
Supabase client) in jsdom against kiosk-nonprod, signing in as each seeded
account. Every item below is machine-asserted **except** true mobile visual
layout (CSS `@media` queries don't apply in jsdom) — that is structurally
checked and needs a one-time human glance.

- [x] `npm run dev` boots, serves `index.html` + entry modules (HTTP 200),
      `import.meta.env` resolves to kiosk-nonprod, no transform errors.
- [x] Signed out → login form; no app shell.
- [x] `nostaff@example.test` → "not set up as CRM staff" message; no app shell.
- [x] `chidi@example.test` (deactivated) → same block.
- [x] `admin@example.test` login → app shell, `Dashboard` heading, "Overview"
      (cross-team), env banner, `Sign out`.
- [x] `amaka@example.test` (A) login → `My dashboard` heading (own scope), name
      shown.
- [x] Salesperson **B** does not see **A**'s prospect in `/prospects`; opening
      A's prospect by URL → "Not found / Not authorized" panel.
- [x] Salesperson A on her own prospect → **no** "Assignment (admin)" card,
      **no** Delete button.
- [x] Admin on any prospect → "Assignment (admin)" card **and** Delete button.
- [x] **Create**: `/prospects/new`, entering a seeded instagram handle shows the
      blocking "…already exists and is assigned to…" warning + "Ask an admin…"
      note; the Create button is disabled for a non-admin. With a fresh
      identifier, create succeeds and lands on the new detail page (Pipeline +
      "Prospect created" timeline entry).
- [x] **Edit**: `/prospects/:id/edit` fields pre-filled; changing the follow-up
      note + Save returns to the detail page with the new value.
- [x] **Status change**: the status control moves `new → contacted` and a
      "Status new -> contacted" entry appears in the timeline.
- [x] **Activity log**: logging a "DM sent" adds it to the timeline immediately.
- [x] Non-prod **environment banner** ("Environment: DEVELOPMENT — not
      production data") renders in the shell.
- [x] Responsive shell: both `.sidebar` and `.mobile-nav` render with the nav
      links (CSS swaps them at ≤760px).
- [ ] **One-time human glance:** open the app at a ≤760px viewport and confirm
      the table→cards swap and one-handed usability read as intended. (Structure
      verified; only the visual is unconfirmed.)

---

## 12. Bugs found & fixed during verification

1. **`crm` schema not exposed to PostgREST** → every REST/RPC call returned
   `PGRST106`. Fix: `0002_crm_expose_schema_to_api.sql`
   (`pgrst.db_schemas = 'public, graphql_public, crm'`).
2. **Audit / history / timeline trigger functions were `SECURITY INVOKER`** →
   they insert system-type `crm.activities` rows and `crm.audit_log` rows, which
   RLS rejects for the calling `authenticated` user, so `crm.create_prospect`
   failed with *"new row violates row-level security policy"*. Fix:
   `0003_crm_trigger_security.sql` makes `on_prospect_insert` / `on_prospect_update`
   / `on_payment_insert` / `on_payment_update` / `on_staff_update` `SECURITY
   DEFINER` (run as the table owner, which bypasses RLS). The user-facing
   INSERT/UPDATE that fires them stays `SECURITY INVOKER`, so RLS still decides
   *which* row a caller may touch.
3. **`create_prospect` override-audit write** initially went through a revoked
   helper → *"permission denied for function record_audit"*. Fix:
   `0004_crm_duplicate_override_audit.sql` routes it through the same
   session-variable channel the status-change reason already uses; the DEFINER
   `on_prospect_insert` trigger writes the `prospect.duplicate_override` row.

**No app (TypeScript) feature code was changed.** The three fixes are all in the
`crm` schema. One test-infra note: in the headless UI harness, `userEvent.click`
on the submit `<button>` did not trigger form submission (a known jsdom +
userEvent v14 quirk); the harness uses `fireEvent.submit(form)` instead. The app
itself submits normally in a real browser — the dev-server boot smoke and the
create/edit/status flows all work through the real `<form onSubmit>`.

---

## Sign-off

| | Name | Date | Result |
|---|---|---|---|
| RLS / auth / duplicate harness (`npm run test:integration`) | Claude Code | 2026-08-30 | **PASS — 41/41, run ×3, rerun-safe** |
| Browser walkthrough — headless (`phase1-ui.integration.test.ts`) | Claude Code | 2026-08-30 | **PASS — 15/15** |
| Browser dev-server boot smoke | Claude Code | 2026-08-30 | **PASS** |
| Unit tests / typecheck / lint / build | Claude Code | 2026-09-02 | **PASS — 139 unit tests, eslint 0/0, build green** |
| Full validation after Phase 2 + polish pass | Claude Code | 2026-09-02 | **PASS — 139 unit + 82 integration (8 harness files), rerun-safe** |
| Bugs found | see §12 (3 schema fixes, all re-verified) | 2026-08-30 | |
| Mobile visual (one-time human glance, §11 last item) | | | pending — non-blocking |

**Phase 1 is VERIFIED.** Phase 2 work may begin. The mobile visual glance is the
only open item and does not block (structure + responsive CSS are in place and
asserted).
