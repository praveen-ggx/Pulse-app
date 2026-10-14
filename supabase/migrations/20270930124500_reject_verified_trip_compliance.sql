-- Reject a verified Compliance trip without removing it from the Verified
-- stage. Sets compliance_declined_* while keeping compliance_verified_at so
-- the trip stays under Verified with a Rejected (red) visual. Payment is
-- blocked client-side while the decline reason is present.
--
-- SECURITY DEFINER bypasses trg_guard_trip_compliance_decline_columns
-- (same pattern as decline_trip_compliance).

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

  v_payload := jsonb_build_object(
    'reason', v_reason,
    'previous_reason', v_previous_reason,
    'mode', 'reject_verified'
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

  update public.trips
     set compliance_declined_at = now(),
         compliance_declined_by = v_uid,
         compliance_decline_reason = v_reason
   where id = p_trip_id;
end;
$$;

comment on function public.reject_trip_compliance(uuid, text, text) is
  'Reject a verified Compliance trip with a reason. Keeps compliance_verified_at so the trip remains in the Verified stage with a Rejected visual.';

grant execute on function public.reject_trip_compliance(uuid, text, text) to authenticated;
revoke all on function public.reject_trip_compliance(uuid, text, text) from public;
revoke all on function public.reject_trip_compliance(uuid, text, text) from anon;

-- Allow both decline and reject RPCs to write the decline columns.
create or replace function public.guard_trip_compliance_decline_columns()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.compliance_declined_at    is distinct from old.compliance_declined_at
       or new.compliance_declined_by    is distinct from old.compliance_declined_by
       or new.compliance_decline_reason is distinct from old.compliance_decline_reason) then
    raise exception 'compliance decline fields can only be changed via decline_trip_compliance() or reject_trip_compliance()'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
