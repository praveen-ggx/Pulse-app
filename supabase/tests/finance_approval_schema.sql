-- Minimal objects so the three finance-approval migrations can be applied
-- on a throwaway database. Not a production schema dump.

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

create table public.organizations (
  id uuid primary key
);

create table public.operational_sequences (
  organization_id uuid not null,
  entity_type text not null,
  last_value bigint not null default 0,
  unique (organization_id, entity_type)
);

create table public.trips (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  indent_id uuid,
  supplier_id uuid,
  dco_payee_id uuid,
  deleted_at timestamptz,
  compliance_verified_at timestamptz,
  compliance_declined_at timestamptz,
  compliance_resubmitted_at timestamptz,
  finance_verified_at timestamptz,
  finance_verified_by uuid,
  finance_flagged_at timestamptz
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id),
  ledger_category text,
  created_at timestamptz not null default now(),
  created_by uuid
);
alter table public.transactions enable row level security;

create table public.trip_workflow_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null,
  org_id uuid not null,
  actor_id uuid,
  event_type text not null,
  payload jsonb,
  idempotency_key text unique
);

create or replace function public.ensure_organization_operational_code(p_org_id uuid)
returns text
language sql
stable
as $$
  select 'SAT812'
$$;

create or replace function public.allocate_operational_sequence(p_org_id uuid, p_entity text)
returns bigint
language plpgsql
as $$
declare
  v_next bigint;
begin
  insert into public.operational_sequences (organization_id, entity_type, last_value)
  values (p_org_id, p_entity, 1)
  on conflict (organization_id, entity_type) do nothing;
  update public.operational_sequences
     set last_value = last_value + 1
   where organization_id = p_org_id and entity_type = p_entity
  returning last_value into v_next;
  if v_next is null then
    insert into public.operational_sequences (organization_id, entity_type, last_value)
    values (p_org_id, p_entity, 1)
    returning last_value into v_next;
  end if;
  return v_next;
end;
$$;

create or replace function public.is_org_staff(p_org_id uuid)
returns boolean
language sql
stable
as $$
  select true
$$;

create or replace function public.has_member_surface(p_org_id uuid, p_surface text)
returns boolean
language sql
stable
as $$
  select p_surface = 'trip_compliance.finance.manage'
     and nullif(current_setting('request.jwt.claim.sub', true), '') is not null
$$;

insert into public.organizations (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
