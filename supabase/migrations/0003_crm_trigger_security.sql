-- ============================================================================
--  Kiosk Sales CRM — fix: trigger functions that write system rows must be
--  SECURITY DEFINER.
--
--  Found by the Phase 1 verification harness. The AFTER triggers write
--  `crm.activities` rows with *system* activity types and `crm.audit_log` rows.
--  As SECURITY INVOKER they run as the calling `authenticated` user and are
--  rejected by RLS:
--    - crm.activities: `activities_insert` WITH CHECK forbids system types
--    - crm.audit_log:  no INSERT policy at all
--  which made `crm.create_prospect` fail with "new row violates row-level
--  security policy".
--
--  Fix: these functions run as the table owner (postgres, BYPASSRLS) so the
--  bookkeeping writes always succeed. `auth.uid()` still resolves to the request
--  JWT. The user-facing UPDATE/INSERT that fires them stays SECURITY INVOKER, so
--  RLS still decides *which* row a caller may touch.
-- ============================================================================

-- Central, RLS-bypassing audit writer (used by create_prospect's override path).
create or replace function crm.record_audit(
  p_action text, p_target_table text, p_target_id uuid,
  p_old jsonb default null, p_new jsonb default null
)
returns void
language sql security definer set search_path = ''
as $$
  insert into crm.audit_log (actor_id, action, target_table, target_id, old_value, new_value)
  values (auth.uid(), p_action, p_target_table, p_target_id, p_old, p_new);
$$;
revoke all on function crm.record_audit(text, text, uuid, jsonb, jsonb) from public, anon, authenticated;

-- --------------------------------------------------------------------------
--  Trigger functions — now SECURITY DEFINER (bodies unchanged otherwise).
-- --------------------------------------------------------------------------
create or replace function crm.on_prospect_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
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

create or replace function crm.on_prospect_update()
returns trigger language plpgsql security definer set search_path = '' as $$
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

create or replace function crm.on_payment_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into crm.activities (prospect_id, user_id, activity_type, description)
  values (new.prospect_id, auth.uid(), 'payment_received',
          format('Payment recorded: %s (%s kobo, %s)', new.plan, new.amount_kobo, new.status));

  insert into crm.audit_log (actor_id, action, target_table, target_id, new_value)
  values (auth.uid(), 'payment.created', 'crm.payments', new.id, to_jsonb(new));

  return null;
end;
$$;

create or replace function crm.on_payment_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into crm.audit_log (actor_id, action, target_table, target_id, old_value, new_value)
  values (auth.uid(), 'payment.updated', 'crm.payments', new.id, to_jsonb(old), to_jsonb(new));
  return null;
end;
$$;

create or replace function crm.on_staff_update()
returns trigger language plpgsql security definer set search_path = '' as $$
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

-- --------------------------------------------------------------------------
--  create_prospect: keep SECURITY INVOKER (so RLS WITH CHECK still enforces
--  self-assignment), but route its override audit row through record_audit().
-- --------------------------------------------------------------------------
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
    coalesce(nullif(p_payload->>'assigned_salesperson_id', '')::uuid, auth.uid()),
    coalesce(nullif(p_payload->>'status', '')::crm.prospect_status, 'new'),
    p_payload->>'notes',
    nullif(p_payload->>'next_follow_up_at', '')::timestamptz,
    p_payload->>'follow_up_note',
    auth.uid()
  )
  returning * into v_row;

  if v_conflict.id is not null and p_override then
    perform crm.record_audit('prospect.duplicate_override', 'crm.prospects', v_row.id,
                             null, jsonb_build_object('matched_prospect_id', v_conflict.id));
  end if;

  return v_row;
end;
$$;

grant execute on function crm.create_prospect(jsonb, boolean) to authenticated;
