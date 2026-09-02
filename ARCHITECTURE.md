# Kiosk Sales CRM — Architecture (foundation build)

Status: **Phase 1 VERIFIED (2026-08-30). Phase 2 complete + polish pass done (2026-09-02).**
Shipped: funnel metrics + leaderboard (`0005`), payments management, follow-up
reminder dashboard, prospect CSV export, audit-log viewer, admin
salesperson-management (`0006`/`0007` + the `crm-admin` edge function).
**Not built by design:** commissions / commission payouts — spec §25 lists these
as a *future integration*, to be structured for but not implemented in V1.

Verification (2026-08-30):
- ✅ Applied to **kiosk-nonprod** (`porjrpfvdadancwyeeix`): `0001_crm_foundation`,
  `0002_crm_expose_schema_to_api`, `0003_crm_trigger_security`,
  `0004_crm_duplicate_override_audit`. `get_advisors` security → **0 findings on `crm.*`**.
- ✅ `dev_seed.sql` run (4 staff + `nostaff@` auth user, 60 prospects, 6 payments).
- ✅ **`npm run test:integration` — 56/56, run repeatedly, rerun-safe**:
  41 RLS/auth/duplicate assertions (`phase1.integration.test.ts`) +
  15 headless browser-UI assertions (`phase1-ui.integration.test.ts`) covering
  login for every account, RLS-scoped visibility, blocked accounts, create +
  duplicate warning, edit, status change, activity log, dashboard scoping,
  environment banner, and responsive shell structure.
- ✅ Local: typecheck, lint, 78 unit tests, production build.
- Verifying surfaced and fixed three `crm`-schema bugs (`0002`–`0004`; see
  [`docs/qa/PHASE-1-QA-CHECKLIST.md`](docs/qa/PHASE-1-QA-CHECKLIST.md) §12) —
  notably the audit/history trigger functions had to become `SECURITY DEFINER`.
  No app (TypeScript) feature code changed.
- Only open item (non-blocking): a one-time human glance at the ≤760px mobile
  layout — jsdom can't evaluate CSS `@media`; the structure and responsive CSS
  are in place and asserted.

Verification artifacts: manual checklist at
[`docs/qa/PHASE-1-QA-CHECKLIST.md`](docs/qa/PHASE-1-QA-CHECKLIST.md); automated
RLS / auth / duplicate-detection harness via `npm run test:integration`
(non-prod only — see [`src/verification/`](src/verification/)).

---

## 1. What this is

A standalone internal web app for the Kiosk sales team to track prospects from
first outreach to paying merchant. It is **separate from the merchant mobile
app** — different users, different data, its own repo at
`KIOSK DOCS/kiosk-sales-crm/`. It reuses the Kiosk design tokens, the
explicit-environment pattern, the local-time day-boundary rule, and the
"business logic out of components" discipline from the mobile app's constitution.

## 2. Stack

| Concern | Choice | Why |
|---|---|---|
| Build / UI | Vite + React 19 + TypeScript | Per your instruction. Fast, minimal, familiar. |
| Routing | react-router-dom 7 | Standard. |
| Server state | @tanstack/react-query | Caching + invalidation without hand-rolling it. |
| Input validation | zod | Constitution requires input validation at the boundary. |
| Backend | Supabase (Postgres + Auth + PostgREST) | Reuses the platform the mobile app already runs on. |
| Tests | Vitest | Matches the repo's Jest-style expectations; fast. |

No component library — components are hand-rolled against the ported token set
(`src/design/tokens.css`) to keep the dependency surface small.

## 3. Where it runs

- **Frontend**: static build, deployable anywhere (Vercel/Netlify/S3). No secrets
  in the bundle — only the Supabase URL + anon key.
- **Backend**: the `crm` schema, to be applied to **`kiosk-nonprod`**
  (`porjrpfvdadancwyeeix`) after this review. It is **additive** — it creates
  nothing outside the `crm` schema except the `auth.users` rows staff sign in
  with, and touches no merchant-app table, policy, or Auth setting. It does not
  reopen the frozen mobile-app gates.

