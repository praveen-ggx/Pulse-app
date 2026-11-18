-- Server calculation matrix. Runs only on the disposable database that has
-- already applied 20271118094500. Concurrency is started by the shell.

\set ON_ERROR_STOP on

alter table public.trips
  add column if not exists supplier_rate numeric,
  add column if not exists supplier_rate_basis text,
  add column if not exists load_tons numeric,
  add column if not exists supplier_id uuid;

alter table public.transactions
  add column if not exists amount_out numeric,
  add column if not exists amount_in numeric,
  add column if not exists organization_id uuid,
  add column if not exists party_name text;

create unique index if not exists ux_transactions_compliance_trip_category
  on public.transactions (trip_id, ledger_category)
  where trip_id is not null
    and ledger_category in ('compliance_advance', 'compliance_balance');

create table if not exists public.organization_members (
  organization_id uuid not null,
  user_id uuid not null,
  status text not null,
  role text not null,
  permissions jsonb,
  primary key (organization_id, user_id)
);

create table if not exists public.supplier_tds_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  supplier_id uuid not null,
  financial_year text not null,
  rate_percent numeric not null,
  deleted_at timestamptz
);

create table if not exists public.org_document_charge_settings (
  organization_id uuid primary key,
  enabled boolean not null
);

create table if not exists public.org_document_charge_slabs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sort_order integer not null,
  min_freight numeric not null,
  max_freight numeric,
  charge numeric not null
);

drop function if exists public.has_member_surface(uuid, text);
create or replace function public.has_member_surface(p_org_id uuid, p_surface_id text)
  returns boolean
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_role text;
begin
  if v_uid is null then
    return false;
  end if;
  select status, role into v_status, v_role
    from public.organization_members
   where organization_id = p_org_id and user_id = v_uid;
  return v_status = 'active' and v_role in ('owner', 'admin');
end;
$$;

insert into public.organization_members (organization_id, user_id, status, role, permissions)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'active', 'admin', '{}')
on conflict do nothing;
insert into public.organizations (id) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
on conflict do nothing;
insert into public.organization_members (organization_id, user_id, status, role, permissions)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'active', 'admin', '{}')
on conflict do nothing;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

create table public.advance_calc_results (
  n int primary key,
  name text not null,
  outcome text not null,
  detail text not null
);

create or replace function public.advance_calc_case(p_n int, p_name text, p_sql text, p_expect text)
  returns void
  language plpgsql
  set search_path = public
as $$
declare
  v_err text;
begin
  execute p_sql;
  if p_expect = 'ok' then
    insert into public.advance_calc_results values (p_n, p_name, 'accepted', 'ok');
  else
    insert into public.advance_calc_results values (p_n, p_name, 'FAIL', 'expected rejection');
  end if;
exception when others then
  v_err := sqlerrm;
  if p_expect <> 'ok' and position(p_expect in v_err) > 0 then
    insert into public.advance_calc_results values (p_n, p_name, 'rejected', v_err);
  else
    insert into public.advance_calc_results values (p_n, p_name, 'FAIL', v_err);
  end if;
end;
$$;

