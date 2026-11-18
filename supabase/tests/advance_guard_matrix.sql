-- Sequential cases for the advance guard. Concurrency is a separate pair of
-- sessions started by the shell after this file. This file never connects
-- outside the database it is run against.

\set ON_ERROR_STOP on

alter table public.trips
  add column if not exists supplier_rate numeric,
  add column if not exists supplier_rate_basis text,
  add column if not exists load_tons numeric;

alter table public.transactions
  add column if not exists amount_out numeric,
  add column if not exists organization_id uuid;

create unique index if not exists ux_transactions_compliance_trip_category
  on public.transactions (trip_id, ledger_category)
  where trip_id is not null
    and ledger_category in ('compliance_advance', 'compliance_balance');

create table public.organization_members (
  organization_id uuid not null,
  user_id uuid not null,
  status text not null,
  role text not null,
  permissions jsonb,
  primary key (organization_id, user_id)
);

-- Production body from 20260915162440, so approval auth uses membership.
drop function public.has_member_surface(uuid, text);
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
  v_grant boolean;
begin
  if v_uid is null then
    return false;
  end if;
  select status, role, (permissions->'surfaces'->>p_surface_id)::boolean
    into v_status, v_role, v_grant
    from public.organization_members
   where organization_id = p_org_id
     and user_id = v_uid;
  if v_status is null or v_status != 'active' then
    return false;
  end if;
  if v_role in ('owner', 'admin') then
    return true;
  end if;
  return coalesce(v_grant, false);
end;
$$;

insert into public.organizations (id) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.organization_members (organization_id, user_id, status, role, permissions) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'active', 'admin', '{}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'active', 'admin', '{}');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

create table public.advance_guard_results (
  n int primary key,
  name text not null,
  outcome text not null,
  detail text not null
);

create or replace function public.advance_guard_case(p_n int, p_name text, p_sql text, p_expect text)
  returns void
  language plpgsql
  set search_path = public
as $$
declare
  v_err text;
  v_t0 timestamptz := clock_timestamp();
  v_ms numeric;
begin
  execute p_sql;
  v_ms := round(extract(epoch from clock_timestamp() - v_t0) * 1000, 2);
  if p_expect = 'ok' then
    insert into public.advance_guard_results values (p_n, p_name, 'accepted', v_ms || ' ms');
  else
    insert into public.advance_guard_results values (p_n, p_name, 'FAIL', 'expected rejection, completed in ' || v_ms || ' ms');
  end if;
exception when others then
  v_err := sqlerrm;
  v_ms := round(extract(epoch from clock_timestamp() - v_t0) * 1000, 2);
  if p_expect <> 'ok' and position(p_expect in v_err) > 0 then
    insert into public.advance_guard_results values (p_n, p_name, 'rejected', v_err || ' (' || v_ms || ' ms)');
  else
    insert into public.advance_guard_results values (p_n, p_name, 'FAIL', v_err || ' (' || v_ms || ' ms)');
  end if;
end;
$$;

