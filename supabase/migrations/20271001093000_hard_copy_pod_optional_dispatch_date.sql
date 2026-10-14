-- Dispatch date is optional when logging a courier hard-copy POD.
-- Same body as 20270930220000_restore_nihas_v1_merge_schema.sql, minus the
-- "dispatch date is required" check.

create or replace function public.log_trip_hard_copy_pod_courier(
  p_trip_id uuid,
  p_courier text,
  p_awb_number text,
  p_dispatch_date date default null,
  p_expected_delivery_date date default null,
  p_courier_contact text default null,
  p_remarks text default null
)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_org_id      uuid;
  v_already     timestamptz;
  v_courier     text := nullif(trim(coalesce(p_courier, '')), '');
  v_awb         text := nullif(trim(coalesce(p_awb_number, '')), '');
  v_contact     text := nullif(trim(coalesce(p_courier_contact, '')), '');
  v_remarks     text := nullif(trim(coalesce(p_remarks, '')), '');
  v_key         text;
  v_payload     jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if v_courier is null then
    raise exception 'courier name is required';
  end if;

  if v_awb is null then
    raise exception 'tracking / AWB number is required';
  end if;

  select organization_id, pod_received_at
    into v_org_id, v_already
    from public.trips
   where id = p_trip_id
     for update;

  if v_org_id is null then
    raise exception 'trip not found';
  end if;

  if not public.has_member_surface(v_org_id, 'trip_compliance.pod.manage') then
    raise exception 'not authorized to record hard-copy POD for this organization';
  end if;

  if v_already is not null then
    -- Already RECEIVED — do not demote to courier-in-transit.
    return false;
  end if;

  update public.trips
     set pod_hard_copy_courier = v_courier,
         pod_hard_copy_awb_number = v_awb
         -- intentionally leave pod_received_at and pod_hard_copy_received_by alone
   where id = p_trip_id;

  v_key := p_trip_id::text || ':pod.hard_copy_courier_dispatched';
  v_payload := jsonb_build_object(
    'courier', v_courier,
    'awb_number', v_awb,
    'dispatch_date', p_dispatch_date,
    'expected_delivery_date', p_expected_delivery_date,
    'courier_contact', v_contact,
    'remarks', v_remarks,
    'receipt_method', 'courier'
  );

  begin
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
    values
      (p_trip_id, v_org_id, v_uid, 'pod.hard_copy_courier_dispatched',
       v_payload, v_key);
  exception when unique_violation then
    update public.trip_workflow_events
       set payload = v_payload,
           actor_id = v_uid,
           created_at = now()
     where idempotency_key = v_key;
  end;

  return true;
end;
$$;

comment on function public.log_trip_hard_copy_pod_courier(uuid, text, text, date, date, text, text) is
  'Log courier hard-copy POD dispatch (IN TRANSIT). Dispatch date is optional. '
  'Does not set pod_received_at. Mark received later via record_trip_hard_copy_pod.';

revoke all on function public.log_trip_hard_copy_pod_courier(uuid, text, text, date, date, text, text) from public;
grant execute on function public.log_trip_hard_copy_pod_courier(uuid, text, text, date, date, text, text) to authenticated;
