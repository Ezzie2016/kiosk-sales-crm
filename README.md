# Kiosk Sales CRM

Internal sales CRM for Kiosk, tracks prospects from first outreach to paying
merchant, assigns ownership to salespeople, and prevents duplicate outreach.

Separate application from the Kiosk merchant mobile app. See
[`ARCHITECTURE.md`](ARCHITECTURE.md) for the design and the current review gate.

## Requirements

- Node 20+ (developed on Node 26)
- A Supabase project with the `crm` schema applied (see below)

## Setup

```bash
npm install
cp .env.example .env      # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc -b`) + production build |
| `npm run typecheck` | Types only |
| `npm run lint` | ESLint |
| `npm test` | Vitest (unit tests for the business logic) |

## Backend

The schema is **not applied automatically.** After review:

```bash
# apply to kiosk-nonprod (via Supabase CLI, MCP, or the SQL editor)
supabase db execute -f supabase/migrations/0001_crm_foundation.sql

# dev data (local stack or nonprod ONLY — creates @example.test accounts)
supabase db execute -f supabase/seed/dev_seed.sql
```

Dev sign-in after seeding (password `kiosk-dev-1234` for all):

- `admin@example.test` — admin
- `amaka@example.test` — salesperson
- `david@example.test` — salesperson

After applying, regenerate the row types and replace `src/types/domain.ts`:

```bash
supabase gen types typescript --schema crm --project-id porjrpfvdadancwyeeix > src/types/database.ts
```

## Layout

Business logic lives in `src/modules/*/` (services + pure domain modules), never
in components. Authorization is enforced by Postgres row-level security in the
`crm` schema; `src/modules/authorization/permissions.ts` only mirrors it to gate
the UI.
