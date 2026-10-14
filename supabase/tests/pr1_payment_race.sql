\set ON_ERROR_STOP on

-- Two sessions both pass the issuer's early SELECT, then block inside
-- BEFORE INSERT until the other session is also inside that trigger.
-- The loser then takes unique_violation and must return the winner's id.
update public.pr1_request_no_mode set value = '' where mode = 'fixed';

insert into public.trips (id, organization_id) values
  ('14141414-1414-1414-1414-141414141414', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

create or replace function public.pr1_race_barrier()
returns trigger
language plpgsql
as $$
declare
  v_started timestamptz := clock_timestamp();
begin
  if new.trip_id is distinct from '14141414-1414-1414-1414-141414141414'::uuid then
    return new;
  end if;
  if pg_try_advisory_lock(0, 141414) then
    null;
  elsif pg_try_advisory_lock(0, 141415) then
    null;
  else
    raise exception 'race barrier overflow';
  end if;
  loop
    exit when (
      select count(distinct objid)
        from pg_locks
       where locktype = 'advisory'
         and granted
         and classid = 0
         and objid in (141414, 141415)
    ) >= 2;
    if clock_timestamp() > v_started + interval '15 seconds' then
      raise exception 'race partner did not reach the insert';
    end if;
    perform pg_sleep(0.02);
  end loop;
  return new;
end;
$$;

drop trigger if exists pr1_race_barrier on public.payment_requests;
create trigger pr1_race_barrier
  before insert on public.payment_requests
  for each row execute function public.pr1_race_barrier();
