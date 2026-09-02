-- ============================================================================
--  Kiosk Sales CRM — expose the `crm` schema to the PostgREST API.
--
--  PostgREST only serves allow-listed schemas. Without this, every REST call and
--  RPC against `crm` fails with `PGRST106: Invalid schema: crm`.
--
--  Additive to the project's existing exposed schemas (public, graphql_public).
--  Reversible: `alter role authenticator reset pgrst.db_schemas;`
--
--  (On Supabase this is equivalent to Dashboard → Project Settings → API →
--  Exposed schemas → add `crm`.)
-- ============================================================================

alter role authenticator set pgrst.db_schemas = 'public, graphql_public, crm';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
