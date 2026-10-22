-- Ground Ops see the indents of their own warehouses, read-only.
--
-- Changes the 2027-09-17 decision ("Ground Ops must not see indents at all",
-- 20270917100300 / 20270917100400): owner decision 22 Oct 2026 — a Ground Ops
-- member sees exactly the indents behind the trips they already see, i.e. the
-- indent's warehouse, or its sales order / execution plan pickup or drop
-- warehouse, is one of their organization_member_warehouses.
--
-- The visibility rule is the existing SECURITY DEFINER helper
-- public.ground_ops_can_see_trip(org, indent_id) (20271008120000), which already
-- answers "is this indent in my warehouses" for the trips policy, so trips and
-- indents can never disagree.
--
-- Read only: "Org members can manage indents" still excludes Ground Ops, so
-- they cannot insert, update, award, cancel or delete. Additive: one policy and
-- one function body; no table or data changes.

begin;

-- ── 1. Direct reads (indent detail, Failed list) ─────────────────────────────
drop policy if exists indents_ground_ops_select_assigned on public.indents;
create policy indents_ground_ops_select_assigned on public.indents
  for select
  to authenticated
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = indents.organization_id
        and om.user_id = (select auth.uid())
        and om.status = 'active'
        and coalesce(om.permissions ->> 'platformRole', '') = 'ground_ops'
    )
    and public.ground_ops_can_see_trip(indents.organization_id, indents.id)
  );

-- ── 2. Hub sync: their warehouses' indents instead of none ───────────────────
create or replace function public.get_indents_delta(
  p_org_id  uuid,
  p_since   text,
  p_limit   int default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since     timestamptz := p_since::timestamptz;
  v_changed   jsonb;
  v_deleted   jsonb;
  v_next      text;
  v_ground_ops boolean;
begin
  if not public.is_org_member(p_org_id) then
    return jsonb_build_object(
      'changed', '[]'::jsonb,
      'deleted_ids', '[]'::jsonb,
      'next_cursor', p_since
    );
  end if;

  v_ground_ops := exists (
    select 1 from public.organization_members om
    where om.organization_id = p_org_id
      and om.user_id = (select auth.uid())
      and om.status = 'active'
      and coalesce(om.permissions ->> 'platformRole', '') = 'ground_ops'
  );

  select
    coalesce(jsonb_agg(row_to_json(i) order by i.updated_at) filter (where i.deleted_at is null), '[]'),
    coalesce(jsonb_agg(i.id::text)                           filter (where i.deleted_at is not null), '[]'),
    max(i.updated_at)::text
  into v_changed, v_deleted, v_next
  from (
    select * from public.indents
    where organization_id = p_org_id
      and updated_at > v_since
      -- Ground Ops: only their warehouses' indents (same rule as their trips).
      and (not v_ground_ops or public.ground_ops_can_see_trip(p_org_id, id))
    order by updated_at
    limit p_limit
  ) i;

  return jsonb_build_object(
    'changed',      v_changed,
    'deleted_ids',  v_deleted,
    'next_cursor',  coalesce(v_next, p_since)
  );
end;
$$;

commit;
