-- Return a trip to Awaiting POD when hard-copy receipt was logged incorrectly.
-- Clears trips.pod_received_at (the received gate) and writes pod.hard_copy_not_found.

SET LOCAL lock_timeout = '5s';

create or replace function public.report_trip_hard_copy_pod_not_found(
  p_trip_id uuid,
  p_reason text
)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_org_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception 'reason is required';
  end if;

  select organization_id
    into v_org_id
    from public.trips
   where id = p_trip_id
     for update;

  if v_org_id is null then
    raise exception 'trip not found';
  end if;

  if not public.has_member_surface(v_org_id, 'trip_compliance.pod.manage') then
    raise exception 'not authorized to report hard-copy POD not found for this organization';
  end if;

  update public.trips
     set pod_received_at = null
   where id = p_trip_id;

  begin
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
    values
      (p_trip_id, v_org_id, v_uid, 'pod.hard_copy_not_found',
       jsonb_build_object(
         'v', 1,
         'posted_at', now(),
         'reason', v_reason
       ),
       p_trip_id::text || ':pod.hard_copy_not_found');
  exception when unique_violation then
    update public.trip_workflow_events
       set actor_id = v_uid,
           payload = jsonb_build_object(
             'v', 1,
             'posted_at', now(),
             'reason', v_reason
           )
     where trip_id = p_trip_id
       and event_type = 'pod.hard_copy_not_found'
       and idempotency_key = p_trip_id::text || ':pod.hard_copy_not_found';
  end;

  return true;
end;
$$;

comment on function public.report_trip_hard_copy_pod_not_found(uuid, text) is
  'Clears trips.pod_received_at after an incorrect hard-copy log and records the reason.';

revoke all on function public.report_trip_hard_copy_pod_not_found(uuid, text) from public;
grant execute on function public.report_trip_hard_copy_pod_not_found(uuid, text) to authenticated;
