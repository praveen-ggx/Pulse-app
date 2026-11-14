-- Link trips.vehicle_id from a typed plate (TRP002015).
--
-- Problem: several assign paths save only vehicle_display_number (a typed plate)
-- even when that truck is already in the supplier's or trip org's fleet. The trip
-- then has no vehicle_id, so Compliance cannot show or upload truck documents.
-- Also, when a truck is added to a fleet after the trip, old trips never link.
--
-- Fix, for every screen at once:
--   1. private.resolve_trip_vehicle_by_plate: supplier's linked org fleet first,
--      then the trip org's fleet. Exactly one active vehicle with the same
--      normalized plate, otherwise no link (never guess).
--   2. BEFORE trigger on trips: plate saved without vehicle_id -> link it.
--   3. AFTER trigger on vehicles: truck added / renamed / restored -> link the
--      unlinked trips that carry its plate.
--   4. One-time backfill of existing unlinked trips with the same rule.
-- Cancelled and deleted trips, and owner-vehicle trips, are never touched.
-- An explicit unlink (vehicle_id set to null, plate unchanged) is respected.

create or replace function private.normalize_vehicle_plate(p_plate text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function private.resolve_trip_vehicle_by_plate(
  p_plate text,
  p_supplier_id uuid,
  p_org_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_norm text := private.normalize_vehicle_plate(p_plate);
  v_supplier_org uuid;
  v_org uuid;
  v_ids uuid[];
begin
  if length(v_norm) < 4 then
    return null;
  end if;

  if p_supplier_id is not null then
    select s.linked_organization_id into v_supplier_org
    from public.suppliers s
    where s.id = p_supplier_id;
  end if;

  foreach v_org in array array_remove(array[v_supplier_org, p_org_id], null) loop
    select array_agg(v.id) into v_ids
    from public.vehicles v
    where v.organization_id = v_org
      and v.deleted_at is null
      and private.normalize_vehicle_plate(v.vehicle_number) = v_norm;

    if cardinality(v_ids) = 1 then
      return v_ids[1];
    elsif cardinality(v_ids) > 1 then
      return null; -- ambiguous plate in this fleet: do not guess
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function private.normalize_vehicle_plate(text) from public, anon, authenticated;
revoke all on function private.resolve_trip_vehicle_by_plate(text, uuid, uuid) from public, anon, authenticated;

-- 2. Trips: link on save. Name sorts after the a_/b_ guards and before
-- trips_sync_driver_vehicle_display.
create or replace function public.trips_link_vehicle_by_plate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.vehicle_id is not null
     or new.owner_vehicle_id is not null
     or new.deleted_at is not null
     or coalesce(new.status, '') = 'cancelled'
     or btrim(coalesce(new.vehicle_display_number, '')) = '' then
    return new;
  end if;

  -- Respect an explicit unlink that keeps the same plate.
  if tg_op = 'UPDATE'
     and old.vehicle_id is not null
     and new.vehicle_display_number is not distinct from old.vehicle_display_number then
    return new;
  end if;

  new.vehicle_id := private.resolve_trip_vehicle_by_plate(
    new.vehicle_display_number, new.supplier_id, new.organization_id
  );
  return new;
end;
$$;

revoke all on function public.trips_link_vehicle_by_plate() from public, anon, authenticated;

drop trigger if exists trips_link_vehicle_by_plate on public.trips;
create trigger trips_link_vehicle_by_plate
  before insert or update of vehicle_display_number, vehicle_id on public.trips
  for each row execute function public.trips_link_vehicle_by_plate();

-- 3. Vehicles: back-link older trips when a truck is added later.
create or replace function public.vehicles_backlink_trips_by_plate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_norm text := private.normalize_vehicle_plate(new.vehicle_number);
begin
  if new.deleted_at is not null or length(v_norm) < 4 then
    return null;
  end if;

  update public.trips t
     set vehicle_id = new.id
   where t.vehicle_id is null
     and t.owner_vehicle_id is null
     and t.deleted_at is null
     and coalesce(t.status, '') <> 'cancelled'
     and private.normalize_vehicle_plate(t.vehicle_display_number) = v_norm
     and private.resolve_trip_vehicle_by_plate(
           t.vehicle_display_number, t.supplier_id, t.organization_id
         ) = new.id;

  return null;
end;
$$;

revoke all on function public.vehicles_backlink_trips_by_plate() from public, anon, authenticated;

drop trigger if exists vehicles_backlink_trips_by_plate on public.vehicles;
create trigger vehicles_backlink_trips_by_plate
  after insert or update of vehicle_number, deleted_at on public.vehicles
  for each row execute function public.vehicles_backlink_trips_by_plate();

-- 4. One-time backfill (same rule as the triggers).
update public.trips t
   set vehicle_id = r.vehicle_id
  from (
    select x.id,
           private.resolve_trip_vehicle_by_plate(
             x.vehicle_display_number, x.supplier_id, x.organization_id
           ) as vehicle_id
      from public.trips x
     where x.vehicle_id is null
       and x.owner_vehicle_id is null
       and x.deleted_at is null
       and coalesce(x.status, '') <> 'cancelled'
       and btrim(coalesce(x.vehicle_display_number, '')) <> ''
  ) r
 where t.id = r.id
   and r.vehicle_id is not null;
