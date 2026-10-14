-- Finance Verified: a finance approval step between Compliance Verified and the
-- compliance advance. Compliance verifies documents (compliance_verified_at);
-- Finance then verifies the trip (finance_verified_at); only then can a
-- compliance_advance be posted. Finance can undo its own verify while no
-- advance is on file.
--
-- Sort key is after 20271008101106. This is the committed form of the
-- untracked 20261010122824 draft. Do not apply that older filename.
--
-- Additive: new nullable columns, two RPCs, one guard trigger and one extra
-- RESTRICTIVE insert policy. Existing advance rows are untouched; the policy
-- only applies to new compliance_advance inserts.

-- ── 1. Columns ──────────────────────────────────────────────────────────────

alter table public.trips
  add column if not exists finance_verified_at timestamptz,
  add column if not exists finance_verified_by uuid references auth.users(id) on delete set null;

comment on column public.trips.finance_verified_at is
  'When Finance verified the trip (mark_trip_finance_verified). Required before a compliance_advance can be posted. Cleared by unmark_trip_finance_verified while no advance is on file.';
comment on column public.trips.finance_verified_by is
  'auth.users id of the Finance member who verified the trip.';

-- ── 2. Verify ───────────────────────────────────────────────────────────────

create or replace function public.mark_trip_finance_verified(
  p_trip_id uuid,
  p_idempotency_key text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_org_id      uuid;
  v_verified_at timestamptz;
  v_finance_at  timestamptz;
  v_key         text := nullif(trim(p_idempotency_key), '');
begin
  select organization_id into v_org_id from public.trips where id = p_trip_id;

  if v_org_id is null
     or not public.has_member_surface(v_org_id, 'trip_compliance.finance.manage') then
    raise exception 'not authorized to finance-verify this trip';
  end if;

  select compliance_verified_at, finance_verified_at
    into v_verified_at, v_finance_at
    from public.trips
   where id = p_trip_id
     and organization_id = v_org_id
     for update;

  if not found then
    raise exception 'not authorized to finance-verify this trip';
  end if;

  if v_verified_at is null then
    raise exception 'compliance must be verified before finance verify';
  end if;

  -- Already verified: nothing to do (safe under retry / double click).
  if v_finance_at is not null then
    return;
  end if;

  if exists (
    select 1 from public.transactions
     where trip_id = p_trip_id
       and ledger_category = 'compliance_advance'
  ) then
    raise exception 'an advance is already posted for this trip';
  end if;

  if v_key is not null then
    begin
      insert into public.trip_workflow_events
        (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
      values
        (p_trip_id, v_org_id, v_uid, 'finance.verified',
         jsonb_build_object('compliance_verified_at', v_verified_at),
         p_trip_id::text || ':finance.verified:' || v_key);
    exception when unique_violation then
      return;
    end;
  else
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload)
    values
      (p_trip_id, v_org_id, v_uid, 'finance.verified',
       jsonb_build_object('compliance_verified_at', v_verified_at));
  end if;

  update public.trips
     set finance_verified_at = now(),
         finance_verified_by = v_uid
   where id = p_trip_id;
end;
$$;

revoke all on function public.mark_trip_finance_verified(uuid, text) from public;
revoke all on function public.mark_trip_finance_verified(uuid, text) from anon;
grant execute on function public.mark_trip_finance_verified(uuid, text) to authenticated;

-- ── 3. Undo ─────────────────────────────────────────────────────────────────

create or replace function public.unmark_trip_finance_verified(
  p_trip_id uuid,
  p_idempotency_key text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_org_id     uuid;
  v_finance_at timestamptz;
  v_finance_by uuid;
  v_key        text := nullif(trim(p_idempotency_key), '');
begin
  select organization_id into v_org_id from public.trips where id = p_trip_id;

  if v_org_id is null
     or not public.has_member_surface(v_org_id, 'trip_compliance.finance.manage') then
    raise exception 'not authorized to undo finance verify for this trip';
  end if;

  select finance_verified_at, finance_verified_by
    into v_finance_at, v_finance_by
    from public.trips
   where id = p_trip_id
     and organization_id = v_org_id
     for update;

  if not found then
    raise exception 'not authorized to undo finance verify for this trip';
  end if;

  -- Not verified: nothing to undo (safe under retry / double click).
  if v_finance_at is null then
    return;
  end if;

  if exists (
    select 1 from public.transactions
     where trip_id = p_trip_id
       and ledger_category = 'compliance_advance'
  ) then
    raise exception 'an advance is already posted; finance verify cannot be undone';
  end if;

  if v_key is not null then
    begin
      insert into public.trip_workflow_events
        (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
      values
        (p_trip_id, v_org_id, v_uid, 'finance.verify_undone',
         jsonb_build_object('finance_verified_at', v_finance_at, 'finance_verified_by', v_finance_by),
         p_trip_id::text || ':finance.verify_undone:' || v_key);
    exception when unique_violation then
      return;
    end;
  else
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload)
    values
      (p_trip_id, v_org_id, v_uid, 'finance.verify_undone',
       jsonb_build_object('finance_verified_at', v_finance_at, 'finance_verified_by', v_finance_by));
  end if;

  update public.trips
     set finance_verified_at = null,
         finance_verified_by = null
   where id = p_trip_id;
end;
$$;

revoke all on function public.unmark_trip_finance_verified(uuid, text) from public;
revoke all on function public.unmark_trip_finance_verified(uuid, text) from anon;
grant execute on function public.unmark_trip_finance_verified(uuid, text) to authenticated;

-- ── 4. Guard: the app can only change these columns through the RPCs ───────

create or replace function public.guard_trip_finance_verified_columns()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.finance_verified_at is distinct from old.finance_verified_at
       or new.finance_verified_by is distinct from old.finance_verified_by) then
    raise exception 'finance verify fields can only be changed via mark_trip_finance_verified() or unmark_trip_finance_verified()'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_trip_finance_verified_columns() from public;
revoke all on function public.guard_trip_finance_verified_columns() from anon;
revoke all on function public.guard_trip_finance_verified_columns() from authenticated;

drop trigger if exists trg_guard_trip_finance_verified_columns on public.trips;
create trigger trg_guard_trip_finance_verified_columns
  before update of finance_verified_at, finance_verified_by
  on public.trips
  for each row execute function public.guard_trip_finance_verified_columns();

-- ── 5. Server-side payment gate ─────────────────────────────────────────────
-- Same pattern as compliance_advance_requires_compliance_approved
-- (20260921125437). Insert only: editing the UTR / date of an advance that was
-- posted before this step existed must keep working.

drop policy if exists compliance_advance_requires_finance_verified on public.transactions;
create policy compliance_advance_requires_finance_verified
  on public.transactions
  as restrictive
  for insert
  to authenticated
  with check (
    ledger_category is distinct from 'compliance_advance'
    or exists (
      select 1 from public.trips t
       where t.id = transactions.trip_id
         and t.finance_verified_at is not null
    )
  );

-- Serialize a new advance/balance insert with reject/resubmit, which lock the
-- same trip row before they decide the money check. A plain policy SELECT does
-- not wait on that lock.
create or replace function public.lock_trip_for_compliance_ledger()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if new.trip_id is not null
     and new.ledger_category in ('compliance_advance', 'compliance_balance') then
    perform 1 from public.trips where id = new.trip_id for update;
  end if;
  return new;
end;
$$;

revoke all on function public.lock_trip_for_compliance_ledger() from public;
revoke all on function public.lock_trip_for_compliance_ledger() from anon;
grant execute on function public.lock_trip_for_compliance_ledger() to authenticated;

drop trigger if exists trg_lock_trip_for_compliance_ledger on public.transactions;
create trigger trg_lock_trip_for_compliance_ledger
  before insert on public.transactions
  for each row execute function public.lock_trip_for_compliance_ledger();
