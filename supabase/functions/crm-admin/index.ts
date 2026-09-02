// Kiosk Sales CRM — admin-only edge function (spec §15).
//
// Creating a salesperson needs an auth.users row, which the browser (anon key)
// cannot do. This function runs with the service role, but ONLY after verifying
// the caller is an active admin in crm.staff.
//
// POST { action: "create_salesperson", email, full_name, password }
//   -> creates the auth user (email pre-confirmed) + the crm.staff row (role
//      'salesperson', active) and returns the staff row.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Missing bearer token' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Identify the caller by validating their JWT with the service role.
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'Invalid token' }, 401);

  // Verify the caller is an active admin.
  const { data: staffRow } = await admin
    .schema('crm')
    .from('staff')
    .select('role, is_active')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!staffRow || staffRow.is_active !== true || staffRow.role !== 'admin') {
    return json({ error: 'Admin access required' }, 403);
  }

  let payload: { action?: string; email?: string; full_name?: string; password?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (payload.action !== 'create_salesperson') {
    return json({ error: `Unknown action: ${payload.action ?? '(none)'}` }, 400);
  }

  const email = (payload.email ?? '').trim().toLowerCase();
  const fullName = (payload.full_name ?? '').trim();
  const password = payload.password ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Valid email required' }, 400);
  if (fullName.length < 2) return json({ error: 'Full name required' }, 400);
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    return json({ error: createError?.message ?? 'Could not create user' }, 400);
  }

  const { data: staff, error: staffError } = await admin
    .schema('crm')
    .from('staff')
    .insert({ id: created.user.id, full_name: fullName, email, role: 'salesperson', is_active: true })
    .select()
    .single();
  if (staffError) {
    // Roll back the auth user so a retry is clean.
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: staffError.message }, 400);
  }

  return json({ staff });
});
