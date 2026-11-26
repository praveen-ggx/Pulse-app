do $$
declare
  v_org uuid := '5b471ecb-fbfb-470e-95cf-525d789c761a';
  v_drv_a uuid := 'a0d8ed58-43fd-47ff-8d07-1afdf63bb3df';
  v_drv_b uuid := 'b12af2eb-35a6-4169-bec2-fdce9e0f4123';
  v_user_a uuid := 'c1cded1c-e531-4be6-b1b5-82ea7d57d0e9';
  v_user_b uuid := '9d03b2c2-c82a-4754-bbcd-dfcd07e14883';
  v_user_x uuid := '11289de9-c145-4ed7-99d2-5fbbf3292a0e';
  v_owner uuid;
  v_trip uuid;
  v_lane uuid;
  v_lane_driver uuid;
  v_can_a boolean;
  v_can_b boolean;
  v_can_x boolean;
  v_can_owner boolean;
  v_pass int := 0;
  r record;
begin
  for r in select id from public.trips where trip_number like 'ZZ_QA_REASSIGN_%' loop
    delete from public.trip_conversations where trip_id = r.id;
    delete from public.chat_participants where conversation_id in (select id from public.chat_conversations where trip_id = r.id);
    delete from public.chat_messages where conversation_id in (select id from public.chat_conversations where trip_id = r.id);
    delete from public.chat_conversations where trip_id = r.id;
    delete from public.trips where id = r.id;
  end loop;

  select om.user_id into v_owner from public.organization_members om
  where om.organization_id = v_org and om.status='active' and om.role='owner' limit 1;

  insert into public.trips (
    organization_id, trip_number, pickup_area, drop_location, client_name,
    status, driver_id, operating_mode
  ) values (
    v_org, 'ZZ_QA_REASSIGN_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'),
    'qa reassign pickup', 'qa reassign drop', 'ZZ_QA_REASSIGN_CLIENT',
    'assigned', null, 'FLEET'
  ) returning id into v_trip;

  update public.trips set driver_id = v_drv_a, driver_display_name = 'ZZ_QA_A' where id = v_trip;
  perform public.fn_ensure_trip_party_conversations(v_trip);

  select id, driver_id into v_lane, v_lane_driver from public.trip_conversations where trip_id=v_trip and party_type='driver' limit 1;
  if v_lane is null or v_lane_driver is distinct from v_drv_a then raise exception 'FAIL A lane %', v_lane_driver; end if;

  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a::text, 'role', 'authenticated')::text, true);
  select private.user_can_read_trip_conversation(v_org, v_trip, v_lane_driver) into v_can_a;
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  select private.user_can_read_trip_conversation(v_org, v_trip, v_lane_driver) into v_can_b;
  perform set_config('request.jwt.claim.sub', v_user_x::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_x::text, 'role', 'authenticated')::text, true);
  select private.user_can_read_trip_conversation(v_org, v_trip, v_lane_driver) into v_can_x;
  if not coalesce(v_can_a,false) or coalesce(v_can_b,false) or coalesce(v_can_x,false) then
    raise exception 'FAIL A access a=% b=% x=%', v_can_a, v_can_b, v_can_x;
  end if;
  v_pass := v_pass + 1;

  update public.trips set driver_id=v_drv_b, driver_display_name='ZZ_QA_B' where id=v_trip;
  select id, driver_id into v_lane, v_lane_driver from public.trip_conversations where trip_id=v_trip and party_type='driver' limit 1;
  if v_lane_driver is distinct from v_drv_b then raise exception 'FAIL B lane %', v_lane_driver; end if;
  if (select count(*) from public.trip_conversations where trip_id=v_trip and party_type='driver')<>1 then raise exception 'FAIL B dup'; end if;
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a::text, 'role', 'authenticated')::text, true);
  select private.user_can_read_trip_conversation(v_org, v_trip, v_lane_driver) into v_can_a;
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  select private.user_can_read_trip_conversation(v_org, v_trip, v_lane_driver) into v_can_b;
  if coalesce(v_can_a,false) or not coalesce(v_can_b,false) then raise exception 'FAIL B access a=% b=%', v_can_a, v_can_b; end if;
  v_pass := v_pass + 1;

  update public.trips set driver_id=null, driver_display_name=null where id=v_trip;
  select id, driver_id into v_lane, v_lane_driver from public.trip_conversations where trip_id=v_trip and party_type='driver' limit 1;
  if v_lane is null then raise exception 'FAIL C deleted'; end if;
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  select private.user_can_read_trip_conversation(v_org, v_trip, v_lane_driver) into v_can_b;
  if coalesce(v_can_b,false) then raise exception 'FAIL C B access'; end if;
  if v_owner is not null then
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
    select private.user_can_read_trip_conversation(v_org, v_trip, v_lane_driver) into v_can_owner;
    if not coalesce(v_can_owner,false) then raise exception 'FAIL C owner'; end if;
  end if;
  v_pass := v_pass + 1;

  update public.trips set driver_id=v_drv_a, driver_display_name='ZZ_QA_A' where id=v_trip;
  select id, driver_id into v_lane, v_lane_driver from public.trip_conversations where trip_id=v_trip and party_type='driver' limit 1;
  if v_lane_driver is distinct from v_drv_a then raise exception 'FAIL D lane %', v_lane_driver; end if;
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a::text, 'role', 'authenticated')::text, true);
  select private.user_can_read_trip_conversation(v_org, v_trip, v_lane_driver) into v_can_a;
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  select private.user_can_read_trip_conversation(v_org, v_trip, v_lane_driver) into v_can_b;
  if not coalesce(v_can_a,false) or coalesce(v_can_b,false) then raise exception 'FAIL D access a=% b=%', v_can_a, v_can_b; end if;
  v_pass := v_pass + 1;

  update public.trips set driver_id=v_drv_a where id=v_trip;
  if (select count(*) from public.trip_conversations where trip_id=v_trip and party_type='driver')<>1 then raise exception 'FAIL E dup'; end if;
  v_pass := v_pass + 1;

  delete from public.trip_conversations where trip_id=v_trip;
  delete from public.chat_participants where conversation_id in (select id from public.chat_conversations where trip_id=v_trip);
  delete from public.chat_messages where conversation_id in (select id from public.chat_conversations where trip_id=v_trip);
  delete from public.chat_conversations where trip_id=v_trip;
  delete from public.trips where id=v_trip;

  raise notice 'RESULT pass=%', v_pass;
  if v_pass <> 5 then raise exception 'incomplete pass count %', v_pass; end if;
end $$;

select 'MATRIX_PASS' as status;