-- Indents Ground Ops read, after public.ground_ops_can_see_trip exists.
-- 20261022100607 skips the policy and get_indents_delta on a fresh database.
-- 20270917100400 installs the earlier "no indents" body in between. This file
-- restores the October body, which is the one that calls the helper.
-- CREATE OR REPLACE keeps the authenticated grant from 20260801190000.
-- The October file adds no grant of its own.

BEGIN;

SET LOCAL lock_timeout = '5s';

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

COMMIT;
