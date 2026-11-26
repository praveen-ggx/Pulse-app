-- Behaviour assertions for the two event functions. Run by scripts/run-trip-event-functions-local-test.sh
-- on a throwaway local Postgres after the stub schema and the three migrations are applied.
\set ON_ERROR_STOP on
create table _ids as select
  gen_random_uuid() orgA, gen_random_uuid() orgB, gen_random_uuid() orgC, gen_random_uuid() orgD,
  gen_random_uuid() uA, gen_random_uuid() uInactive, gen_random_uuid() uB, gen_random_uuid() uC, gen_random_uuid() uD,
  gen_random_uuid() uDriver, gen_random_uuid() uDriver2, gen_random_uuid() uNobody,
  gen_random_uuid() supplierB, gen_random_uuid() clientD, gen_random_uuid() driver1, gen_random_uuid() driver2,
  gen_random_uuid() trip1, gen_random_uuid() trip2, gen_random_uuid() indent1,
  gen_random_uuid() orgE, gen_random_uuid() uE;
-- orgA owns trip1 (supplier linked to orgB, client linked to orgD, accepted quote by orgC? no: orgC unrelated)
insert into suppliers select supplierB, orgB from _ids;
insert into clients select clientD, orgD from _ids;
insert into drivers select driver1, uDriver from _ids;
insert into drivers select driver2, uDriver2 from _ids;
insert into trips (id, organization_id, driver_id, supplier_id, client_id, indent_id) select trip1, orgA, driver1, supplierB, clientD, indent1 from _ids;
insert into trips (id, organization_id, driver_id) select trip2, orgC, driver2 from _ids;
insert into organization_members select orgA, uA, 'active' from _ids;
insert into organization_members select orgA, uInactive, 'inactive' from _ids;
insert into organization_members select orgB, uB, 'active' from _ids;
insert into organization_members select orgC, uC, 'active' from _ids;
insert into organization_members select orgD, uD, 'active' from _ids;
insert into market_bids select indent1, 'accepted', 'organization', orgE from _ids;
insert into market_bids select indent1, 'rejected', 'organization', orgC from _ids;
insert into organization_members select orgE, uE, 'active' from _ids;
grant select on _ids to authenticated, anon;

create or replace function _as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
end $$;
create or replace function _ids_get(p_col text) returns uuid language plpgsql as $$
declare v uuid; begin execute format('select %I from _ids', p_col) into v; return v; end $$;

create table _results (n serial, name text, ok boolean, detail text);
grant all on _results to authenticated, anon;
grant usage on sequence _results_n_seq to authenticated, anon;
create or replace function _expect_ok(p_name text, p_sql text) returns void language plpgsql as $$
begin
  begin execute p_sql; insert into _results(name, ok) values (p_name, true);
  exception when others then insert into _results(name, ok, detail) values (p_name, false, 'unexpected error: '||sqlerrm); end;
