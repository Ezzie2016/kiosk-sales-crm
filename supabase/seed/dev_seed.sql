-- ============================================================================
--  DEV SEED — Kiosk Sales CRM
--
--  DO NOT RUN AGAINST PRODUCTION. All accounts use @example.test addresses and a
--  shared throwaway password. Intended for a local stack or kiosk-nonprod after
--  0001_crm_foundation.sql has been applied and reviewed.
--
--  Creates: 5 test accounts (see below), ~60 prospects spread across every
--  pipeline stage / source / category, their creation + assignment timeline
--  entries (via triggers), a batch of manual activities, follow-ups (due /
--  overdue / upcoming), trials, confirmed payments, and lost prospects.
--
--  Re-runnable: it deletes and recreates the seed accounts + everything they own.
-- ============================================================================

-- ---- clean previous seed --------------------------------------------------
do $$
declare v_ids uuid[];
begin
  select array_agg(id) into v_ids from auth.users
   where email like '%@example.test';
  if v_ids is not null then
    delete from crm.payments  where recorded_by = any(v_ids) or attributed_salesperson_id = any(v_ids);
    delete from crm.prospects where created_by = any(v_ids);
    delete from crm.audit_log where actor_id = any(v_ids);
    delete from crm.staff     where id = any(v_ids);
    delete from auth.users    where id = any(v_ids);
  end if;
end $$;

-- ---- staff + auth accounts ---------------------------------------------
--  Fixed UUIDs so the rest of the script can reference them.
--  All five accounts share the password "kiosk-dev-1234".
--
--    admin   11111111-…-111111111111  admin@example.test    admin,        active
--    amaka   22222222-…-222222222222  amaka@example.test    salesperson,  active   (salesperson A)
--    david   33333333-…-333333333333  david@example.test    salesperson,  active   (salesperson B)
--    chidi   44444444-…-444444444444  chidi@example.test    salesperson,  DEACTIVATED
--    nostaff 55555555-…-555555555555  nostaff@example.test  auth user with NO crm.staff row
do $$
declare
  v_pw text := crypt('kiosk-dev-1234', gen_salt('bf'));
  v_now timestamptz := now();
  r record;
begin
  for r in
    select * from (values
      ('11111111-1111-1111-1111-111111111111'::uuid, 'admin@example.test',   'Bola Admin',   'admin',       true,  true),
      ('22222222-2222-2222-2222-222222222222'::uuid, 'amaka@example.test',   'Amaka Nwosu',  'salesperson', true,  true),
      ('33333333-3333-3333-3333-333333333333'::uuid, 'david@example.test',   'David Okon',   'salesperson', true,  true),
      ('44444444-4444-4444-4444-444444444444'::uuid, 'chidi@example.test',   'Chidi Eze',    'salesperson', true,  false),
      ('55555555-5555-5555-5555-555555555555'::uuid, 'nostaff@example.test', 'No Staff Row', 'salesperson', false, false)
    ) as t(id, email, full_name, role, has_staff, is_active)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    values (
      '00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated',
      r.email, v_pw, v_now, v_now, v_now,
      '{"provider":"email","providers":["email"]}', '{}',
      '', '', '', ''
    );

    if r.has_staff then
      insert into crm.staff (id, full_name, email, role, is_active, deactivated_at)
      values (
        r.id, r.full_name, r.email, r.role::crm.staff_role, r.is_active,
        case when r.is_active then null else v_now end
      );
    end if;
  end loop;
end $$;

-- ---- prospects ------------------------------------------------------
--  Built from generate_series so the volume is obvious dev data. Distribution is
--  deterministic from the row number.
do $$
declare
  v_admin uuid := '11111111-1111-1111-1111-111111111111';
  v_amaka uuid := '22222222-2222-2222-2222-222222222222';
  v_david uuid := '33333333-3333-3333-3333-333333333333';
  v_sources  text[] := array['instagram','whatsapp','tiktok','facebook','website','referral','physical_outreach','market_association','distributor','other'];
  v_cats     text[] := array['provision_store','mini_mart','fashion','beauty','food','electronics','pharmacy','general_retail','other'];
  v_locations text[] := array['Lagos - Ikeja','Lagos - Surulere','Lagos - Yaba','Abuja - Wuse','Abuja - Garki','Port Harcourt','Ibadan - Ring Road','Kano - Sabon Gari','Enugu - New Haven','Benin City'];
  v_statuses text[] := array['new','new','new','contacted','contacted','contacted','replied','replied','demo','demo','trial','trial','paid','paid','lost','lost','lost'];
  n int;
  v_status text;
  v_owner uuid;
  v_created timestamptz;
  v_phone text;
  v_id uuid;
  v_payload jsonb;
