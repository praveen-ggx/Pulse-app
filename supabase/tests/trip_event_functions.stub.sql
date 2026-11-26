-- Stub tables/roles for scripts/run-trip-event-functions-local-test.sh. THROWAWAY local Postgres only; never run on a real project.
\set ON_ERROR_STOP on
create schema if not exists auth; create schema if not exists private;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
end $$;
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid $$;
create table trips (id uuid primary key default gen_random_uuid(), organization_id uuid not null, driver_id uuid, supplier_id uuid, client_id uuid, indent_id uuid);
create table suppliers (id uuid primary key default gen_random_uuid(), linked_organization_id uuid);
create table clients (id uuid primary key default gen_random_uuid(), linked_organization_id uuid);
create table direct_quotes (indent_id uuid, status text, bidder_organization_id uuid);
create table market_bids (indent_id uuid, status text, bidder_type text, bidder_organization_id uuid);
create table organization_members (organization_id uuid, user_id uuid, status text default 'active');
create table drivers (id uuid primary key default gen_random_uuid(), user_id uuid);
create table trip_workflow_events (id uuid primary key default gen_random_uuid(), trip_id uuid not null references trips(id), org_id uuid not null, actor_id uuid, event_type text not null, payload jsonb not null default '{}', created_at timestamptz not null default now(), idempotency_key text);
create unique index trip_workflow_events_idempotency_key_unique on trip_workflow_events (idempotency_key) where idempotency_key is not null;
create table trip_operational_timeline_events (id uuid primary key default gen_random_uuid(), organization_id uuid not null, trip_id uuid not null references trips(id), event_type text not null, source_type text, source_id uuid, actor_user_id uuid, payload jsonb not null default '{}', created_at timestamptz not null default now());
grant usage on schema auth, private, public to authenticated, anon;
