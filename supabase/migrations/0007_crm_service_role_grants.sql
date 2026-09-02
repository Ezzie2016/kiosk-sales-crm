-- ============================================================================
--  Kiosk Sales CRM — grant the service_role access to the `crm` schema.
--
--  The `crm-admin` edge function uses the service role to create an auth user +
--  the crm.staff row (spec §15). CREATE SCHEMA only grants USAGE to the owner,
--  so the service role was getting "permission denied for table staff". The
--  service role is the trusted backend identity (it bypasses RLS), so a broad
--  grant on this additive schema is the standard, safe move.
-- ============================================================================

grant usage on schema crm to service_role;
grant all privileges on all tables in schema crm to service_role;
grant all privileges on all sequences in schema crm to service_role;
grant all privileges on all routines in schema crm to service_role;

alter default privileges in schema crm grant all on tables to service_role;
alter default privileges in schema crm grant all on sequences to service_role;
alter default privileges in schema crm grant all on routines to service_role;