end $$;
create or replace function _expect_err(p_name text, p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin execute p_sql; insert into _results(name, ok, detail) values (p_name, false, 'expected error, got success');
  exception when others then
    if sqlerrm like p_like then insert into _results(name, ok) values (p_name, true);
    else insert into _results(name, ok, detail) values (p_name, false, 'wrong error: '||sqlerrm); end if;
  end;
end $$;

create or replace function _assert(p_name text, p_cond_sql text) returns void language plpgsql as $$
declare v boolean;
begin
  execute 'select coalesce((' || p_cond_sql || '), false)' into v;
  insert into _results(name, ok, detail) values (p_name, v, case when v then null else 'condition was false' end);
end $$;

-- helper: build a call string
create or replace function _tl(p_event text, p_org text, p_extra text default '') returns text language sql as $$
  select format('select public.record_trip_operational_timeline_event((select trip1 from _ids), %L, %s %s)', p_event, p_org, p_extra)
$$;

set role authenticated;

-- ===== timeline function =====
select _as((select uA from _ids));
select _expect_ok('timeline: owner-org member writes', _tl('approval_changed','(select orgA from _ids)', ',''manual''::text'));
select _as((select uB from _ids));
select _expect_ok('timeline: linked-supplier org member writes under its own org', _tl('fuel_logged','(select orgB from _ids)'));
select _as((select uD from _ids));
select _expect_ok('timeline: linked-client org member writes under its own org', _tl('fuel_logged','(select orgD from _ids)'));
select _as((select uE from _ids));
select _expect_ok('timeline: accepted marketplace-winner org member writes under its own org', _tl('fuel_logged','(select orgE from _ids)'));
select _as((select uC from _ids));
select _expect_err('timeline: a REJECTED marketplace bidder org is not a party', _tl('fuel_logged','(select orgC from _ids)'), 'unauthorized%');
select _expect_err('timeline: unrelated org member cannot write to another org''s trip (own org id)', _tl('fuel_logged','(select orgC from _ids)'), 'unauthorized%');
select _expect_err('timeline: unrelated org member cannot write under the trip org', _tl('fuel_logged','(select orgA from _ids)'), 'unauthorized%');
select _as((select uInactive from _ids));
select _expect_err('timeline: inactive member denied', _tl('fuel_logged','(select orgA from _ids)'), 'unauthorized%');
select _as((select uNobody from _ids));
select _expect_err('timeline: outsider denied', _tl('fuel_logged','null'), 'unauthorized%');
select _expect_err('timeline: missing trip gives the same generic error', 'select public.record_trip_operational_timeline_event(gen_random_uuid(), ''fuel_logged'')', 'unauthorized%');

select _as((select uDriver from _ids));
select _expect_ok('driver: allowed event type', _tl('odometer_added','null'));
select _expect_ok('driver: cancelling own request (approval_changed + action)', _tl('approval_changed','null', ',null,null,null,''{"action":"driver_cancelled"}''::jsonb'));
select _expect_err('driver: approval_changed without the cancel action denied', _tl('approval_changed','null'), 'unauthorized%');
select _expect_err('driver: posting_completed denied', _tl('posting_completed','null'), 'unauthorized%');
select _expect_err('driver: maintenance_logged denied', _tl('maintenance_logged','null'), 'unauthorized%');
select _expect_err('driver: other org id denied', _tl('odometer_added','(select orgB from _ids)'), 'unauthorized%');
select _expect_ok('driver: tries to forge actor (write goes through, actor is overridden)', _tl('discrepancy_detected','null', ',null,null,(select uA from _ids)'));
select _as((select uDriver2 from _ids));
select _expect_err('driver: not assigned to this trip denied', _tl('odometer_added','null'), 'unauthorized%');

reset role;
select _expect_ok('driver actor is always the caller', $q$
  do $x$ begin
    if exists (select 1 from trip_operational_timeline_events e, _ids i where e.event_type='discrepancy_detected' and e.actor_user_id <> i.uDriver) then raise exception 'actor was not overridden'; end if;
    if not exists (select 1 from trip_operational_timeline_events e, _ids i where e.event_type='discrepancy_detected' and e.actor_user_id = i.uDriver) then raise exception 'row missing'; end if;
  end $x$ $q$);

-- retry safety: identical call twice -> one row, same id
set role authenticated;
select _as((select uA from _ids));
create temp table _dup as select public.record_trip_operational_timeline_event((select trip1 from _ids), 'toll_logged', (select orgA from _ids), 'toll', (select driver1 from _ids), (select uA from _ids), '{"a":1}'::jsonb) id1;
alter table _dup add column id2 uuid;
update _dup set id2 = public.record_trip_operational_timeline_event((select trip1 from _ids), 'toll_logged', (select orgA from _ids), 'toll', (select driver1 from _ids), (select uA from _ids), '{"a":1}'::jsonb);
select _assert('timeline: identical retry returns the same row id', 'select id1 = id2 from _dup');
select _expect_ok('timeline: a different payload is a new row', 'select public.record_trip_operational_timeline_event((select trip1 from _ids), ''toll_logged'', (select orgA from _ids), ''toll'', (select driver1 from _ids), (select uA from _ids), ''{"a":2}''::jsonb)');
reset role;
select _assert('timeline: exactly 2 toll rows (1 deduped, 1 distinct)', 'select count(*) = 2 from trip_operational_timeline_events where event_type=''toll_logged''');

-- events WITHOUT a source id are never merged, even when identical
set role authenticated;
select _as((select uA from _ids));
select _expect_ok('timeline: two identical events with no source id, first', 'select public.record_trip_operational_timeline_event((select trip1 from _ids), ''other_expense_logged'', (select orgA from _ids), null, null, (select uA from _ids), ''{"amount":500}''::jsonb)');
select _expect_ok('timeline: two identical events with no source id, second', 'select public.record_trip_operational_timeline_event((select trip1 from _ids), ''other_expense_logged'', (select orgA from _ids), null, null, (select uA from _ids), ''{"amount":500}''::jsonb)');
reset role;
select _assert('timeline: both no-source events were recorded (2 rows)', 'select count(*) = 2 from trip_operational_timeline_events where event_type=''other_expense_logged''');

-- ===== workflow function =====
set role authenticated;
select _as((select uA from _ids));
select _expect_ok('workflow: owner member inserts singleton', $q$select public.record_trip_workflow_event((select trip1 from _ids),(select orgA from _ids),'pod.uploaded','{}'::jsonb,(select trip1::text||':pod.uploaded' from _ids))$q$);
select _as((select uB from _ids));
select _expect_ok('workflow: duplicate singleton from linked supplier org is a quiet no-op (NULL, no error)', $q$select public.record_trip_workflow_event((select trip1 from _ids),(select orgB from _ids),'pod.uploaded','{}'::jsonb,(select trip1::text||':pod.uploaded' from _ids))$q$);
select _as((select uE from _ids));
select _expect_ok('workflow: accepted marketplace-winner org member inserts a multi-occurrence event', $q$select public.record_trip_workflow_event((select trip1 from _ids),(select orgE from _ids),'client.receipt_sent','{}'::jsonb,null)$q$);
select _as((select uC from _ids));
select _expect_err('workflow: unrelated org cannot claim a singleton on another org''s trip', $q$select public.record_trip_workflow_event((select trip1 from _ids),(select orgC from _ids),'invoice.generated','{}'::jsonb,(select trip1::text||':invoice.generated' from _ids))$q$, 'unauthorized%');
select _as((select uInactive from _ids));
select _expect_err('workflow: inactive member denied', $q$select public.record_trip_workflow_event((select trip1 from _ids),(select orgA from _ids),'supplier.paid','{}'::jsonb,null)$q$, 'unauthorized%');
select _as((select uA from _ids));
select _expect_err('workflow: forged idempotency key rejected', $q$select public.record_trip_workflow_event((select trip1 from _ids),(select orgA from _ids),'pod.uploaded','{}'::jsonb,'wrong')$q$, 'invalid_idempotency_key%');
select _expect_err('workflow: member of A naming org B they do not belong to', $q$select public.record_trip_workflow_event((select trip1 from _ids),(select orgB from _ids),'supplier.paid','{}'::jsonb,null)$q$, 'unauthorized%');
select _expect_ok('workflow: multi-occurrence event (null key) inserts twice', $q$select public.record_trip_workflow_event((select trip1 from _ids),(select orgA from _ids),'supplier.paid','{}'::jsonb,null), public.record_trip_workflow_event((select trip1 from _ids),(select orgA from _ids),'supplier.paid','{}'::jsonb,null)$q$);
reset role;
select _assert('workflow: exactly 1 pod.uploaded row and 2 supplier.paid rows', $q$select (select count(*) from trip_workflow_events where event_type='pod.uploaded')=1 and (select count(*) from trip_workflow_events where event_type='supplier.paid')=2$q$);

-- ===== anon and grants =====
set role anon;
select _expect_err('anon cannot call timeline fn', 'select public.record_trip_operational_timeline_event((select trip1 from _ids), ''fuel_logged'')', 'permission denied%');
select _expect_err('anon cannot call workflow fn', $q$select public.record_trip_workflow_event((select trip1 from _ids),(select orgA from _ids),'pod.uploaded')$q$, 'permission denied%');
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, coalesce(detail,'') as detail from _results order by n;
select case when count(*) filter (where not ok) = 0 then 'ALL ' || count(*) || ' CHECKS PASSED' else count(*) filter (where not ok) || ' FAILED' end as summary from _results;
