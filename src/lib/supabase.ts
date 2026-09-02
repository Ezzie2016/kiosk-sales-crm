import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * The one Supabase client for the app. It only ever holds the anon/publishable
 * key — every authorization decision is made by row-level security in the `crm`
 * schema, so this client can only read and write what the signed-in staff member
 * is permitted to.
 *
 * `db.schema('crm')` scopes PostgREST calls to the CRM schema by default.
 */
export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  db: { schema: 'crm' },
});

/** Client scoped to the default `public` schema, for the rare cross-schema read. */
export const supabasePublic = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