insert into public.trips (id, organization_id, supplier_id, compliance_verified_at, supplier_rate, supplier_rate_basis, load_tons) values
  ('c1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd1000000-0000-4000-8000-000000000001', now(), 10000, 'per_trip', null),
  ('c1000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, now(), 10000, ' PER_MT ', 2),
  ('c1000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, now(), 10000, 'flat', null),
  ('c1000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, now(), 100, 'per_mt', null),
  ('c1000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, now(), 0, 'per_trip', null),
  ('c1000000-0000-4000-8000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd1000000-0000-4000-8000-000000000006', now(), 10000, 'per_trip', null),
  ('c1000000-0000-4000-8000-000000000007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, now(), 10000, 'per_trip', null),
  ('c1000000-0000-4000-8000-000000000008', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, now(), 10000, 'per_trip', null),
  ('c1000000-0000-4000-8000-000000000009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, now(), 900, 'per_trip', null),
  ('c1000000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, now(), 1000, 'per_trip', null),
  ('c1000000-0000-4000-8000-00000000000b', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, now(), 100.5, 'per_mt', 3),
  ('c1000000-0000-4000-8000-00000000000c', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, now(), 1000, 'per_trip', null);

insert into public.org_document_charge_settings (organization_id, enabled)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

insert into public.org_document_charge_slabs (organization_id, sort_order, min_freight, max_freight, charge) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1000, 15000, 200),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, 15000, 25000, 300);

do $$
declare
  v_fy text := public.compliance_indian_financial_year(now());
  v_prior text := (split_part(v_fy, '-', 1)::int - 1)::text || '-' || lpad((split_part(v_fy, '-', 1)::int % 100)::text, 2, '0');
begin
  insert into public.supplier_tds_rates (organization_id, supplier_id, financial_year, rate_percent) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd1000000-0000-4000-8000-000000000001', v_fy, 1),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd1000000-0000-4000-8000-000000000001', v_prior, 2),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd1000000-0000-4000-8000-000000000006', v_prior, 1.5);
  if public.compliance_indian_financial_year('2026-03-31 18:30:00+00') <> '2026-27' then
    raise exception 'April boundary FY mismatch';
  end if;
  if public.compliance_indian_financial_year('2026-03-31 18:29:00+00') <> '2025-26' then
    raise exception 'March boundary FY mismatch';
  end if;
end $$;

select public.advance_calc_case(1, 'percent 90 with current FY tds and slab',
  $c$select public.mark_trip_finance_verified('c1000000-0000-4000-8000-000000000001', 'calc-1', 90, 1)$c$, 'ok');
select public.advance_calc_case(2, 'repeat approval keeps the first payable',
  $c$do $d$
declare v jsonb;
begin
  v := public.mark_trip_finance_verified('c1000000-0000-4000-8000-000000000001', 'calc-1b', 10, 1);
  if (v->>'approved_amount')::numeric <> 8700 or (v->>'idempotent_replay')::boolean is not true then
    raise exception 'repeat approval changed the payable: %', v;
  end if;
end $d$$c$, 'ok');
select public.advance_calc_case(3, 'canonical per_mt',
  $c$select public.mark_trip_finance_verified('c1000000-0000-4000-8000-000000000002', 'calc-2', 90, 1)$c$, 'ok');
select public.advance_calc_case(4, 'unknown basis',
  $c$select public.mark_trip_finance_verified('c1000000-0000-4000-8000-000000000003', 'calc-3', 90, 1)$c$, 'supplier rate basis is not valid');
select public.advance_calc_case(5, 'per_mt without tons',
  $c$select public.mark_trip_finance_verified('c1000000-0000-4000-8000-000000000004', 'calc-4', 90, 1)$c$, 'trip freight is not set');
select public.advance_calc_case(6, 'missing rate',
  $c$select public.mark_trip_finance_verified('c1000000-0000-4000-8000-000000000005', 'calc-5', 90, 1)$c$, 'trip freight is not set');
select public.advance_calc_case(7, 'percent above 100',
  $c$select public.mark_trip_finance_verified('c1000000-0000-4000-8000-000000000007', 'calc-7', 101, 1)$c$, 'advance percent must be between 0 and 100');
select public.advance_calc_case(8, 'negative percent',
  $c$select public.mark_trip_finance_verified('c1000000-0000-4000-8000-000000000007', 'calc-8', -1, 1)$c$, 'advance percent must be between 0 and 100');
select public.advance_calc_case(9, 'old rupee signature',
  $c$select public.mark_trip_finance_verified('c1000000-0000-4000-8000-000000000007', 'calc-9', 9000)$c$, 'advance approval requires an explicit advance percent');
select public.advance_calc_case(10, 'prior FY tds fallback',
  $c$select public.mark_trip_finance_verified('c1000000-0000-4000-8000-000000000006', 'calc-6', 90, 1)$c$, 'ok');
select public.advance_calc_case(11, 'unrounded per_mt product',
  $c$select public.mark_trip_finance_verified('c1000000-0000-4000-8000-00000000000b', 'calc-b', 90, 1)$c$, 'ok');
select public.advance_calc_case(12, 'non-positive payable',
  $c$do $d$
begin
  update public.org_document_charge_slabs set charge = 100000 where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and sort_order = 1;
  perform public.mark_trip_finance_verified('c1000000-0000-4000-8000-000000000007', 'calc-neg', 1, 1);
end $d$$c$, 'calculated advance is not positive');

update public.org_document_charge_slabs set charge = 200
where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and sort_order = 1;

select public.advance_calc_case(13, 'matching payment',
  $c$insert into public.transactions (id, organization_id, trip_id, ledger_category, amount_out)
      values ('e1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1000000-0000-4000-8000-000000000001', 'compliance_advance', 8700)$c$, 'ok');
select public.advance_calc_case(14, 'payment below approved',
  $c$insert into public.transactions (id, organization_id, trip_id, ledger_category, amount_out)
      values ('e1000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1000000-0000-4000-8000-000000000002', 'compliance_advance', 17999)$c$, 'payment amount must equal the approved advance');
select public.advance_calc_case(15, 'duplicate payment',
  $c$insert into public.transactions (id, organization_id, trip_id, ledger_category, amount_out)
      values ('e1000000-0000-4000-8000-000000000011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1000000-0000-4000-8000-000000000001', 'compliance_advance', 8700)$c$, 'duplicate key');
select public.advance_calc_case(16, 'freight change',
  $c$do $d$
begin
  update public.trips set supplier_rate = 9000 where id = 'c1000000-0000-4000-8000-000000000006';
  insert into public.transactions (id, organization_id, trip_id, ledger_category, amount_out)
  values ('e1000000-0000-4000-8000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1000000-0000-4000-8000-000000000006', 'compliance_advance',
    (select approved_amount from public.payment_requests where trip_id = 'c1000000-0000-4000-8000-000000000006' and status <> 'cancelled'));
end $d$$c$, 'trip terms changed after approval');
select public.advance_calc_case(17, 'tds input change',
  $c$do $d$
begin
  update public.supplier_tds_rates set rate_percent = 2
   where supplier_id = 'd1000000-0000-4000-8000-000000000006';
  insert into public.transactions (id, organization_id, trip_id, ledger_category, amount_out)
  values ('e1000000-0000-4000-8000-000000000012', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1000000-0000-4000-8000-000000000006', 'compliance_advance',
    (select approved_amount from public.payment_requests where trip_id = 'c1000000-0000-4000-8000-000000000006' and status <> 'cancelled'));
end $d$$c$, 'approval inputs changed');

insert into public.payment_requests (organization_id, trip_id, payment_type, request_no, approved_amount, terms_snapshot, status)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1000000-0000-4000-8000-000000000008', 'advance', 'CALC-LEGACY', 500, null, 'pending');
select public.advance_calc_case(18, 'legacy null snapshot under approved',
  $c$insert into public.transactions (id, organization_id, trip_id, ledger_category, amount_out)
      values ('e1000000-0000-4000-8000-000000000008', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1000000-0000-4000-8000-000000000008', 'compliance_advance', 400)$c$, 'ok');
select public.advance_calc_case(19, 'legacy over approved',
  $c$insert into public.transactions (id, organization_id, trip_id, ledger_category, amount_out)
      values ('e1000000-0000-4000-8000-000000000018', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1000000-0000-4000-8000-00000000000a', 'compliance_advance', 501)$c$, 'advance cannot be paid before it is approved');

insert into public.payment_requests (organization_id, trip_id, payment_type, request_no, approved_amount, terms_snapshot, status)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1000000-0000-4000-8000-00000000000a', 'advance', 'CALC-OLD', 400,
  jsonb_build_object('supplier_rate', 1000, 'supplier_rate_basis', 'per_trip', 'load_tons', null, 'base_freight', 1000), 'pending');
select public.advance_calc_case(20, 'freight-only snapshot allows a lower payment',
  $c$insert into public.transactions (id, organization_id, trip_id, ledger_category, amount_out)
      values ('e1000000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1000000-0000-4000-8000-00000000000a', 'compliance_advance', 300)$c$, 'ok');
select public.advance_calc_case(21, 'org mismatch',
  $c$insert into public.transactions (id, organization_id, trip_id, ledger_category, amount_out)
      values ('e1000000-0000-4000-8000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'c1000000-0000-4000-8000-00000000000b', 'compliance_advance',
        (select (public.compliance_advance_calculation('c1000000-0000-4000-8000-00000000000b', 90)->>'payable')::numeric))$c$, 'payment organization does not match the trip');
select public.advance_calc_case(22, 'balance request',
  $c$insert into public.transactions (id, organization_id, trip_id, ledger_category, amount_out)
      values ('e1000000-0000-4000-8000-000000000009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1000000-0000-4000-8000-000000000009', 'compliance_balance', 100)$c$, 'ok');

select n, name, outcome, detail from public.advance_calc_results order by n;

do $$
declare
  v_payable numeric;
  v_base numeric;
begin
  if exists (select 1 from public.advance_calc_results where outcome = 'FAIL') then
    raise exception 'calculation matrix failed';
  end if;
  select approved_amount, (terms_snapshot->>'base_freight')::numeric
    into v_payable, v_base
    from public.payment_requests
   where trip_id = 'c1000000-0000-4000-8000-000000000001' and status <> 'cancelled';
  if v_payable <> 8700 or v_base <> 10000 then
    raise exception 'tds and slab payable mismatch: % / %', v_payable, v_base;
  end if;
  select (terms_snapshot->>'payable')::numeric, (terms_snapshot->>'base_freight')::numeric
    into v_payable, v_base
    from public.payment_requests
   where trip_id = 'c1000000-0000-4000-8000-00000000000b' and status <> 'cancelled';
  if v_base <> 301.5 or v_payable <> 271.35 then
    raise exception 'unrounded per_mt mismatch: % / %', v_base, v_payable;
  end if;
  select approved_amount into v_payable
    from public.payment_requests
   where trip_id = 'c1000000-0000-4000-8000-000000000002' and status <> 'cancelled';
  if v_payable <> 17700 then
    raise exception 'canonical per_mt payable mismatch: %', v_payable;
  end if;
  if (select approved_amount is null and terms_snapshot is null
        from public.payment_requests
       where trip_id = 'c1000000-0000-4000-8000-000000000009' and payment_type = 'balance') is not true then
    raise exception 'balance request was capped';
  end if;
end $$;
