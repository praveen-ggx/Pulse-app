\set ON_ERROR_STOP on

-- Sequential idempotency: a second call returns the same live request.
select public.issue_payment_request(
  '12121212-1212-1212-1212-121212121212', 'advance', 100, null, now()
) as first_id \gset
select public.issue_payment_request(
  '12121212-1212-1212-1212-121212121212', 'advance', 100, null, now()
) as second_id \gset
select case when :'first_id' = :'second_id' then 1 else 1/0 end as idempotent_ok;

-- A request_no collision that is not this trip's live row must propagate.
update public.pr1_request_no_mode set value = 'PAY-COLLISION' where mode = 'fixed';
insert into public.payment_requests (organization_id, trip_id, payment_type, request_no, status)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '13131313-1313-1313-1313-131313131313', 'balance', 'PAY-COLLISION', 'pending');
do $$
begin
  if (select count(*) from public.payment_requests where trip_id = '12121212-1212-1212-1212-121212121212' and payment_type = 'advance' and status <> 'cancelled') <> 1 then
    raise exception 'live request count is not 1';
  end if;
  begin
    perform public.issue_payment_request(
      '12121212-1212-1212-1212-121212121212', 'balance', 50, null, now()
    );
    raise exception 'request_no collision was swallowed';
  exception when unique_violation then
    null;
  end;
  if exists (
    select 1 from public.payment_requests
    where trip_id = '12121212-1212-1212-1212-121212121212' and payment_type = 'balance'
  ) then
    raise exception 'collision inserted a balance request';
  end if;
end $$;

-- Godrej exclusion uses supplier_id only. A DCO payee is not copied.
create table public.suppliers (
  id uuid primary key,
  company_name text,
  name text
);
create table public.transactions (
  id uuid primary key,
  trip_id uuid,
  amount_in numeric,
  amount_out numeric,
  ledger_category text,
  contact_type text,
  contact_id uuid,
  party_name text,
  ledger_entity_type text,
  ledger_flow_type text
);
insert into public.suppliers (id, company_name, name) values
  ('abababab-abab-abab-abab-abababababab', 'Real Supplier', 'Real Supplier');
insert into public.trips (id, organization_id, supplier_id, dco_payee_id) values
  ('3f333e5b-1256-4208-acee-7de3bc305f0b', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0'),
  ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'abababab-abab-abab-abab-abababababab', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0');
insert into public.transactions (id, trip_id, amount_in, amount_out, ledger_category) values
  ('897a1bef-76c6-43bb-a4fa-b9d28df18a96', '3f333e5b-1256-4208-acee-7de3bc305f0b', 3500, 0, 'compliance_advance'),
  ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444', 900, 0, 'compliance_advance');

\ir ../migrations/20271012140000_compliance_payments_supplier_payable.sql

do $$
declare
  v_godrej public.transactions%rowtype;
  v_other public.transactions%rowtype;
begin
  select * into v_godrej from public.transactions where id = '897a1bef-76c6-43bb-a4fa-b9d28df18a96';
  select * into v_other from public.transactions where id = '55555555-5555-5555-5555-555555555555';
  if v_godrej.amount_in is distinct from 3500 or v_godrej.contact_id is not null or v_godrej.contact_type is not null then
    raise exception 'Godrej receipt was rewritten';
  end if;
  if v_other.contact_id is distinct from 'abababab-abab-abab-abab-abababababab' then
    raise exception 'supplier rewrite did not use supplier_id';
  end if;
  if v_other.contact_id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0' then
    raise exception 'DCO payee was copied into contact_id';
  end if;
  if v_other.amount_out is distinct from 900 or v_other.amount_in is distinct from 0 then
    raise exception 'supplier rewrite did not flip the amount';
  end if;
  if v_other.party_name is distinct from 'Real Supplier' then
    raise exception 'party name did not come from the supplier row';
  end if;
end $$;
