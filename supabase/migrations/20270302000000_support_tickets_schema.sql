-- Support System S1 — Support Foundation, schema + RLS only (no RPCs here; see the
-- companion migration 20270302010000_support_ticket_rpcs.sql for the write paths).
--
-- Architecture: native Pulse domain, lives entirely in this project. pulsetrack
-- (the separate internal PulseTrack engineering/QA tracker) is NOT touched, extended,
-- referenced, or migrated by this work — confirmed out of scope per
-- docs/SUPPORT_SYSTEM_PLAN.md.
--
-- RLS design: every table below has RLS enabled with SELECT-only policies for
-- `authenticated`. There are deliberately NO insert/update policies on any of these
-- tables — all writes go through SECURITY DEFINER RPCs (submit_support_ticket,
-- reply_to_support_ticket), the same convention already used for market_bids. A plain
-- client-side `.insert()`/`.update()` against these tables will be rejected by RLS.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  display_id text not null,
  created_by_user_id uuid not null references auth.users(id),
  organization_id uuid references public.organizations(id),
  category text not null,
  subject text not null,
  description text not null,
  status text not null default 'open',
  priority text not null default 'medium',
  -- Not FK'd yet -- the S3 support-agent identity table doesn't exist. Left as a bare
  -- uuid placeholder, unused by any RPC in this phase; S3 adds the real constraint.
  assigned_to uuid,
  source_screen text,
  trip_id uuid references public.trips(id),
  indent_id uuid references public.indents(id),
  owner_vehicle_id uuid references public.owner_vehicles(id),
  market_bid_id uuid references public.market_bids(id),
  -- Denormalized for the list view, so "My Support Tickets" doesn't need a join for the
  -- common case. Not treated as authoritative -- source of truth is always the FK.
  reporter_display_name text,
  organization_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  constraint support_tickets_display_id_unique unique (display_id),
  constraint support_tickets_status_check check (
    status = any (array['open','assigned','in_progress','waiting_for_user','resolved','closed'])
  ),
  constraint support_tickets_priority_check check (
    priority = any (array['low','medium','high','critical'])
  )
);

create index idx_support_tickets_created_by on public.support_tickets(created_by_user_id);
create index idx_support_tickets_status on public.support_tickets(status);

-- Display-ID generation: SUP-000001, SUP-000002, ... independent of pulsetrack's own
-- PLS-nnn sequence (separate system, separate counter).
create sequence public.support_ticket_display_seq;

create or replace function public._next_support_ticket_display_id()
returns text
language sql
set search_path to ''
as $function$
  select 'SUP-' || lpad(nextval('public.support_ticket_display_seq')::text, 6, '0');
$function$;

create table if not exists public.support_ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_user_id uuid not null references auth.users(id),
  body text not null,
  visibility text not null default 'public',
  created_at timestamptz not null default now(),
  constraint support_ticket_comments_visibility_check check (
    visibility = any (array['public','internal'])
  )
);

create index idx_support_ticket_comments_ticket on public.support_ticket_comments(ticket_id);

-- Internal/admin audit trail. Deliberately has no SELECT policy for `authenticated` at
-- all -- only service_role (the Admin Console, from S2 onward) can read this table.
-- A regular Pulse user must never see this, per the product spec's "cannot see
-- internal activity" boundary -- enforced by the absence of a policy, not app logic.
create table if not exists public.support_ticket_activity (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index idx_support_ticket_activity_ticket on public.support_ticket_activity(ticket_id);

-- Schema only in S1 -- no upload UI or storage bucket yet (that's S4). Table exists now
-- so the RPCs/migrations don't need to change shape later.
create table if not exists public.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  comment_id uuid references public.support_ticket_comments(id) on delete cascade,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_support_ticket_attachments_ticket on public.support_ticket_attachments(ticket_id);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_comments enable row level security;
alter table public.support_ticket_activity enable row level security;
alter table public.support_ticket_attachments enable row level security;

create policy support_tickets_select on public.support_tickets
  for select
  using (created_by_user_id = (select auth.uid()));

-- Enforced at the database level, not just app-side filtering: a user can never select
-- an internal comment on their own ticket, regardless of what the client asks for.
create policy support_ticket_comments_select on public.support_ticket_comments
  for select
  using (
    visibility = 'public'
    and exists (
      select 1 from public.support_tickets t
      where t.id = support_ticket_comments.ticket_id
        and t.created_by_user_id = (select auth.uid())
    )
  );

create policy support_ticket_attachments_select on public.support_ticket_attachments
  for select
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = support_ticket_attachments.ticket_id
        and t.created_by_user_id = (select auth.uid())
    )
  );

-- No policy on support_ticket_activity for `authenticated` -- default-deny by design.
