-- ============================================================================
--  Kiosk Sales CRM — staff overview for the admin management page (spec §15).
--
--  Admin-only aggregate: every crm.staff row + assigned / active / paying /
--  revenue counts. SECURITY DEFINER with an is_admin() guard.
--
--  Activate / deactivate needs no RPC: an admin's plain UPDATE on crm.staff is
--  allowed by the `staff_update` policy, and the stamp_staff_deactivation +
--  on_staff_update triggers handle deactivated_at and the audit row.
-- ============================================================================

create or replace function crm.staff_overview()
returns table (
  id uuid,
  full_name text,
  email text,
  role crm.staff_role,
  is_active boolean,
  deactivated_at timestamptz,
  assigned_count int,
  active_prospect_count int,
  paid_count int,
  confirmed_revenue_kobo bigint
)
language sql stable security definer set search_path = ''
as $$
  select
    s.id,
    s.full_name,
    s.email,
    s.role,
    s.is_active,
    s.deactivated_at,
    coalesce(pc.assigned_count, 0)::int          as assigned_count,
    coalesce(pc.active_count, 0)::int            as active_prospect_count,
    coalesce(pc.paid_count, 0)::int              as paid_count,
    coalesce(rev.revenue, 0)::bigint             as confirmed_revenue_kobo
  from crm.staff s
  left join lateral (
    select
      count(*)                                                              as assigned_count,
      count(*) filter (where p.status in ('new','contacted','replied','demo','trial')) as active_count,
      count(*) filter (where p.paid_at is not null)                         as paid_count
    from crm.prospects p
    where p.assigned_salesperson_id = s.id
  ) pc on true
  left join lateral (
    select sum(pm.amount_kobo) as revenue
    from crm.payments pm
    where pm.attributed_salesperson_id = s.id and pm.status = 'confirmed'
  ) rev on true
  where crm.is_admin()
  order by s.is_active desc, s.role, s.full_name;
$$;

grant execute on function crm.staff_overview() to authenticated;