## 4. Authorization model — the security boundary

**The React app is untrusted.** Every rule is enforced by Postgres row-level
security and triggers in the `crm` schema. The functions in
`src/modules/authorization/permissions.ts` mirror those rules one-for-one and
exist only to gate the UI; they are unit-tested so the SQL and the TS cannot
drift silently.

- A person can use the CRM **only** if they have an active row in `crm.staff`
  (keyed by `auth.users.id`). A merchant-app auth user with no staff row sees an
  empty app — RLS returns nothing.
- `crm.is_admin()` / `crm.is_active_staff()` / `crm.can_access_prospect()` are
  `SECURITY DEFINER` helpers used by every policy.
- **Prospects**: admin sees all; a salesperson sees only
  `assigned_salesperson_id = auth.uid()`. Insert forces `created_by = auth.uid()`
  and (for non-admins) self-assignment. Delete is admin-only.
- **Reassignment / attribution**: `crm.guard_prospect_assignment` rejects any
  `assigned_salesperson_id` change by a non-admin — before and after conversion
  (spec §11). Attribution changes on a `paid` prospect are logged as
  `prospect.attribution_changed`.
- **Status**: only the owner or an admin can change it.
  `crm.guard_prospect_status_change` enforces the same transition graph as
  `canTransition()` (notably: a `paid` prospect can only go to `lost`), stamps
  `trial_started_at` / `paid_at` / `lost_at` once, and requires a `lost_reason`.
- **Activities**: append-only. Clients may insert only non-system types for
  prospects they can access; system entries (created, assigned, status_changed,
  payment_received, …) are written by `SECURITY DEFINER` triggers that run as the
  table owner and so bypass RLS (see `0003_crm_trigger_security.sql`). The
  user-facing INSERT/UPDATE that fires them stays `SECURITY INVOKER`, so RLS
  still decides *which* row a caller may touch.
- **Payments**: insert/update admin-only; **no delete policy at all** — financial
  records are never deleted, a refund is a status change (spec §10, Kiosk
  constitution).
- **Audit log**: admin-readable; written only by triggers / definer functions.

## 5. Duplicate detection (spec §4)

Three cooperating pieces:

1. **`crm.normalize_{email,phone,instagram,website,business_name}(text)`** — the
   authoritative normalizers, immutable Postgres functions. The `*_normalized`
   columns on `crm.prospects` are `GENERATED ALWAYS AS (...) STORED` from them,
   so a client **cannot set or spoof** a normalized value.
2. **`src/modules/prospects/normalization.ts`** — a faithful TypeScript mirror of
   those rules, used for instant client-side hints/ranking. 24 unit-test vectors
   pin the behaviour; the SQL and TS must stay in parity.
3. **`crm.find_duplicate_prospect_candidates(...)`** — a `SECURITY DEFINER` RPC
   that takes **raw** identifier values, normalizes them with the functions
   above, searches, and returns only non-sensitive fields plus the assigned
   salesperson's name — so a rep can be told "assigned to Amaka" without gaining
   read access to Amaka's prospects.
4. **`src/modules/prospects/duplicate-detection.ts`** — ranks the candidates,
   explains *why* each matched, classifies strength. A shared **contact
   identifier** = `strong` (blocks); a business-name-only collision = `moderate`
   (warns).

The create path calls **`crm.create_prospect(payload, override)`** (raw payload
only), which re-runs the strong-duplicate check server-side
(`crm.strong_duplicate_prospect`, also raw-in) and raises `DUPLICATE_BLOCKED`
unless `override` is passed — and only an admin may override, which writes a
`prospect.duplicate_override` audit row.

## 6. Data model

