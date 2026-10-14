-- Disposable-database checks for unapplied PR #1 guards.
-- Refuses to be the proof of a production apply. Run only against a
-- throwaway database created by supabase/tests/run-pr1-disposable.sh.

\set ON_ERROR_STOP on

create schema if not exists auth;
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;
create role pr1_caller nologin;
grant pr1_caller to postgres with set true, inherit false;

create table public.organization_members (
  id uuid primary key,
  organization_id uuid not null,
  user_id uuid not null,
  status text not null,
  permissions jsonb
);
create table public.organization_member_warehouses (
  organization_member_id uuid not null,
  warehouse_id uuid not null
);
create table public.indents (
  id uuid primary key,
  organization_id uuid not null,
  warehouse_id uuid,
  sales_order_id uuid,
  execution_plan_id uuid
);
create table public.sales_orders (
  id uuid primary key,
  pickup_warehouse_id uuid,
  drop_warehouse_id uuid
);
create table public.sales_order_lines (
  id uuid primary key,
  sales_order_id uuid
);
create table public.shipment_allocations (
  execution_plan_id uuid,
  sales_order_line_id uuid
);
create table public.trips (
  id uuid primary key,
  organization_id uuid not null,
  indent_id uuid,
  supplier_id uuid,
  dco_payee_id uuid
);

alter table public.indents enable row level security;
create policy indents_hidden_from_ground_ops on public.indents
  for select to authenticated
  using (false);

\ir ../migrations/20271008120000_ground_ops_trip_select_helper.sql
grant execute on function public.ground_ops_can_see_trip(uuid, uuid) to pr1_caller;
grant select on public.indents to pr1_caller;

insert into public.organization_members (id, organization_id, user_id, status, permissions) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'active', '{"platformRole":"ground_ops"}'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'active', '{"platformRole":"dispatcher"}');
insert into public.organization_member_warehouses (organization_member_id, warehouse_id) values
  ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  ('22222222-2222-2222-2222-222222222222', 'dddddddd-dddd-dddd-dddd-dddddddddddd');
insert into public.indents (id, organization_id, warehouse_id) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', '99999999-9999-9999-9999-999999999999', 'dddddddd-dddd-dddd-dddd-dddddddddddd');

-- Direct indent read is hidden. The helper is the only path under test.
set role pr1_caller;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);
do $$
begin
  if (select count(*) from public.indents) <> 0 then
    raise exception 'indent RLS did not hide rows from the caller';
  end if;
  if public.ground_ops_can_see_trip('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') is not true then
    raise exception 'authorized ground ops could not see the assigned indent';
  end if;
  if public.ground_ops_can_see_trip('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ffffffff-ffff-ffff-ffff-ffffffffffff') is not false then
    raise exception 'ground ops saw an indent from another organization';
  end if;
  if public.ground_ops_can_see_trip('99999999-9999-9999-9999-999999999999', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') is not false then
    raise exception 'ground ops saw a trip organization they do not belong to';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', false);
do $$
begin
  if public.ground_ops_can_see_trip('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') is not false then
    raise exception 'non-ground-ops caller received a positive helper result';
  end if;
end $$;

reset role;
set role anon;
do $$
begin
  begin
    perform public.ground_ops_can_see_trip('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
    raise exception 'anon helper call succeeded';
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;

-- Payment-request issuer fixtures. The next files check the early live-row
-- return, a request_no collision that must re-raise, and a two-session race
-- that reaches the unique_violation return.
create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  trip_id uuid not null,
  payment_type text not null,
  request_no text not null unique,
  status text not null default 'pending',
  approved_amount numeric,
  approved_by uuid,
  approved_at timestamptz not null default now()
);
create unique index ux_payment_requests_live_trip_type
  on public.payment_requests (trip_id, payment_type)
  where status <> 'cancelled';

create table public.pr1_request_no_mode (mode text primary key, value text);
insert into public.pr1_request_no_mode values ('fixed', '');

create or replace function public.generate_payment_request_no(p_org_id uuid)
returns text
language plpgsql
as $$
declare
  v_fixed text;
begin
  select nullif(value, '') into v_fixed from public.pr1_request_no_mode where mode = 'fixed';
  if v_fixed is not null then
    return v_fixed;
  end if;
  return 'PAY-' || gen_random_uuid()::text;
end;
$$;

insert into public.trips (id, organization_id) values
  ('12121212-1212-1212-1212-121212121212', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('13131313-1313-1313-1313-131313131313', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
