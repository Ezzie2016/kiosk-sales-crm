# Phase 1 verification harnesses

Two files, run by `npm run test:integration` against a **live, non-production**
Supabase project (not part of `npm test`):

- **`phase1.integration.test.ts`** (41) — the security-critical surface: auth +
  row-level security + duplicate detection, driven through the Supabase client
  as five anon auth sessions.
- **`phase1-ui.integration.test.ts`** (15) — the checklist §11 browser
  walkthrough, executed headlessly (jsdom): renders the real React pages
  (Router + AuthProvider + the app's Supabase client) and signs in as each
  seeded account. Uses `fireEvent.submit` for the create form (a jsdom +
  userEvent v14 quirk; the app submits normally in a real browser).

## Run it

```bash
# 1. Apply the schema + seed to a NON-PROD project (kiosk-nonprod):
#    supabase/migrations/0001_crm_foundation.sql
#    supabase/seed/dev_seed.sql

# 2. Point env at that project (a .env file works, or inline vars):
#    VITE_APP_ENV=development
#    VITE_SUPABASE_URL=https://<nonprod-ref>.supabase.co
#    VITE_SUPABASE_ANON_KEY=<nonprod anon key>

npm run test:integration
```

## Safety

The harness **refuses to run** if `VITE_APP_ENV` is `production` or if
`VITE_SUPABASE_URL` contains the Kiosk production project ref. It only ever uses
the anon key + password sign-in.

## What it does to the database

- Signs in as five seeded accounts: `admin@`, `amaka@` (salesperson A),
  `david@` (salesperson B), `chidi@` (deactivated), `nostaff@` (no `crm.staff` row).
- Creates prospects as fixtures and deletes them in `afterAll` — **except** the
  one `pay` prospect the RLS harness pins with an undeletable payment (spec §10).
- Appends rows to `crm.audit_log` / `crm.activities` (append-only by design).
- Reset non-prod to the seed baseline any time:
  ```sql
  delete from crm.payments  where prospect_id in (select id from crm.prospects where business_name not like 'Dev Store %');
  delete from crm.prospects where business_name not like 'Dev Store %';
  ```

## Credentials

Defaults match `supabase/seed/dev_seed.sql`. Override with env vars if needed:
`QA_PASSWORD`, `QA_ADMIN_EMAIL`, `QA_SALES_A_EMAIL`, `QA_SALES_B_EMAIL`,
`QA_DEACTIVATED_EMAIL`, `QA_NOSTAFF_EMAIL`.

See [`docs/qa/PHASE-1-QA-CHECKLIST.md`](../../docs/qa/PHASE-1-QA-CHECKLIST.md) for
the full checklist this harness supports, plus the manual browser smoke-test.