`crm` schema. Enums for the stable state sets (`staff_role`, `prospect_status`,
`activity_type`, `payment_status`); `text` + `CHECK` **domains** for the lists
that will grow (`prospect_source`, `business_category`).

```
auth.users ─1:1─ crm.staff ─┬─< crm.prospects >─┬─< crm.activities
                            │                   ├─< crm.prospect_status_history
                            │                   └─< crm.payments
                            └──────────────────────< crm.audit_log
```

- `crm.prospects` carries every field in spec §3 plus six **GENERATED**
  `*_normalized` columns and `converted_merchant_id` — a **bare uuid, not a
  cross-schema FK** — as the attribution hook to a real Kiosk merchant
  (spec §11, §25). A future automated signup match just populates that column.
- Money is stored as `amount_kobo bigint` (integer minor units) — no floats.
- All timestamps `timestamptz`. "Today" is computed in `Africa/Lagos`
  (`src/lib/time.ts`), matching the mobile app.

Full DDL: [`supabase/migrations/0001_crm_foundation.sql`](supabase/migrations/0001_crm_foundation.sql).

## 7. Module layout

```
src/
  constants/       pipeline, sources, categories, activity-types, roles, payments  (central enums — spec §3)
  lib/             supabase client, env, time (Lagos day boundaries), format, result
  types/           hand-written row types (replace with generated types post-apply)
  modules/
    auth/          AuthProvider + useAuth + route guards + LoginPage
    authorization/ permission matrix (mirrors RLS) + tests
    prospects/     normalization, duplicate-detection, pipeline guard, schemas (zod),
                   service (orchestration), repository (Supabase), query hooks, pages
    activities/    timeline component
    dashboard/     metric functions (pure) + repository + page
  components/       Currency, StampBadge, PipelineBar, AppLayout
  design/          ported Kiosk tokens + base stylesheet
```

Layering: **page → query hook → repository → Supabase/RLS**, and
**page → service → pure domain module**. No Supabase calls in components; no
business rules in components.

## 8. What's implemented in this build

| Area | State |
|---|---|
| Auth (email/password) + role-gated routes | ✅ |
| `crm` schema: tables, enums, RLS, triggers (SECURITY DEFINER for audit/history), RPCs, GENERATED normalized columns | ✅ applied to `kiosk-nonprod` (migrations `0001`–`0005`) and exercised by the integration harness |
| Prospect CRUD | ✅ create (with dup gate) / read / update / delete |
| Assignment + reassignment (admin) with audit | ✅ |
| Duplicate detection (normalize → search → rank → block/override) | ✅ |
| Pipeline status + transition rules + history | ✅ |
| Activity timeline + manual activity logging + notes | ✅ |
| Dashboard (pipeline counts, overview totals, today) | ✅ |
| **Funnel conversion metrics** (spec §9) | ✅ Phase 2 — `src/modules/analytics/funnel-metrics.ts`, on the dashboard, RLS-scoped |
| **Salesperson leaderboard** (spec §8) | ✅ Phase 2 — `crm.leaderboard()` RPC + `src/modules/analytics/leaderboard.ts`, `/leaderboard` |
| **Payments management** (spec §10) | ✅ Phase 2 — `src/modules/payments/*`; admin records/updates payments on the prospect detail page |
| **Follow-up reminder dashboard** (spec §6) | ✅ Phase 2 — `src/modules/followups/*`; Overdue / Due today / Upcoming on the dashboard + `/follow-ups` |
| **Prospect CSV export** (spec §21) | ✅ Phase 2 — `src/modules/export/*`; admin-only, honours the list filters, RFC-4180 |
| **Audit-log viewer** (spec §16) | ✅ Phase 2 — `src/modules/audit/*` at `/admin/audit` (admin only) |
| **Admin salesperson-management** (spec §15) | ✅ Phase 2 — `src/modules/staff/*` at `/admin/staff`; list + counts + activate/deactivate; create via the `crm-admin` edge function |
| Search + filters (status/source/category/salesperson/text) | ✅ |
| Dev seed (~60 prospects, 5 accounts, activities, payments, follow-ups) | ✅ run on `kiosk-nonprod` |
| Mobile-responsive layout | ✅ (sidebar → top nav, tables → cards) |
| Tests | ✅ 139 unit + 82 integration (8 harness files) |

