-- Resubmit for Compliance Hold. A pre-verify decline (decline_trip_compliance)
-- now waits for Ground Ops: they re-upload, then Resubmit hands the trip back
-- to Compliance. Same RPC, permission and column as the finance-reject
-- resubmit (20271008113000); only the hold branch is new. A later Decline
-- writes a newer compliance_declined_at, which puts the trip on hold again.
-- Finance-reject behaviour is unchanged.

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
           jsonb_build_object('reason', v_reason),
           p_trip_id::text || ':compliance.hold_resubmitted:' || v_key);
      exception when unique_violation then
        return;
      end;
    else
      insert into public.trip_workflow_events
        (trip_id, org_id, actor_id, event_type, payload)
      values
        (p_trip_id, v_org_id, v_uid, 'compliance.hold_resubmitted',
         jsonb_build_object('reason', v_reason));
    end if;

    update public.trips
       set compliance_resubmitted_at = now()
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
  'Ground Ops resubmit of a Compliance Hold or an active finance reject. Sets compliance_resubmitted_at only; never verifies or clears the decline reason.';

grant execute on function public.resubmit_trip_compliance(uuid, text) to authenticated;
revoke all on function public.resubmit_trip_compliance(uuid, text) from public;
revoke all on function public.resubmit_trip_compliance(uuid, text) from anon;
