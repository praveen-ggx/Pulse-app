-- Finance Reject stores a server-derived return queue and clears finance
-- approval. Resubmit records compliance_resubmitted_at and does not verify.
-- Depends on 20271008112000_finance_verified_step.sql (finance columns + lock).
-- compliance_verified_at is never changed here.

-- ── 1. Columns ──────────────────────────────────────────────────────────────

alter table public.trips
  add column if not exists compliance_reject_return_to text,
  add column if not exists compliance_resubmitted_at timestamptz;

alter table public.trips
  drop constraint if exists trips_compliance_reject_return_to_check;
alter table public.trips
  add constraint trips_compliance_reject_return_to_check
  check (
    compliance_reject_return_to is null
    or compliance_reject_return_to in ('pending_for_docs', 'compliance_pending')
  );

comment on column public.trips.compliance_reject_return_to is
  'Server-derived queue for a finance reject: pending_for_docs or compliance_pending. Null on pre-verify declines and on legacy rejects whose reason is not a known preset. Set only by reject_trip_compliance.';
comment on column public.trips.compliance_resubmitted_at is
  'When Ground Ops resubmitted the latest finance reject. Active again when a newer compliance_declined_at is written.';

-- ── 2. Destination (mirrors complianceRejectQueueDestination) ───────────────

create or replace function public.compliance_reject_return_queue(p_reason text)
  returns text
  language plpgsql
  immutable
  set search_path = public
as $$
declare
  v_raw text := btrim(coalesce(p_reason, ''));
  v_part text;
  v_has_docs boolean := false;
  v_has_finance boolean := false;
  v_other text[] := array[]::text[];
  v_piece text;
begin
  if v_raw = '' then
    return 'compliance_pending';
  end if;

  foreach v_part in array regexp_split_to_array(v_raw, '\s*;\s*')
  loop
    v_piece := btrim(v_part);
    if v_piece = '' then
      continue;
    end if;
    if lower(v_piece) in ('truck no mismatch', 'client date mismatch') then
      v_has_docs := true;
    elsif lower(v_piece) in ('memo missing', 'vendor mismatch', 'vendor rate mismatch') then
      v_has_finance := true;
    else
      v_other := array_append(v_other, v_piece);
    end if;
  end loop;

  if v_has_docs then
    return 'pending_for_docs';
  end if;

  if exists (
    select 1
      from unnest(v_other) as other_part
     where other_part ~* '\m(document|docs?|lr|invoice|e-?way|pod|upload|scan|blurry|photo|file|pending)\M'
  ) then
    return 'pending_for_docs';
  end if;

  if v_has_finance or cardinality(v_other) > 0 then
    return 'compliance_pending';
  end if;

  return 'compliance_pending';
end;
$$;

revoke all on function public.compliance_reject_return_queue(text) from public;
revoke all on function public.compliance_reject_return_queue(text) from anon;
grant execute on function public.compliance_reject_return_queue(text) to authenticated;

-- ── 3. Reject ───────────────────────────────────────────────────────────────