**Not built:** commissions / commission payouts — spec §25 future integration.

### 8a. Analytics (Phase 2)

- **Funnel** (`funnel-metrics.ts`, pure + 14 tests). A prospect "reached" stage N
  if the *furthest* funnel rank it ever touched — current status ∪ every
  `prospect_status_history.to_status` — is ≥ N (monotonic; a status jump still
  counts the skipped stages; `lost` is not a stage). Conversion ratios each
  carry `{ numerator, denominator, rate }` so the denominator is explicit and
  a 0 denominator yields 0%, never NaN (spec §9). Computed client-side from
  RLS-scoped rows: whole team for an admin, own prospects for a salesperson.
- **Leaderboard** (`crm.leaderboard()` — `SECURITY DEFINER`, `is_active_staff()`
  guard; `leaderboard.ts`, pure + 9 tests). The RPC returns only the aggregate
  per `role = 'salesperson'`: `full_name`, `assigned_count`,
  `paid_count` (`paid_at` set), `confirmed_revenue_kobo` — **no prospect-level
  data**, so every rep can see the ranked board and their own position without
  read access to others' prospects (spec §8). Ranked by paid count, then
  revenue, then name; standard competition ranking (1, 2, 2, 4).

### 8b. Payments (Phase 2)

`src/modules/payments/*` — **no migration**: the `crm.payments` table + RLS
(`payments_insert` / `payments_update` gated to `is_admin()`, no delete policy)
already existed from Phase 1. V1 is manual entry by an admin from the prospect
detail page.

- `payment-money.ts` (pure + 6 tests) — naira ↔ integer **kobo**, round-half-up;
  `parseNairaInput` strips `₦`/commas/spaces.
- `payment-service.ts` (pure + 6 tests) — `buildPaymentRow` assembles the
  `crm.payments` row; attribution defaults to the prospect's current owner
  (stable id snapshot, spec §11), currency fixed `NGN`, status defaults `pending`.
- `RecordPaymentForm` + `PaymentStatusControl` — admin-only; a rep sees the
  payment list read-only. The `on_payment_insert` / `on_payment_update` DEFINER
  triggers write the `payment_received` activity + `payment.created` /
  `payment.updated` audit rows.
- Recording a payment does **not** move the pipeline status — payment tracking
  and the funnel stage are deliberately decoupled (spec §2 vs §10); the form
  says so. `confirmed` payments flow into the funnel/leaderboard revenue.

### 8c. Follow-ups / CSV / audit (Phase 2)

- **Follow-ups** (`followup-buckets.ts`, pure + 6 tests): Overdue / Due today /
  Upcoming on the Africa/Lagos day boundary; terminal (paid/lost) prospects are
  dropped. RLS-scoped; the admin view shows the owner.
- **CSV export** (`prospect-csv.ts`, pure + 9 tests): the exact spec §21
  16-column layout, RFC-4180 quoting, "Trial status" from `trial_started_at`,
  "Payment status" (Confirmed wins), "Revenue" = confirmed kobo → naira.
  `export-repository` honours the prospect-list filters; download is built
  client-side with a UTF-8 BOM. Button is admin-only.
- **Audit-log viewer** (`audit-format.ts`, pure + 6 tests): `/admin/audit`,
  admin only. `summarizeChange` turns the trigger-written `old_value`/`new_value`
  jsonb into `field: old → new` lines; the `crm.audit_log` `select` policy is
  `is_admin()` and there is no write policy.

### 8d. Admin salesperson-management (Phase 2, spec §15)

`src/modules/staff/*` at `/admin/staff` (under `<RequireAdmin>`).

