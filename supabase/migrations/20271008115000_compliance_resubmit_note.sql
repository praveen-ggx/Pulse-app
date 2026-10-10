-- Resubmit note. Ground Ops must say what they fixed when they resubmit a
-- Compliance Hold or a finance reject ("Invoice re-uploaded", ...). The note
-- is stored on the trip (shown to Compliance / Finance) and in the event
-- payload. Replaces resubmit_trip_compliance(uuid, text) with
-- (uuid, text, text); the old signature is dropped so a call without a note
-- fails instead of resubmitting silently.

alter table public.trips
  add column if not exists compliance_resubmit_note text;

alter table public.trips
  drop constraint if exists trips_compliance_resubmit_note_check;
alter table public.trips
  add constraint trips_compliance_resubmit_note_check
  check (compliance_resubmit_note is null or char_length(compliance_resubmit_note) <= 500);

comment on column public.trips.compliance_resubmit_note is
  'Ground Ops note on the latest resubmit (what was fixed). Set only by resubmit_trip_compliance.';

drop function if exists public.resubmit_trip_compliance(uuid, text);

create or replace function public.resubmit_trip_compliance(
  p_trip_id uuid,
  p_note text,
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
  v_note         text := regexp_replace(coalesce(p_note, ''), '^\s+|\s+$', '', 'g');
begin
  if char_length(v_note) < 3 or char_length(v_note) > 500 then
    raise exception 'a resubmit note between 3 and 500 characters is required';
  end if;

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

  -- Compliance Hold (pre-verify decline): Ground Ops re-uploaded the files and
  -- hands the trip back to Compliance. No return queue, no money check needed
  -- (an advance cannot exist before verification).
  if v_verified_at is null then
    if v_declined_at is null then
      raise exception 'trip is not on compliance hold';
    end if;
    if v_resubmitted is not null and v_resubmitted >= v_declined_at then
      return;
    end if;

    if v_key is not null then
      begin
        insert into public.trip_workflow_events
          (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
        values
          (p_trip_id, v_org_id, v_uid, 'compliance.hold_resubmitted',
           jsonb_build_object('reason', v_reason, 'note', v_note),
           p_trip_id::text || ':compliance.hold_resubmitted:' || v_key);
      exception when unique_violation then
        return;
      end;
    else
      insert into public.trip_workflow_events
        (trip_id, org_id, actor_id, event_type, payload)
      values
        (p_trip_id, v_org_id, v_uid, 'compliance.hold_resubmitted',
         jsonb_build_object('reason', v_reason, 'note', v_note));
    end if;

    update public.trips
       set compliance_resubmitted_at = now(),
           compliance_resubmit_note = v_note
     where id = p_trip_id;
    return;
  end if;

  if v_declined_at is null or v_declined_at < v_verified_at then
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
         jsonb_build_object('return_to', v_return_to, 'reason', v_reason, 'note', v_note),
         p_trip_id::text || ':compliance.resubmitted:' || v_key);
    exception when unique_violation then
      return;
    end;
  else
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload)
    values
      (p_trip_id, v_org_id, v_uid, 'compliance.resubmitted',
       jsonb_build_object('return_to', v_return_to, 'reason', v_reason, 'note', v_note));
  end if;

  update public.trips
     set compliance_resubmitted_at = now(),
         compliance_resubmit_note = v_note
   where id = p_trip_id;
end;
$$;

comment on function public.resubmit_trip_compliance(uuid, text, text) is
  'Ground Ops resubmit of a Compliance Hold or an active finance reject, with a required note. Sets compliance_resubmitted_at and compliance_resubmit_note only; never verifies or clears the decline reason.';

grant execute on function public.resubmit_trip_compliance(uuid, text, text) to authenticated;
revoke all on function public.resubmit_trip_compliance(uuid, text, text) from public;
revoke all on function public.resubmit_trip_compliance(uuid, text, text) from anon;

-- Guard: the note can only change through the RPC.
create or replace function public.guard_trip_compliance_decline_columns()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.compliance_declined_at      is distinct from old.compliance_declined_at
       or new.compliance_declined_by      is distinct from old.compliance_declined_by
       or new.compliance_decline_reason   is distinct from old.compliance_decline_reason
       or new.compliance_reject_return_to is distinct from old.compliance_reject_return_to
       or new.compliance_resubmitted_at   is distinct from old.compliance_resubmitted_at
       or new.compliance_resubmit_note    is distinct from old.compliance_resubmit_note) then
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
                 compliance_reject_return_to, compliance_resubmitted_at, compliance_resubmit_note
  on public.trips
  for each row execute function public.guard_trip_compliance_decline_columns();
