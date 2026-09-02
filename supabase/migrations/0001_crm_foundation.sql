-- ============================================================================
--  Kiosk Sales CRM — foundation schema (Phase 1)
--
--  Everything lives in a dedicated `crm` schema. It is ADDITIVE: it creates no
--  objects outside `crm` except the row in `auth.users` each staff member needs
--  to sign in, and it never modifies the merchant app's tables, policies or Auth
--  configuration.
--
--  Authorization model
--  -------------------
--  A person can use the CRM only if they have an ACTIVE row in `crm.staff`
--  (keyed by their `auth.users.id`). A merchant-app auth user with no staff row
--  sees nothing here. Every table has row-level security; the policy predicates
--  are written to match `src/modules/authorization/permissions.ts` one-for-one.
--
--  Duplicate detection
--  -------------------
--  Identifier normalization is authoritative IN THE DATABASE: the `*_normalized`
--  columns on `crm.prospects` are GENERATED, computed by the `crm.normalize_*`
--  functions below, so a client cannot spoof them. `src/modules/prospects/
--  normalization.ts` mirrors these rules for instant client-side hints and must
--  stay in parity (shared test vectors live in normalization.test.ts).
-- ============================================================================

create schema if not exists crm;

-- --------------------------------------------------------------------------
--  Enums (stable state sets — mirror src/constants/*)
-- --------------------------------------------------------------------------
create type crm.staff_role as enum ('admin', 'salesperson');

create type crm.prospect_status as enum (
  'new', 'contacted', 'replied', 'demo', 'trial', 'paid', 'lost'
);

create type crm.activity_type as enum (
  'prospect_created',
  'prospect_assigned',
  'dm_sent',
  'whatsapp_sent',
  'phone_call',
  'email_sent',
  'reply_received',
  'demo_booked',
  'demo_completed',
  'trial_started',
  'follow_up',
  'payment_received',
  'status_changed',
  'note_added',
  'marked_lost'
);

create type crm.payment_status as enum ('pending', 'confirmed', 'refunded', 'failed');

-- Value lists that are expected to grow are stored as text + CHECK, not enums,
-- so a new source/category is a one-line constraint change (or, later, a
-- reference table) rather than an enum migration. Canonical copy: src/constants.
create domain crm.prospect_source as text
  check (value in (
    'instagram', 'whatsapp', 'tiktok', 'facebook', 'website',
    'referral', 'physical_outreach', 'market_association', 'distributor', 'other'
  ));

create domain crm.business_category as text
  check (value in (
    'provision_store', 'mini_mart', 'fashion', 'beauty', 'food',
    'electronics', 'pharmacy', 'general_retail', 'other'
  ));

-- --------------------------------------------------------------------------
--  Identifier normalizers (authoritative — drive the GENERATED columns).
--  These MUST stay in parity with src/modules/prospects/normalization.ts.
-- --------------------------------------------------------------------------
create or replace function crm.normalize_email(p text)
returns text language sql immutable set search_path = ''
as $$
  select nullif(lower(btrim(p)), '');
$$;

create or replace function crm.normalize_phone(p text)
returns text language plpgsql immutable set search_path = ''
as $$
declare
  v_trimmed text;
  v_had_plus boolean;
  v_digits text;
begin
  if p is null then return null; end if;
  v_trimmed := btrim(p);
  if v_trimmed = '' then return null; end if;

  v_had_plus := left(v_trimmed, 1) = '+';
  v_digits := regexp_replace(v_trimmed, '\D', '', 'g');
  if v_digits = '' then return null; end if;

  -- Local format 0XXXXXXXXXX (11 digits, leading 0).
  if not v_had_plus and length(v_digits) = 11 and left(v_digits, 1) = '0' then
    return '+234' || substr(v_digits, 2);
  end if;
  -- Country code without plus: 234XXXXXXXXXX (13 digits).
  if left(v_digits, 3) = '234' and length(v_digits) = 13 then
    return '+' || v_digits;
  end if;
  -- Bare subscriber number XXXXXXXXXX (10 digits).
  if not v_had_plus and length(v_digits) = 10 then
    return '+234' || v_digits;
  end if;

  return '+' || v_digits;
end;
$$;

create or replace function crm.normalize_instagram(p text)
returns text language plpgsql immutable set search_path = ''
as $$
declare v text;
begin
  if p is null then return null; end if;
  v := lower(btrim(p));
  if v = '' then return null; end if;

  v := regexp_replace(v, '^https?://', '', 'i');
  v := regexp_replace(v, '^www\.', '', 'i');
  v := regexp_replace(v, '^(m\.)?instagram\.com/', '', 'i');
  v := split_part(v, '?', 1);
  v := split_part(v, '#', 1);
  v := regexp_replace(v, '/+$', '');
  v := regexp_replace(v, '^@+', '');
  v := split_part(v, '/', 1);
  v := btrim(v);

  return nullif(v, '');
end;
$$;

create or replace function crm.normalize_website(p text)
returns text language plpgsql immutable set search_path = ''
as $$
declare v text;
begin
  if p is null then return null; end if;
  v := lower(btrim(p));
  if v = '' then return null; end if;

  v := regexp_replace(v, '^https?://', '', 'i');
  v := regexp_replace(v, '^www\.', '', 'i');
  v := split_part(v, '/', 1);
  v := split_part(v, '?', 1);
  v := split_part(v, '#', 1);
  v := regexp_replace(v, '/+$', '');

  return nullif(v, '');
end;
$$;

create or replace function crm.normalize_business_name(p text)
returns text language plpgsql immutable set search_path = ''
as $$
declare
  v text;
  w text;
  v_kept text[] := '{}';
  v_generic constant text[] := array[
    'ltd', 'limited', 'plc', 'inc', 'enterprise', 'enterprises',
    'ventures', 'nigeria', 'nig', 'ng', 'and', 'the'
  ];
begin
  if p is null then return null; end if;
  v := lower(p);
  v := regexp_replace(v, '[''’`]', '', 'g');   -- apostrophes elided, not spaced
  v := replace(v, '&', ' and ');
  v := regexp_replace(v, '[^a-z0-9[:space:]]', ' ', 'g');
  v := btrim(regexp_replace(v, '\s+', ' ', 'g'));
  if v = '' then return null; end if;

  foreach w in array string_to_array(v, ' ') loop
    if not (w = any (v_generic)) then
      v_kept := array_append(v_kept, w);
    end if;
  end loop;

  if array_length(v_kept, 1) is null then
    return v;  -- every word was generic; fall back to the unfiltered form
  end if;
  return array_to_string(v_kept, ' ');
end;
$$;

-- --------------------------------------------------------------------------
--  staff
-- --------------------------------------------------------------------------
create table crm.staff (
  id             uuid primary key references auth.users (id) on delete restrict,
  full_name      text not null check (length(btrim(full_name)) > 0),
  email          text not null check (length(btrim(email)) > 0),
  role           crm.staff_role not null default 'salesperson',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deactivated_at timestamptz
);

comment on table crm.staff is
  'Sales team. A row here (is_active = true) is the sole gate for CRM access.';

-- --------------------------------------------------------------------------
--  Authorization helpers (SECURITY DEFINER so they bypass RLS on crm.staff)
-- --------------------------------------------------------------------------
create or replace function crm.is_active_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from crm.staff s where s.id = auth.uid() and s.is_active
  );
$$;

create or replace function crm.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from crm.staff s
    where s.id = auth.uid() and s.is_active and s.role = 'admin'
  );
$$;

-- crm.can_access_prospect() is defined after crm.prospects (it references it).

create or replace function crm.is_system_activity_type(p_type crm.activity_type)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_type in (
    'prospect_created', 'prospect_assigned', 'trial_started',
    'payment_received', 'status_changed', 'note_added', 'marked_lost'
  );
$$;

-- --------------------------------------------------------------------------
--  prospects
-- --------------------------------------------------------------------------
create table crm.prospects (
  id                       uuid primary key default gen_random_uuid(),
  business_name            text not null check (length(btrim(business_name)) > 0),
  contact_name             text,
  phone                    text,
  email                    text,
  instagram_handle         text,
  whatsapp_number          text,
  website                  text,
  business_category        crm.business_category not null,
  location                 text,
  source                   crm.prospect_source not null,
  assigned_salesperson_id  uuid references crm.staff (id) on delete restrict,
  status                   crm.prospect_status not null default 'new',
  notes                    text,
  lost_reason              text,

  -- Normalized identifiers for duplicate detection — GENERATED, so they always
  -- reflect the raw columns and cannot be set or spoofed by a client.
  business_name_normalized text generated always as (crm.normalize_business_name(business_name)) stored,
  phone_normalized         text generated always as (crm.normalize_phone(phone)) stored,
  whatsapp_normalized      text generated always as (crm.normalize_phone(whatsapp_number)) stored,
  email_normalized         text generated always as (crm.normalize_email(email)) stored,
  instagram_normalized     text generated always as (crm.normalize_instagram(instagram_handle)) stored,
  website_normalized       text generated always as (crm.normalize_website(website)) stored,

  -- Attribution linkage to a real Kiosk merchant (spec §11). Deliberately NOT a
  -- cross-schema foreign key: kept as a bare uuid so the CRM stays decoupled and
  -- a future automated signup match just populates this column.
  converted_merchant_id    uuid,

  created_by               uuid not null references crm.staff (id) on delete restrict,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  last_contacted_at        timestamptz,
  next_follow_up_at        timestamptz,
  follow_up_note           text,
  trial_started_at         timestamptz,
  paid_at                  timestamptz,
  lost_at                  timestamptz,

  constraint prospects_lost_reason_required
    check (status <> 'lost' or (lost_reason is not null and length(btrim(lost_reason)) > 0)),

  -- Spec §14 — a prospect must carry at least one contact method.
  constraint prospects_at_least_one_contact check (
    coalesce(btrim(phone), '')            <> '' or
    coalesce(btrim(whatsapp_number), '')  <> '' or
    coalesce(btrim(email), '')            <> '' or
    coalesce(btrim(instagram_handle), '') <> '' or
    coalesce(btrim(website), '')          <> ''
  )
);

create index prospects_assigned_idx      on crm.prospects (assigned_salesperson_id);
create index prospects_status_idx        on crm.prospects (status);
create index prospects_created_at_idx    on crm.prospects (created_at desc);
create index prospects_next_follow_up_idx on crm.prospects (next_follow_up_at)
  where next_follow_up_at is not null;
create index prospects_phone_norm_idx    on crm.prospects (phone_normalized)     where phone_normalized is not null;
create index prospects_whatsapp_norm_idx on crm.prospects (whatsapp_normalized)  where whatsapp_normalized is not null;
create index prospects_email_norm_idx    on crm.prospects (email_normalized)     where email_normalized is not null;
create index prospects_instagram_norm_idx on crm.prospects (instagram_normalized) where instagram_normalized is not null;
create index prospects_website_norm_idx  on crm.prospects (website_normalized)   where website_normalized is not null;
create index prospects_business_norm_idx on crm.prospects (business_name_normalized) where business_name_normalized is not null;
create index prospects_converted_merchant_idx on crm.prospects (converted_merchant_id)
  where converted_merchant_id is not null;

-- Deferred from the helpers block above because it references crm.prospects.
create or replace function crm.can_access_prospect(p_prospect_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select crm.is_admin()
      or exists (
        select 1 from crm.prospects p
        where p.id = p_prospect_id
          and p.assigned_salesperson_id = auth.uid()
      );
$$;

-- --------------------------------------------------------------------------
--  prospect_status_history  (append-only; written only by trigger)
-- --------------------------------------------------------------------------
create table crm.prospect_status_history (
  id          uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references crm.prospects (id) on delete cascade,
  from_status crm.prospect_status,
  to_status   crm.prospect_status not null,
  changed_by  uuid references crm.staff (id) on delete set null,
  reason      text,
  created_at  timestamptz not null default now()
);
create index prospect_status_history_prospect_idx
  on crm.prospect_status_history (prospect_id, created_at);

-- --------------------------------------------------------------------------
--  activities  (append-only timeline; no update/delete ever)
-- --------------------------------------------------------------------------
create table crm.activities (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   uuid not null references crm.prospects (id) on delete cascade,
  user_id       uuid references crm.staff (id) on delete set null,
  activity_type crm.activity_type not null,
  description   text,
  created_at    timestamptz not null default now()
);
create index activities_prospect_idx on crm.activities (prospect_id, created_at desc);
create index activities_type_created_idx on crm.activities (activity_type, created_at desc);

-- --------------------------------------------------------------------------
--  payments  (financial record — never deleted; refund = status change)
-- --------------------------------------------------------------------------
create table crm.payments (
  id                        uuid primary key default gen_random_uuid(),
  prospect_id               uuid not null references crm.prospects (id) on delete restrict,
  -- Attribution snapshot captured at record time, by stable id (spec §11).
  attributed_salesperson_id uuid references crm.staff (id) on delete restrict,
  plan                      text not null check (length(btrim(plan)) > 0),
  amount_kobo               bigint not null check (amount_kobo >= 0),
  currency                  text not null default 'NGN' check (currency in ('NGN')),
  status                    crm.payment_status not null default 'pending',
  paid_on                   date not null,
  external_reference        text,   -- id of a future automated Kiosk payment event
  recorded_by               uuid not null references crm.staff (id) on delete restrict,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index payments_prospect_idx on crm.payments (prospect_id);
create index payments_attributed_idx on crm.payments (attributed_salesperson_id);
create index payments_status_idx on crm.payments (status);

-- --------------------------------------------------------------------------
--  audit_log  (admin-readable; written only by triggers / definer functions)
-- --------------------------------------------------------------------------
create table crm.audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references crm.staff (id) on delete set null,
  action       text not null,
  target_table text not null,
  target_id    uuid,
  old_value    jsonb,
  new_value    jsonb,
  created_at   timestamptz not null default now()
);
create index audit_log_target_idx on crm.audit_log (target_table, target_id, created_at desc);
create index audit_log_actor_idx on crm.audit_log (actor_id, created_at desc);

-- ============================================================================
--  Triggers
-- ============================================================================

-- updated_at maintenance -----------------------------------------------------
create or replace function crm.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger staff_set_updated_at
  before update on crm.staff
  for each row execute function crm.set_updated_at();

create trigger prospects_set_updated_at
  before update on crm.prospects
  for each row execute function crm.set_updated_at();

create trigger payments_set_updated_at
  before update on crm.payments
  for each row execute function crm.set_updated_at();

-- staff deactivation stamp --------------------------------------------------
create or replace function crm.stamp_staff_deactivation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_active = false and old.is_active = true then
    new.deactivated_at := now();
  elsif new.is_active = true then
    new.deactivated_at := null;
  end if;
  return new;
end;
$$;

create trigger staff_stamp_deactivation
  before update on crm.staff
  for each row execute function crm.stamp_staff_deactivation();

-- status-change guard + timestamp stamping -------------------------------
create or replace function crm.guard_prospect_status_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = old.status then
    return new;
  end if;

  -- Transition rules — must match canTransition() in src/constants/pipeline.ts.
  if new.status = 'lost' then
    null;                                   -- always allowed
  elsif old.status = 'lost' then
    null;                                   -- reactivation into any active stage
  elsif old.status = 'paid' then
    raise exception
      'Cannot move a converted prospect out of "paid" (only "paid" -> "lost" is allowed)';
  end if;

  -- Entry timestamps: set once, never cleared on a later backward move.
  if new.status = 'trial' and new.trial_started_at is null then
    new.trial_started_at := now();
  end if;
  if new.status = 'paid' and new.paid_at is null then
    new.paid_at := now();
  end if;
  if new.status = 'lost' then
    if new.lost_reason is null or length(btrim(new.lost_reason)) = 0 then
      raise exception 'A lost_reason is required when marking a prospect lost';
    end if;
    if new.lost_at is null then
      new.lost_at := now();
    end if;
  end if;

  return new;
end;
$$;

create trigger prospects_guard_status_change
  before update on crm.prospects
  for each row when (old.status is distinct from new.status)
  execute function crm.guard_prospect_status_change();

-- reassignment guard: only an admin may change attribution -------------
create or replace function crm.guard_prospect_assignment()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.assigned_salesperson_id is distinct from old.assigned_salesperson_id
     and not crm.is_admin() then
    raise exception 'Only an admin may assign or reassign a prospect';
  end if;
  return new;
end;
$$;

create trigger prospects_guard_assignment
  before update on crm.prospects
  for each row when (old.assigned_salesperson_id is distinct from new.assigned_salesperson_id)
  execute function crm.guard_prospect_assignment();

-- after-insert: seed the timeline + audit ------------------------------
create or replace function crm.on_prospect_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into crm.activities (prospect_id, user_id, activity_type, description)
  values (new.id, new.created_by, 'prospect_created',
          'Prospect created: ' || new.business_name);

  if new.assigned_salesperson_id is not null then
    insert into crm.activities (prospect_id, user_id, activity_type, description)
    values (new.id, new.created_by, 'prospect_assigned', 'Assigned on creation');
  end if;

  insert into crm.audit_log (actor_id, action, target_table, target_id, new_value)
  values (auth.uid(), 'prospect.created', 'crm.prospects', new.id, to_jsonb(new));

  return null;
end;
$$;

create trigger prospects_after_insert
  after insert on crm.prospects
  for each row execute function crm.on_prospect_insert();

-- after-update: history rows, timeline entries, audit ----------------
create or replace function crm.on_prospect_update()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_reason text := nullif(current_setting('crm.status_change_reason', true), '');
  v_assign_reason text := nullif(current_setting('crm.assignment_reason', true), '');
begin
  if new.status is distinct from old.status then
    insert into crm.prospect_status_history (prospect_id, from_status, to_status, changed_by, reason)
    values (new.id, old.status, new.status, auth.uid(), v_reason);

    insert into crm.activities (prospect_id, user_id, activity_type, description)
    values (new.id, auth.uid(), 'status_changed',
            format('Status %s -> %s%s', old.status, new.status,
                   case when v_reason is not null then ' (' || v_reason || ')' else '' end));

    if new.status = 'trial' then
      insert into crm.activities (prospect_id, user_id, activity_type, description)
      values (new.id, auth.uid(), 'trial_started', 'Trial started');
    elsif new.status = 'lost' then
      insert into crm.activities (prospect_id, user_id, activity_type, description)
      values (new.id, auth.uid(), 'marked_lost', coalesce(new.lost_reason, 'Marked lost'));
    end if;

    insert into crm.audit_log (actor_id, action, target_table, target_id, old_value, new_value)
    values (auth.uid(), 'prospect.status_changed', 'crm.prospects', new.id,
            jsonb_build_object('status', old.status),
            jsonb_build_object('status', new.status, 'reason', v_reason));
  end if;

  if new.assigned_salesperson_id is distinct from old.assigned_salesperson_id then
    insert into crm.activities (prospect_id, user_id, activity_type, description)
    values (new.id, auth.uid(), 'prospect_assigned',
            case
              when old.assigned_salesperson_id is null then 'Assigned'
              when new.assigned_salesperson_id is null then 'Unassigned'
              else 'Reassigned'
            end);

    insert into crm.audit_log (actor_id, action, target_table, target_id, old_value, new_value)
    values (auth.uid(),
            case when old.status = 'paid' then 'prospect.attribution_changed'
                 else 'prospect.assigned' end,
            'crm.prospects', new.id,
            jsonb_build_object('assigned_salesperson_id', old.assigned_salesperson_id,
                               'status', old.status),
            jsonb_build_object('assigned_salesperson_id', new.assigned_salesperson_id,
                               'reason', v_assign_reason));
  end if;

  return null;
end;
$$;

create trigger prospects_after_update
  after update on crm.prospects
  for each row execute function crm.on_prospect_update();

-- payments: timeline entry + audit -----------------------------------
create or replace function crm.on_payment_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into crm.activities (prospect_id, user_id, activity_type, description)
  values (new.prospect_id, auth.uid(), 'payment_received',
          format('Payment recorded: %s (%s kobo, %s)', new.plan, new.amount_kobo, new.status));

  insert into crm.audit_log (actor_id, action, target_table, target_id, new_value)
  values (auth.uid(), 'payment.created', 'crm.payments', new.id, to_jsonb(new));

  return null;
end;
$$;

create trigger payments_after_insert
  after insert on crm.payments
  for each row execute function crm.on_payment_insert();

create or replace function crm.on_payment_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into crm.audit_log (actor_id, action, target_table, target_id, old_value, new_value)
  values (auth.uid(), 'payment.updated', 'crm.payments', new.id, to_jsonb(old), to_jsonb(new));
  return null;
end;
$$;

create trigger payments_after_update
  after update on crm.payments
  for each row execute function crm.on_payment_update();

-- staff activation/deactivation audit ------------------------------
create or replace function crm.on_staff_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_active is distinct from old.is_active then
    insert into crm.audit_log (actor_id, action, target_table, target_id, old_value, new_value)
    values (auth.uid(),
            case when new.is_active then 'staff.activated' else 'staff.deactivated' end,
            'crm.staff', new.id,
            jsonb_build_object('is_active', old.is_active),
            jsonb_build_object('is_active', new.is_active));
  end if;
  if new.role is distinct from old.role then
    insert into crm.audit_log (actor_id, action, target_table, target_id, old_value, new_value)
    values (auth.uid(), 'staff.role_changed', 'crm.staff', new.id,
            jsonb_build_object('role', old.role), jsonb_build_object('role', new.role));
  end if;
  return null;
end;
$$;

create trigger staff_after_update
  after update on crm.staff
  for each row execute function crm.on_staff_update();

-- ============================================================================
--  Row-level security
-- ============================================================================
alter table crm.staff                   enable row level security;
alter table crm.prospects               enable row level security;
alter table crm.prospect_status_history enable row level security;
alter table crm.activities              enable row level security;
alter table crm.payments                enable row level security;
alter table crm.audit_log               enable row level security;

grant usage on schema crm to authenticated;
grant select, insert, update, delete on crm.prospects to authenticated;
grant select on crm.staff to authenticated;
grant insert, update on crm.staff to authenticated;      -- still gated to admin by policy
grant select on crm.prospect_status_history to authenticated;
grant select, insert on crm.activities to authenticated; -- insert gated to non-system + ownership
grant select, insert, update on crm.payments to authenticated; -- insert/update gated to admin
grant select on crm.audit_log to authenticated;

-- staff -------------------------------------------------------------
create policy staff_select on crm.staff for select to authenticated
  using (crm.is_admin() or id = auth.uid());

create policy staff_insert on crm.staff for insert to authenticated
  with check (crm.is_admin());

create policy staff_update on crm.staff for update to authenticated
  using (crm.is_admin()) with check (crm.is_admin());

-- prospects -------------------------------------------------------
create policy prospects_select on crm.prospects for select to authenticated
  using (crm.is_admin() or assigned_salesperson_id = auth.uid());

create policy prospects_insert on crm.prospects for insert to authenticated
  with check (
    crm.is_active_staff()
    and created_by = auth.uid()
    and (crm.is_admin() or assigned_salesperson_id = auth.uid())
  );

create policy prospects_update on crm.prospects for update to authenticated
  using (crm.is_admin() or assigned_salesperson_id = auth.uid())
  with check (crm.is_admin() or assigned_salesperson_id = auth.uid());

create policy prospects_delete on crm.prospects for delete to authenticated
  using (crm.is_admin());

-- prospect_status_history (read-only to clients; writes come from triggers) --
create policy status_history_select on crm.prospect_status_history for select to authenticated
  using (crm.can_access_prospect(prospect_id));

-- activities ----------------------------------------------------
create policy activities_select on crm.activities for select to authenticated
  using (crm.can_access_prospect(prospect_id));

create policy activities_insert on crm.activities for insert to authenticated
  with check (
    user_id = auth.uid()
    and crm.can_access_prospect(prospect_id)
    and not crm.is_system_activity_type(activity_type)
  );

-- payments ----------------------------------------------------
create policy payments_select on crm.payments for select to authenticated
  using (crm.is_admin() or crm.can_access_prospect(prospect_id));

create policy payments_insert on crm.payments for insert to authenticated
  with check (crm.is_admin());

create policy payments_update on crm.payments for update to authenticated
  using (crm.is_admin()) with check (crm.is_admin());
-- No delete policy: financial records are never deleted (spec §10, Kiosk constitution).

-- audit_log ---------------------------------------------------
create policy audit_log_select on crm.audit_log for select to authenticated
  using (crm.is_admin());
-- No write policy: only trigger / definer code writes here.

-- ============================================================================
--  RPCs
-- ============================================================================

-- Duplicate-candidate search (spec §4). Takes RAW identifier values and
-- normalizes them with the authoritative crm.normalize_* functions, so the
-- client never has to. SECURITY DEFINER so a salesperson learns "assigned to
-- Amaka" without gaining read access to Amaka's prospects. Returns only
-- non-sensitive columns; ranking + the human warning are done in
-- src/modules/prospects/duplicate-detection.ts.
create or replace function crm.find_duplicate_prospect_candidates(
  p_phone         text default null,
  p_whatsapp      text default null,
  p_email         text default null,
  p_instagram     text default null,
  p_website       text default null,
  p_business_name text default null,
  p_exclude_id    uuid default null
)
returns table (
  id uuid,
  business_name text,
  status crm.prospect_status,
  assigned_salesperson_name text,
  business_name_normalized text,
  phone_normalized text,
  whatsapp_normalized text,
  email_normalized text,
  instagram_normalized text,
  website_normalized text
)
language sql stable security definer set search_path = ''
as $$
  with n as (
    select
      crm.normalize_phone(p_phone)            as phone_n,
      crm.normalize_phone(p_whatsapp)         as whatsapp_n,
      crm.normalize_email(p_email)            as email_n,
      crm.normalize_instagram(p_instagram)    as instagram_n,
      crm.normalize_website(p_website)        as website_n,
      crm.normalize_business_name(p_business_name) as business_n
  )
  select
    p.id, p.business_name, p.status, s.full_name as assigned_salesperson_name,
    p.business_name_normalized, p.phone_normalized, p.whatsapp_normalized,
    p.email_normalized, p.instagram_normalized, p.website_normalized
  from crm.prospects p
  cross join n
  left join crm.staff s on s.id = p.assigned_salesperson_id
  where crm.is_active_staff()
    and (p_exclude_id is null or p.id <> p_exclude_id)
    and (
      (n.phone_n     is not null and (p.phone_normalized = n.phone_n or p.whatsapp_normalized = n.phone_n))
      or (n.whatsapp_n  is not null and (p.phone_normalized = n.whatsapp_n or p.whatsapp_normalized = n.whatsapp_n))
      or (n.email_n     is not null and p.email_normalized = n.email_n)
      or (n.instagram_n is not null and p.instagram_normalized = n.instagram_n)
      or (n.website_n   is not null and p.website_normalized = n.website_n)
      or (n.business_n  is not null and p.business_name_normalized = n.business_n)
    )
  limit 25;
$$;

-- True when an existing prospect shares a *contact identifier* (phone / whatsapp
-- / email / instagram / website) with the given RAW values. A business-name-only
-- collision is NOT strong. Matches hasBlockingDuplicate() / STRONG_FIELDS in
-- src/modules/prospects/duplicate-detection.ts.
create or replace function crm.strong_duplicate_prospect(
  p_phone text, p_whatsapp text, p_email text, p_instagram text, p_website text,
  p_exclude_id uuid default null
)
returns crm.prospects
language sql stable security definer set search_path = ''
as $$
  with n as (
    select
      crm.normalize_phone(p_phone)         as phone_n,
      crm.normalize_phone(p_whatsapp)      as whatsapp_n,
      crm.normalize_email(p_email)         as email_n,
      crm.normalize_instagram(p_instagram) as instagram_n,
      crm.normalize_website(p_website)     as website_n
  )
  select p.*
  from crm.prospects p
  cross join n
  where (p_exclude_id is null or p.id <> p_exclude_id)
    and (
      (n.phone_n     is not null and (p.phone_normalized = n.phone_n or p.whatsapp_normalized = n.phone_n))
      or (n.whatsapp_n  is not null and (p.phone_normalized = n.whatsapp_n or p.whatsapp_normalized = n.whatsapp_n))
      or (n.email_n     is not null and p.email_normalized = n.email_n)
      or (n.instagram_n is not null and p.instagram_normalized = n.instagram_n)
      or (n.website_n   is not null and p.website_normalized = n.website_n)
    )
  limit 1;
$$;

-- Create a prospect with a server-side duplicate gate (spec §4, §14). The
-- payload carries RAW fields only — normalized columns are GENERATED. A strong
-- duplicate is blocked unless p_override is passed, and only an admin may override.
create or replace function crm.create_prospect(p_payload jsonb, p_override boolean default false)
returns crm.prospects
language plpgsql security invoker set search_path = ''
as $$
declare
  v_row      crm.prospects;
  v_conflict crm.prospects;
begin
  if not crm.is_active_staff() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_conflict from crm.strong_duplicate_prospect(
    p_payload->>'phone',
    p_payload->>'whatsapp_number',
    p_payload->>'email',
    p_payload->>'instagram_handle',
    p_payload->>'website'
  );

  if v_conflict.id is not null then
    if not p_override then
      raise exception 'DUPLICATE_BLOCKED: matches existing prospect % (%).',
        v_conflict.business_name, v_conflict.id
        using errcode = 'P0001';
    end if;
    if not crm.is_admin() then
      raise exception 'Only an admin may override a duplicate warning' using errcode = '42501';
    end if;
  end if;

  insert into crm.prospects (
    business_name, contact_name, phone, email, instagram_handle, whatsapp_number,
    website, business_category, location, source, assigned_salesperson_id, status,
    notes, next_follow_up_at, follow_up_note, created_by
  )
  values (
    p_payload->>'business_name',
    p_payload->>'contact_name',
    p_payload->>'phone',
    p_payload->>'email',
    p_payload->>'instagram_handle',
    p_payload->>'whatsapp_number',
    p_payload->>'website',
    p_payload->>'business_category',
    p_payload->>'location',
    p_payload->>'source',
    coalesce((p_payload->>'assigned_salesperson_id')::uuid, auth.uid()),
    coalesce((p_payload->>'status')::crm.prospect_status, 'new'),
    p_payload->>'notes',
    (p_payload->>'next_follow_up_at')::timestamptz,
    p_payload->>'follow_up_note',
    auth.uid()
  )
  returning * into v_row;

  if v_conflict.id is not null and p_override then
    insert into crm.audit_log (actor_id, action, target_table, target_id, new_value)
    values (auth.uid(), 'prospect.duplicate_override', 'crm.prospects', v_row.id,
            jsonb_build_object('matched_prospect_id', v_conflict.id));
  end if;

  return v_row;
end;
$$;

-- Change status through a reason channel the trigger can read.
create or replace function crm.change_prospect_status(
  p_prospect_id uuid, p_to crm.prospect_status, p_reason text default null
)
returns crm.prospects
language plpgsql security invoker set search_path = ''
as $$
declare v_row crm.prospects;
begin
  perform set_config('crm.status_change_reason', coalesce(p_reason, ''), true);
  update crm.prospects set status = p_to where id = p_prospect_id returning * into v_row;
  if v_row.id is null then
    raise exception 'Prospect not found or not permitted' using errcode = '42501';
  end if;
  return v_row;
end;
$$;

-- Assign / reassign (admin only — enforced by crm.guard_prospect_assignment).
create or replace function crm.assign_prospect(
  p_prospect_id uuid, p_salesperson_id uuid, p_reason text default null
)
returns crm.prospects
language plpgsql security invoker set search_path = ''
as $$
declare v_row crm.prospects;
begin
  perform set_config('crm.assignment_reason', coalesce(p_reason, ''), true);
  update crm.prospects set assigned_salesperson_id = p_salesperson_id
   where id = p_prospect_id returning * into v_row;
  if v_row.id is null then
    raise exception 'Prospect not found or not permitted' using errcode = '42501';
  end if;
  return v_row;
end;
$$;

-- Log a manual outreach activity; also advances last_contacted_at for contact types.
create or replace function crm.log_activity(
  p_prospect_id uuid, p_type crm.activity_type, p_description text default null
)
returns crm.activities
language plpgsql security invoker set search_path = ''
as $$
declare v_row crm.activities;
begin
  if crm.is_system_activity_type(p_type) then
    raise exception 'That activity type is system-managed and cannot be logged manually';
  end if;

  insert into crm.activities (prospect_id, user_id, activity_type, description)
  values (p_prospect_id, auth.uid(), p_type, p_description)
  returning * into v_row;

  if p_type in ('dm_sent', 'whatsapp_sent', 'phone_call', 'email_sent') then
    update crm.prospects set last_contacted_at = now() where id = p_prospect_id;
  end if;

  return v_row;
end;
$$;

-- Add an internal note (system activity type -> needs definer, but access-checked).
create or replace function crm.add_prospect_note(p_prospect_id uuid, p_note text)
returns crm.activities
language plpgsql security definer set search_path = ''
as $$
declare v_row crm.activities;
begin
  if not crm.can_access_prospect(p_prospect_id) then
    raise exception 'Not authorized for this prospect' using errcode = '42501';
  end if;
  if p_note is null or length(btrim(p_note)) = 0 then
    raise exception 'Note text is required';
  end if;

  insert into crm.activities (prospect_id, user_id, activity_type, description)
  values (p_prospect_id, auth.uid(), 'note_added', btrim(p_note))
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function
  crm.find_duplicate_prospect_candidates(text, text, text, text, text, text, uuid),
  crm.strong_duplicate_prospect(text, text, text, text, text, uuid),
  crm.create_prospect(jsonb, boolean),
  crm.change_prospect_status(uuid, crm.prospect_status, text),
  crm.assign_prospect(uuid, uuid, text),
  crm.log_activity(uuid, crm.activity_type, text),
  crm.add_prospect_note(uuid, text)
to authenticated;

-- Normalizers are safe to expose (pure, no data access) and handy for tests.
grant execute on function
  crm.normalize_email(text), crm.normalize_phone(text), crm.normalize_instagram(text),
  crm.normalize_website(text), crm.normalize_business_name(text)
to authenticated;

-- ============================================================================
--  Lock the anon role out of the CRM entirely (runs last so it covers every
--  object created above, including functions that default-grant EXECUTE to PUBLIC).
-- ============================================================================
revoke all on all tables in schema crm from anon;
revoke all on all routines in schema crm from anon;
revoke all on all sequences in schema crm from anon;