create or replace function public.reject_trip_compliance(
  p_trip_id uuid,
  p_reason text,
  p_idempotency_key text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid             uuid := auth.uid();
  v_org_id          uuid;
  v_verified_at     timestamptz;
  v_previous_reason text;
  v_reason          text := regexp_replace(coalesce(p_reason, ''), '^\s+|\s+$', '', 'g');
  v_key             text := nullif(trim(p_idempotency_key), '');
  v_dest            text;
  v_payload         jsonb;
begin
  select organization_id into v_org_id from public.trips where id = p_trip_id;

  if v_org_id is null
     or not public.has_member_surface(v_org_id, 'trip_compliance.trip.mark_verified') then
    raise exception 'not authorized to reject compliance for this trip';
  end if;

  select compliance_verified_at, compliance_decline_reason
    into v_verified_at, v_previous_reason
    from public.trips
   where id = p_trip_id
     and organization_id = v_org_id
     for update;

  if not found then
    raise exception 'not authorized to reject compliance for this trip';
  end if;

  if v_verified_at is null then
    raise exception 'trip compliance is not verified; use decline instead';
  end if;

  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'a reject reason between 3 and 500 characters is required';
  end if;

  -- Lock posted ledger rows, then refuse before any event or column write.
  perform 1
    from public.transactions
   where trip_id = p_trip_id
     and ledger_category in ('compliance_advance', 'compliance_balance')
   for update;

  if exists (
    select 1 from public.transactions
     where trip_id = p_trip_id
       and ledger_category in ('compliance_advance', 'compliance_balance')
  ) then
    raise exception 'an advance or balance is already posted; compliance cannot be rejected';
  end if;

  v_dest := public.compliance_reject_return_queue(v_reason);
  v_payload := jsonb_build_object(
    'reason', v_reason,
    'previous_reason', v_previous_reason,
    'mode', 'reject_verified',
    'return_to', v_dest
  );

  if v_key is not null then
    begin
      insert into public.trip_workflow_events
        (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
      values
        (p_trip_id, v_org_id, v_uid, 'compliance.rejected', v_payload,
         p_trip_id::text || ':compliance.rejected:' || v_key);
    exception when unique_violation then
      return;
    end;
  else
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload)
    values
      (p_trip_id, v_org_id, v_uid, 'compliance.rejected', v_payload);
  end if;

  -- compliance_verified_at stays. A later decline time reopens the inbox
  -- even if compliance_resubmitted_at is already set.
  update public.trips
     set compliance_declined_at = now(),
         compliance_declined_by = v_uid,
         compliance_decline_reason = v_reason,
         compliance_reject_return_to = v_dest,
         finance_verified_at = null,
         finance_verified_by = null
   where id = p_trip_id;
end;
$$;

comment on function public.reject_trip_compliance(uuid, text, text) is
  'Reject a verified trip. Keeps compliance_verified_at, stores the return queue, and clears finance approval when no advance or balance exists.';

grant execute on function public.reject_trip_compliance(uuid, text, text) to authenticated;
revoke all on function public.reject_trip_compliance(uuid, text, text) from public;
revoke all on function public.reject_trip_compliance(uuid, text, text) from anon;

-- ── 4. Resubmit ─────────────────────────────────────────────────────────────

create or replace function public.resubmit_trip_compliance(
  p_trip_id uuid,
  p_idempotency_key text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_org_id       uuid;
  v_verified_at  timestamptz;
  v_declined_at  timestamptz;
  v_resubmitted  timestamptz;
  v_return_to    text;
  v_reason       text;
  v_key          text := nullif(trim(p_idempotency_key), '');
begin
  select organization_id into v_org_id from public.trips where id = p_trip_id;

  if v_org_id is null
     or not public.has_member_surface(v_org_id, 'trip_compliance.trip.resubmit') then
    raise exception 'not authorized to resubmit compliance for this trip';
  end if;

  select compliance_verified_at, compliance_declined_at, compliance_resubmitted_at,
         compliance_reject_return_to, compliance_decline_reason
    into v_verified_at, v_declined_at, v_resubmitted, v_return_to, v_reason
    from public.trips
   where id = p_trip_id
     and organization_id = v_org_id
     for update;

  if not found then
    raise exception 'not authorized to resubmit compliance for this trip';
  end if;

  if v_verified_at is null or v_declined_at is null or v_declined_at < v_verified_at then
    raise exception 'trip is not an active finance reject';
  end if;

  if v_resubmitted is not null and v_resubmitted >= v_declined_at then
    return;
  end if;

  if v_return_to is null
     or v_return_to not in ('pending_for_docs', 'compliance_pending') then
    raise exception 'this reject has no return queue';
  end if;

  perform 1
    from public.transactions
   where trip_id = p_trip_id
     and ledger_category in ('compliance_advance', 'compliance_balance')
   for update;

  if exists (
    select 1 from public.transactions
     where trip_id = p_trip_id
       and ledger_category in ('compliance_advance', 'compliance_balance')
  ) then
    raise exception 'an advance or balance is already posted; compliance cannot be resubmitted';
  end if;

  if v_key is not null then
    begin
      insert into public.trip_workflow_events
        (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
      values
        (p_trip_id, v_org_id, v_uid, 'compliance.resubmitted',
         jsonb_build_object('return_to', v_return_to, 'reason', v_reason),
         p_trip_id::text || ':compliance.resubmitted:' || v_key);
    exception when unique_violation then
      return;
    end;
  else
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload)
    values
      (p_trip_id, v_org_id, v_uid, 'compliance.resubmitted',
       jsonb_build_object('return_to', v_return_to, 'reason', v_reason));
  end if;

  update public.trips
     set compliance_resubmitted_at = now()
   where id = p_trip_id;
end;
$$;

comment on function public.resubmit_trip_compliance(uuid, text) is
  'Ground Ops resubmit of an active finance reject. Does not set compliance_verified_at or clear the decline reason.';

grant execute on function public.resubmit_trip_compliance(uuid, text) to authenticated;
revoke all on function public.resubmit_trip_compliance(uuid, text) from public;
revoke all on function public.resubmit_trip_compliance(uuid, text) from anon;

-- ── 5. Guard ────────────────────────────────────────────────────────────────

create or replace function public.guard_trip_compliance_decline_columns()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.compliance_declined_at    is distinct from old.compliance_declined_at
       or new.compliance_declined_by    is distinct from old.compliance_declined_by
       or new.compliance_decline_reason is distinct from old.compliance_decline_reason
       or new.compliance_reject_return_to is distinct from old.compliance_reject_return_to
       or new.compliance_resubmitted_at is distinct from old.compliance_resubmitted_at) then
    raise exception 'compliance decline fields can only be changed via decline_trip_compliance(), reject_trip_compliance(), or resubmit_trip_compliance()'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_trip_compliance_decline_columns() from public;
revoke all on function public.guard_trip_compliance_decline_columns() from anon;
revoke all on function public.guard_trip_compliance_decline_columns() from authenticated;

drop trigger if exists trg_guard_trip_compliance_decline_columns on public.trips;
create trigger trg_guard_trip_compliance_decline_columns
  before update of compliance_declined_at, compliance_declined_by, compliance_decline_reason,
                 compliance_reject_return_to, compliance_resubmitted_at
  on public.trips
  for each row execute function public.guard_trip_compliance_decline_columns();