- **`crm.staff_overview()`** (`0006`, `SECURITY DEFINER`, `is_admin()` guard):
  every staff row + assigned / active-prospect / paying / revenue counts.
- **Activate / deactivate**: a plain admin `UPDATE` on `crm.staff` (the
  `staff_update` policy allows it); the `stamp_staff_deactivation` +
  `on_staff_update` triggers set `deactivated_at` and write the audit row.
  Deactivating a rep with active prospects prompts a confirm ("reassign first";
  spec §15 keeps all history).
- **Create a salesperson**: the browser (anon key) can't create an `auth.users`
  row, so the **`crm-admin` edge function** (`supabase/functions/crm-admin`)
  does it with the service role — but only after `admin.auth.getUser(token)` +
  a `crm.staff` role check confirm the caller is an active admin. `0007` grants
  `service_role` access to the `crm` schema (a `CREATE SCHEMA` doesn't).
  `verify_jwt` is on. Client reads the JSON error off `error.context` for
  non-2xx responses.

### 8e. Polish pass (2026-09-02)

- **Top-level `ErrorBoundary`** (`src/components/ErrorBoundary.tsx`, wraps the
  whole tree in `App.tsx`): a render-time crash shows the error message + a
  Reload button instead of a blank screen (spec §29 — do not hide errors).
  Route-level *data* errors are still handled by each page's own `error` state;
  this is the last resort for the unexpected.
- Production-cleanup grep of `src/` is clean: no `console.*` in app code (only
  `ErrorBoundary.componentDidCatch`, deliberately), no `TODO`/`FIXME`, no
  `eslint-disable`, no placeholder buttons. `get_advisors` security = 0 findings
  on `crm.*`.

## 9. Known limitations / decisions to confirm

1. **~~Normalization is TypeScript-only.~~ RESOLVED.** Normalization now lives in
   immutable Postgres functions; the `*_normalized` columns are `GENERATED` from
   them and cannot be set by a client. `src/modules/prospects/normalization.ts`
   is a mirror for client-side hints and must be kept in parity (the 24 test
   vectors are the contract). Remaining nuance: parity is by convention, not
   enforced — a follow-up could add a CI check that runs both against the same
   vectors.
2. **Config lists as `CHECK` domains, not reference tables.** Adding a source or
   category is a one-line migration today. If you want runtime-editable lists,
   promote `prospect_source` / `business_category` to `crm.sources` /
   `crm.categories` tables.
3. **First admin bootstrap.** RLS requires an admin to create staff, so the first
   `crm.staff` admin row must be inserted out-of-band (the dev seed does this as
   the migration role). Production needs a documented one-time bootstrap step.
4. **Seed writes to `auth.users` directly.** The column set matches the GoTrue
   version on kiosk-nonprod (verified — the seed ran). It supplies raw identifier
   values only (normalized columns are GENERATED).
5. **`src/types/domain.ts` is still hand-written.** The schema is applied, so
   replace it with `supabase gen types typescript --schema crm` output.
6. **Bundle is one ~608 kB chunk.** Fine for an internal tool; route-level code
   splitting is a trivial later optimization.
7. **`converted_merchant_id` is unvalidated.** By design (decoupled), but there is
   no check that the uuid corresponds to a real merchant until the integration in
   spec §25 is built.

## 10. Recommended review checklist

- [ ] Confirm `kiosk-nonprod` is the right target and the additive `crm` schema
      is acceptable against the infra freeze.
- [ ] Confirm the authorization matrix in §4 matches intent (esp. attribution
      lock, payment immutability, salesperson visibility).
- [ ] Confirm the transition graph in `src/constants/pipeline.ts` (`paid` → only
      `lost`; permissive elsewhere).
- [ ] Decide on limitation #1 (generated normalized columns) before real data.
- [ ] Decide config-list strategy (limitation #2).
- [ ] Approve moving to the deferred feature set.
