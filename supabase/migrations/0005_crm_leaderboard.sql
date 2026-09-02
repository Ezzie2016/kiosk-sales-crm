-- ============================================================================
--  Kiosk Sales CRM — leaderboard aggregate (spec §8).
--
--  SECURITY DEFINER so a salesperson can see the ranked table (name, paid count,
--  revenue, assigned count) without read access to anyone else's prospects.
--  Returns ONLY the aggregate — no prospect-level data. Ranking / conversion
--  rates are computed client-side in src/modules/analytics/leaderboard.ts.
-- ============================================================================

create or replace function crm.leaderboard()
returns table (
  salesperson_id uuid,
  full_name text,
  is_active boolean,
  assigned_count int,
  paid_count int,
  confirmed_revenue_kobo bigint
)
language sql stable security definer set search_path = ''
as $$
  select
    s.id                          as salesperson_id,
    s.full_name                   as full_name,
    s.is_active                   as is_active,
    coalesce(pc.assigned_count, 0)::int   as assigned_count,
    coalesce(pc.paid_count, 0)::int       as paid_count,
    coalesce(rev.revenue, 0)::bigint      as confirmed_revenue_kobo
  from crm.staff s
  left join lateral (
    select
      count(*)                                        as assigned_count,
      count(*) filter (where p.paid_at is not null)   as paid_count
    from crm.prospects p
    where p.assigned_salesperson_id = s.id
  ) pc on true
  left join lateral (
    select sum(pm.amount_kobo) as revenue
    from crm.payments pm
    where pm.attributed_salesperson_id = s.id
      and pm.status = 'confirmed'
  ) rev on true
  where crm.is_active_staff()
    and s.role = 'salesperson'
    -- keep every active rep; a deactivated rep only if they have history worth showing
    and (s.is_active or coalesce(pc.assigned_count, 0) > 0 or coalesce(rev.revenue, 0) > 0)
  order by 5 desc, 6 desc, 2;  -- paid_count, then revenue, then name (client re-ranks anyway)
$$;

grant execute on function crm.leaderboard() to authenticated;