begin
  for n in 1..60 loop
    v_status := v_statuses[1 + (n % array_length(v_statuses, 1))];
    v_owner  := case when n % 3 = 0 then v_david when n % 3 = 1 then v_amaka else v_amaka end;
    -- leave a few unassigned for the admin queue
    if n % 11 = 0 then v_owner := null; end if;
    v_created := now() - ((90 - n) || ' days')::interval - ((n % 24) || ' hours')::interval;
    v_phone := '080' || lpad(((n * 37) % 100000000)::text, 8, '0');

    v_payload := jsonb_build_object(
      'business_name', 'Dev Store ' || n,
      'contact_name',  'Owner ' || n,
      'phone',         v_phone,
      'whatsapp_number', case when n % 4 = 0 then v_phone else null end,
      'email',         case when n % 3 = 0 then 'store' || n || '@example.test' else null end,
      'instagram_handle', case when n % 2 = 0 then '@devstore' || n else null end,
      'website',       case when n % 7 = 0 then 'devstore' || n || '.example' else null end,
      'business_category', v_cats[1 + (n % array_length(v_cats, 1))],
      'location',      v_locations[1 + (n % array_length(v_locations, 1))],
      'source',        v_sources[1 + (n % array_length(v_sources, 1))],
      'assigned_salesperson_id', v_owner,
      'status', 'new'
    );

    -- Insert directly (bypassing crm.create_prospect's auth checks — this DO block
    -- runs as the migration role). The *_normalized columns are GENERATED, so we
    -- only supply raw values; triggers still fire and build the timeline.
    insert into crm.prospects (
      business_name, contact_name, phone, whatsapp_number, email, instagram_handle, website,
      business_category, location, source, assigned_salesperson_id, status,
      created_by, created_at
    )
    select
      v_payload->>'business_name', v_payload->>'contact_name', v_payload->>'phone',
      v_payload->>'whatsapp_number', v_payload->>'email', v_payload->>'instagram_handle',
      v_payload->>'website', (v_payload->>'business_category')::crm.business_category,
      v_payload->>'location', (v_payload->>'source')::crm.prospect_source, v_owner, 'new',
      coalesce(v_owner, v_admin), v_created
    returning id into v_id;

    -- Walk the prospect up to its target status so history + stamps are realistic.
    if v_status <> 'new' then
      if v_status = 'lost' then
        update crm.prospects
           set status = 'lost', lost_reason = 'Not interested (dev seed)', lost_at = v_created + interval '5 days'
         where id = v_id;
      else
        update crm.prospects set status = v_status::crm.prospect_status where id = v_id;
      end if;
    end if;

    -- Follow-ups: mix of overdue / due today / upcoming for active prospects.
    if v_status in ('contacted','replied','demo','trial') then
      update crm.prospects
         set next_follow_up_at = case (n % 3)
               when 0 then now() - interval '2 days'      -- overdue
               when 1 then date_trunc('day', now()) + interval '15 hours'  -- due today
               else now() + interval '3 days'             -- upcoming
             end,
             follow_up_note = 'Follow up re: pricing (dev seed)',
             last_contacted_at = v_created + interval '1 day'
       where id = v_id;
    end if;

    -- A few manual activities for texture.
    insert into crm.activities (prospect_id, user_id, activity_type, description, created_at)
    select v_id, coalesce(v_owner, v_admin), t.atype::crm.activity_type, t.descr, v_created + t.offs
    from (values
      ('dm_sent',        'Sent intro DM',                 interval '2 hours'),
      ('reply_received', 'Owner replied, wants a demo',    interval '1 day'),
      ('phone_call',     'Called to schedule demo',        interval '2 days')
    ) as t(atype, descr, offs)
    where v_status in ('replied','demo','trial','paid');

    -- Confirmed payment for paid prospects.
    if v_status = 'paid' then
      update crm.prospects set converted_merchant_id = gen_random_uuid() where id = v_id;
      insert into crm.payments (
        prospect_id, attributed_salesperson_id, plan, amount_kobo, currency, status, paid_on, recorded_by
      )
      values (
        v_id, v_owner, (array['Starter','Growth','Pro'])[1 + (n % 3)],
        (array[500000, 1500000, 3500000])[1 + (n % 3)], 'NGN', 'confirmed',
        (v_created + interval '10 days')::date, v_admin
      );
    end if;
  end loop;
end $$;

-- ---- summary ------------------------------------------------------
do $$
declare v_p int; v_pay int; v_act int;
begin
  select count(*) into v_p from crm.prospects where created_by in (
    '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');
  select count(*) into v_pay from crm.payments;
  select count(*) into v_act from crm.activities;
  raise notice 'Dev seed complete: % prospects, % payments, % activities.', v_p, v_pay, v_act;
end $$;
