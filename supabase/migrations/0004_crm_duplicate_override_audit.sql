-- ============================================================================
--  Kiosk Sales CRM — fix: the duplicate-override audit row.
--
--  0003 routed create_prospect's override audit write through crm.record_audit(),
--  but create_prospect is SECURITY INVOKER (so RLS still enforces self-assignment)
--  and record_audit's EXECUTE is revoked from `authenticated` — so the call fails
--  with "permission denied for function record_audit".
--
--  Fix: use the same session-variable channel the status-change reason already
--  uses. create_prospect sets `crm.duplicate_override_of`; the DEFINER
--  on_prospect_insert trigger writes the audit row. No externally callable
--  audit-writer function.
-- ============================================================================

drop function if exists crm.record_audit(text, text, uuid, jsonb, jsonb);

create or replace function crm.on_prospect_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_override_of text := nullif(current_setting('crm.duplicate_override_of', true), '');
begin
  insert into crm.activities (prospect_id, user_id, activity_type, description)
  values (new.id, new.created_by, 'prospect_created', 'Prospect created: ' || new.business_name);

  if new.assigned_salesperson_id is not null then
    insert into crm.activities (prospect_id, user_id, activity_type, description)
    values (new.id, new.created_by, 'prospect_assigned', 'Assigned on creation');
  end if;

  insert into crm.audit_log (actor_id, action, target_table, target_id, new_value)
  values (auth.uid(), 'prospect.created', 'crm.prospects', new.id, to_jsonb(new));

  if v_override_of is not null then
    insert into crm.audit_log (actor_id, action, target_table, target_id, new_value)
    values (auth.uid(), 'prospect.duplicate_override', 'crm.prospects', new.id,
            jsonb_build_object('matched_prospect_id', v_override_of));
  end if;

  return null;
end;
$$;

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
    perform set_config('crm.duplicate_override_of', v_conflict.id::text, true);
  else
    perform set_config('crm.duplicate_override_of', '', true);
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

  return v_row;
end;
$$;

grant execute on function crm.create_prospect(jsonb, boolean) to authenticated;