insert into public.trips (id, organization_id, compliance_verified_at, supplier_rate, supplier_rate_basis, load_tons) values
  ('01000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 10000, 'flat', null),
  ('01000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 10000, 'flat', null),
  ('01000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), null, 'flat', null),
  ('01000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 100, 'per_mt', null),
  ('01000000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 1000, 'flat', null),
  ('01000000-0000-0000-0000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 1000, 'flat', null),
  ('01000000-0000-0000-0000-000000000007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 1000, 'flat', null),
  ('01000000-0000-0000-0000-000000000008', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 1000, 'flat', null),
  ('01000000-0000-0000-0000-000000000009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 1000, 'flat', null),
  ('01000000-0000-0000-0000-000000000010', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 1000, 'flat', null),
  ('01000000-0000-0000-0000-000000000011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 1000, 'flat', null),
  ('01000000-0000-0000-0000-000000000012', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 100, 'per_mt', 10),
  ('01000000-0000-0000-0000-000000000013', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 1000, 'flat', null),
  ('01000000-0000-0000-0000-000000000014', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 3000, 'flat', null),
  ('01000000-0000-0000-0000-000000000015', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 400, 'flat', null),
  ('01000000-0000-0000-0000-000000000016', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 700, 'flat', null),
  ('01000000-0000-0000-0000-000000000017', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 900, 'flat', null),
  ('01000000-0000-0000-0000-000000000018', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 1500, 'flat', null),
  ('01000000-0000-0000-0000-000000000019', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 5000, 'flat', null),
  ('01000000-0000-0000-0000-000000000020', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 1000, 'flat', null);

select public.advance_guard_case(1, 'valid approval within base freight',
  $c$select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000001', 'k1', 9000)$c$, 'ok');
select public.advance_guard_case(2, 'approval exceeding base freight',
  $c$select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000002', 'k2', 10001)$c$,
  'approved amount exceeds current trip freight');
select public.advance_guard_case(3, 'missing supplier rate',
  $c$select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000003', 'k3', 1)$c$,
  'trip freight is not set');
select public.advance_guard_case(4, 'missing load tons for per_mt',
  $c$select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000004', 'k4', 1)$c$,
  'trip freight is not set');
select public.advance_guard_case(5, 'null approval amount',
  $c$select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000005', 'k5', null)$c$,
  'approved amount is required');
select public.advance_guard_case(6, 'negative approval amount',
  $c$select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000006', 'k6', -1)$c$,
  'approved amount cannot be negative');

select public.advance_guard_case(8, 'approve cap for over-payment trip',
  $c$select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000008', 'k8', 500)$c$, 'ok');
select public.advance_guard_case(9, 'approve exact-payment trip',
  $c$select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000009', 'k9', 500)$c$, 'ok');
select public.advance_guard_case(10, 'approve before rate change',
  $c$select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000010', 'k10', 500)$c$, 'ok');
select public.advance_guard_case(11, 'approve before basis change',
  $c$select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000011', 'k11', 500)$c$, 'ok');
select public.advance_guard_case(12, 'approve per_mt before tons change',
  $c$select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000012', 'k12', 800)$c$, 'ok');
select public.advance_guard_case(13, 'approve duplicate-payment trip',
  $c$select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000013', 'k13', 200)$c$, 'ok');
select public.advance_guard_case(14, 'first approval',
  $c$select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000014', 'k14', 2000)$c$, 'ok');
select public.advance_guard_case(15, 'approve retry trip',
  $c$select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000015', 'k15', 400)$c$, 'ok');
select public.advance_guard_case(16, 'approve rollback trip',
  $c$select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000016', 'k16', 600)$c$, 'ok');
select public.advance_guard_case(18, 'approve cross-org trip',
  $c$select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000018', 'k18', 1000)$c$, 'ok');
select public.advance_guard_case(20, 'approve concurrent-payment trip',
  $c$select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000020', 'k20', 100)$c$, 'ok');

-- Renumber the real matrix rows. The setup approvals above use the same
-- numbers temporarily; replace them with the payment outcomes.
delete from public.advance_guard_results where n in (8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20);

select public.advance_guard_case(7, 'payment before approval',
  $c$insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by)
      values ('71000000-0000-0000-0000-000000000007', '01000000-0000-0000-0000-000000000007',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 100, '11111111-1111-1111-1111-111111111111')$c$,
  'advance cannot be paid before it is approved');

select public.advance_guard_case(8, 'payment exceeding approved amount',
  $c$insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by)
      values ('71000000-0000-0000-0000-000000000008', '01000000-0000-0000-0000-000000000008',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 501, '11111111-1111-1111-1111-111111111111')$c$,
  'payment amount exceeds the approved advance');

select public.advance_guard_case(9, 'payment matching approved amount',
  $c$insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by)
      values ('71000000-0000-0000-0000-000000000009', '01000000-0000-0000-0000-000000000009',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 500, '11111111-1111-1111-1111-111111111111')$c$,
  'ok');

update public.trips set supplier_rate = 800 where id = '01000000-0000-0000-0000-000000000010';
select public.advance_guard_case(10, 'rate changed after approval',
  $c$insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by)
      values ('71000000-0000-0000-0000-000000000010', '01000000-0000-0000-0000-000000000010',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 500, '11111111-1111-1111-1111-111111111111')$c$,
  'trip terms changed after approval');

update public.trips set supplier_rate_basis = 'lane' where id = '01000000-0000-0000-0000-000000000011';
select public.advance_guard_case(11, 'basis changed after approval',
  $c$insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by)
      values ('71000000-0000-0000-0000-000000000011', '01000000-0000-0000-0000-000000000011',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 500, '11111111-1111-1111-1111-111111111111')$c$,
  'trip terms changed after approval');

update public.trips set load_tons = 9 where id = '01000000-0000-0000-0000-000000000012';
select public.advance_guard_case(12, 'tons changed after approval',
  $c$insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by)
      values ('71000000-0000-0000-0000-000000000012', '01000000-0000-0000-0000-000000000012',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 800, '11111111-1111-1111-1111-111111111111')$c$,
  'trip terms changed after approval');

select public.advance_guard_case(130, 'first payment of duplicate pair',
  $c$insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by)
      values ('71000000-0000-0000-0000-000000000013', '01000000-0000-0000-0000-000000000013',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 200, '11111111-1111-1111-1111-111111111111')$c$,
  'ok');
select public.advance_guard_case(13, 'duplicate payment insert',
  $c$insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by)
      values ('71000000-0000-0000-0000-000000000113', '01000000-0000-0000-0000-000000000013',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 200, '11111111-1111-1111-1111-111111111111')$c$,
  'duplicate key');

select public.advance_guard_case(14, 'repeated approval RPC',
  $c$select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000014', 'k14b', 1000)$c$,
  'ok');

select public.advance_guard_case(151, 'failed payment then retry',
  $c$insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by)
      values ('71000000-0000-0000-0000-000000000015', '01000000-0000-0000-0000-000000000015',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 401, '11111111-1111-1111-1111-111111111111')$c$,
  'payment amount exceeds the approved advance');
select public.advance_guard_case(15, 'retry payment at approved amount',
  $c$insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by)
      values ('71000000-0000-0000-0000-000000000015', '01000000-0000-0000-0000-000000000015',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 400, '11111111-1111-1111-1111-111111111111')$c$,
  'ok');
select public.advance_guard_case(152, 'retry of an already posted payment',
  $c$insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by)
      values ('71000000-0000-0000-0000-000000000115', '01000000-0000-0000-0000-000000000015',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 400, '11111111-1111-1111-1111-111111111111')$c$,
  'duplicate key');

select public.advance_guard_case(16, 'failed payment transaction rollback',
  $c$insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by)
      values ('71000000-0000-0000-0000-000000000016', '01000000-0000-0000-0000-000000000016',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 700, '11111111-1111-1111-1111-111111111111')$c$,
  'payment amount exceeds the approved advance');

select public.advance_guard_case(17, 'balance request unaffected',
  $c$insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by)
      values ('71000000-0000-0000-0000-000000000017', '01000000-0000-0000-0000-000000000017',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_balance', 100, '11111111-1111-1111-1111-111111111111')$c$,
  'ok');

-- Owner session bypasses RLS. This records whether the trigger itself rejects
-- a payment whose organization_id is not the trip's organization.
select public.advance_guard_case(18, 'cross-organisation payment attempt',
  $c$insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by)
      values ('71000000-0000-0000-0000-000000000018', '01000000-0000-0000-0000-000000000018',
              'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'compliance_advance', 1000, '22222222-2222-2222-2222-222222222222')$c$,
  'payment organization does not match the trip');

-- Legacy null amount, inserted the way a pre-migration row exists.
insert into public.payment_requests
  (id, organization_id, trip_id, payment_type, request_no, approved_amount, terms_snapshot)
values
  ('81000000-0000-0000-0000-000000000021', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '01000000-0000-0000-0000-000000000001', 'balance', 'SAT812-PAY-LEGACY', null, null);
-- The legacy row under test is an advance, on a trip that has no live advance.
insert into public.trips (id, organization_id, compliance_verified_at, supplier_rate, supplier_rate_basis)
values ('01000000-0000-0000-0000-000000000021', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 1000, 'flat');
insert into public.payment_requests
  (id, organization_id, trip_id, payment_type, request_no, approved_amount, terms_snapshot)
values
  ('81000000-0000-0000-0000-000000000121', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '01000000-0000-0000-0000-000000000021', 'advance', 'SAT812-PAY-LEGACY-ADV', null, null);
select public.advance_guard_case(21, 'legacy null approved amount',
  $c$insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by)
      values ('71000000-0000-0000-0000-000000000021', '01000000-0000-0000-0000-000000000021',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 10, '11111111-1111-1111-1111-111111111111')$c$,
  'approved amount is missing');

select public.advance_guard_case(22, 'snapshot update rejected',
  $c$update public.payment_requests set terms_snapshot = '{"supplier_rate":1}'::jsonb
      where trip_id = '01000000-0000-0000-0000-000000000001' and payment_type = 'advance'$c$,
  'immutable once issued');

-- A request issued before terms_snapshot existed: amount is payable, and a
-- later freight change does not send it back through the new snapshot check.
insert into public.trips (id, organization_id, compliance_verified_at, supplier_rate, supplier_rate_basis)
values ('01000000-0000-0000-0000-000000000023', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 1000, 'flat');
insert into public.payment_requests
  (id, organization_id, trip_id, payment_type, request_no, status, approved_amount, terms_snapshot)
values
  ('81000000-0000-0000-0000-000000000023', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '01000000-0000-0000-0000-000000000023', 'advance', 'SAT812-PAY-LEGACY-PAYABLE', 'pending', 400, null);
update public.trips set supplier_rate = 50 where id = '01000000-0000-0000-0000-000000000023';
select public.advance_guard_case(23, 'null snapshot remains payable',
  $c$insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by)
      values ('71000000-0000-0000-0000-000000000023', '01000000-0000-0000-0000-000000000023',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 400, '11111111-1111-1111-1111-111111111111')$c$,
  'ok');

-- Historical over-approval is loaded with the link trigger off, the same shape
-- as a row that already exists. An ordinary update must not reject it.
insert into public.trips (id, organization_id, compliance_verified_at, supplier_rate, supplier_rate_basis)
values ('01000000-0000-0000-0000-000000000024', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 60000, 'flat');
insert into public.payment_requests
  (id, organization_id, trip_id, payment_type, request_no, status, approved_amount, terms_snapshot)
values
  ('81000000-0000-0000-0000-000000000024', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '01000000-0000-0000-0000-000000000024', 'advance', 'SAT812-PAY-HISTORICAL', 'pending', 50800, null);
alter table public.transactions disable trigger trg_transactions_link_payment_request;
insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by)
values ('71000000-0000-0000-0000-000000000024', '01000000-0000-0000-0000-000000000024',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 51300, '11111111-1111-1111-1111-111111111111');
insert into public.payment_request_transactions (request_id, transaction_id)
values ('81000000-0000-0000-0000-000000000024', '71000000-0000-0000-0000-000000000024');
update public.payment_requests set status = 'paid' where id = '81000000-0000-0000-0000-000000000024';
alter table public.transactions enable trigger trg_transactions_link_payment_request;
select public.advance_guard_case(24, 'historical overpayment survives update',
  $c$update public.transactions set created_by = created_by where id = '71000000-0000-0000-0000-000000000024'$c$,
  'ok');

-- Delete unlinks the request. It must not raise the insert guard.
select public.advance_guard_case(25, 'historical delete does not use the insert guard',
  $c$delete from public.transactions where id = '71000000-0000-0000-0000-000000000024'$c$,
  'ok');

select public.advance_guard_case(26, 'balance update does not revalidate advance rules',
  $c$update public.transactions set created_by = created_by where id = '71000000-0000-0000-0000-000000000017'$c$,
  'ok');

create table public.advance_guard_gate (
  id int primary key,
  opened boolean not null default false
);
insert into public.advance_guard_gate values (19, false), (20, false);

\echo '--- results ---'
select n, name, outcome, detail from public.advance_guard_results order by n;

\echo '--- persisted state ---'
select t.id, t.finance_verified_at is not null as finance_verified,
       r.payment_type, r.status, r.approved_amount, r.organization_id = t.organization_id as org_matches,
       r.terms_snapshot->>'base_freight' as snap_freight,
       (select count(*) from public.transactions x where x.trip_id = t.id) as tx_count
  from public.trips t
  left join public.payment_requests r on r.trip_id = t.id
 order by t.id, r.payment_type;

\echo '--- functions ---'
select proname, prosecdef, proconfig
  from pg_proc
 where proname in ('issue_payment_request', 'compliance_advance_terms', 'tg_transactions_link_payment_request', 'tg_payment_requests_immutable')
 order by 1;

\echo '--- triggers ---'
select tgname, pg_get_triggerdef(oid)
  from pg_trigger
 where tgrelid in ('public.transactions'::regclass, 'public.payment_requests'::regclass)
   and not tgisinternal
 order by 1;

do $$
declare
  v_amount numeric;
  v_count int;
begin
  if exists (select 1 from public.advance_guard_results where outcome = 'FAIL') then
    raise exception 'advance guard matrix has failures';
  end if;
  select approved_amount into v_amount
    from public.payment_requests
   where trip_id = '01000000-0000-0000-0000-000000000014' and payment_type = 'advance';
  if v_amount is distinct from 2000 then
    raise exception 'repeated approval changed the approved amount to %', v_amount;
  end if;
  select count(*) into v_count from public.payment_requests
   where trip_id = '01000000-0000-0000-0000-000000000014' and status <> 'cancelled';
  if v_count <> 1 then
    raise exception 'repeated approval created % live requests', v_count;
  end if;
  if exists (
    select 1 from public.transactions
     where trip_id = '01000000-0000-0000-0000-000000000018'
  ) then
    raise exception 'cross-organisation payment was persisted';
  end if;
  if (select terms_snapshot from public.payment_requests
       where trip_id = '01000000-0000-0000-0000-000000000001' and payment_type = 'advance') is null then
    raise exception 'new approval did not store a freight snapshot';
  end if;
  if (select amount_out from public.transactions where id = '71000000-0000-0000-0000-000000000023') is distinct from 400 then
    raise exception 'null-snapshot legacy payment was not stored';
  end if;
  if exists (select 1 from public.transactions where id = '71000000-0000-0000-0000-000000000024') then
    raise exception 'historical delete did not remove only the disposable copy';
  end if;
  if (select status from public.payment_requests where id = '81000000-0000-0000-0000-000000000024') is distinct from 'pending' then
    raise exception 'historical delete did not unlink through the existing refresh path';
  end if;
  if (select approved_amount from public.payment_requests where id = '81000000-0000-0000-0000-000000000024') is distinct from 50800 then
    raise exception 'historical delete changed the approved amount';
  end if;
end $$;
