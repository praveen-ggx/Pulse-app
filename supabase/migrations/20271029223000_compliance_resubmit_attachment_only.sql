-- Resubmit attachment-only gate for vehicle / driver files.
-- Matches the app: a storage path that is not rejected / replaced counts as
-- on file. Calendar expiry (and vault expiryDate) must not block Resubmit —
-- Document Upload still shows "On file", and Compliance checks expiry after
-- Ground Ops hands the trip back. Trip LR / E-way / Invoice rules unchanged.

SET LOCAL lock_timeout = '5s';

create or replace function public.compliance_missing_required_files(p_trip_id uuid)
  returns text[]
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_trip     record;
  v_vehicle  uuid;
  v_missing  text[] := array[]::text[];
  v_type     text;
begin
  select id, organization_id, vehicle_id, vehicle_display_number, driver_id
    into v_trip
    from public.trips where id = p_trip_id;
  if not found then
    return array['trip'];
  end if;

  -- Trip documents (mirror of classifyTripDocument + "not rejected").
  foreach v_type in array array['lr', 'eway_bill', 'invoice'] loop
    if not exists (
      select 1
        from public.trip_documents td,
             lateral (select split_part(btrim(coalesce(td.storage_path, '')), '?', 1) as path) p,
             lateral (select regexp_replace(p.path, '^.*/', '') as base) b
       where td.trip_id = p_trip_id
         and td.document_type = v_type
         and coalesce(td.status, 'pending') <> 'rejected'
         and (
           td.source_entity_document_id is not null
           or p.path like 'ref:vehicle-document:%'
           or p.path ~* '^https?://'
           or ((b.base = 'fields.json' or b.base like '%-fields.json')
               and nullif(btrim(td.document_number), '') is not null)
           or (b.base <> 'fields.json' and b.base not like '%-fields.json'
               and p.path <> '' and right(p.path, 1) <> '/'
               and exists (select 1 from storage.objects o
                            where o.bucket_id = 'trip-documents' and o.name = p.path))
         )
    ) then
      v_missing := array_append(v_missing, v_type);
    end if;
  end loop;

  -- Vehicle: the trip's vehicle, or the org vehicle with the same number.
  v_vehicle := v_trip.vehicle_id;
  if v_vehicle is null and nullif(btrim(v_trip.vehicle_display_number), '') is not null then
    select v.id into v_vehicle
      from public.vehicles v
     where v.organization_id = v_trip.organization_id
       and upper(regexp_replace(coalesce(v.vehicle_number, ''), '[^A-Za-z0-9]', '', 'g'))
         = upper(regexp_replace(v_trip.vehicle_display_number, '[^A-Za-z0-9]', '', 'g'))
     limit 1;
  end if;

  -- Attachment-only: storage path present, not rejected / replaced.
  -- Do not require expiry_date / vault expiryDate >= current_date.
  foreach v_type in array array['rc', 'insurance', 'fitness'] loop
    if v_vehicle is null or not (
      exists (
        select 1 from public.entity_documents ed
         where ed.entity_type = 'vehicle'
           and ed.entity_id = v_vehicle
           and ed.doc_type = v_type
           and nullif(btrim(ed.storage_path), '') is not null
           and coalesce(ed.status, 'pending') not in ('rejected', 'replaced')
      )
      or exists (
        select 1 from public.vehicles v
         where v.id = v_vehicle
           and nullif(btrim(v.documents -> v_type ->> 'url'), '') is not null
      )
    ) then
      v_missing := array_append(v_missing, 'vehicle ' || v_type);
    end if;
  end loop;

  -- Driver licence: entity documents or driver KYC (attachment-only).
  if v_trip.driver_id is null or not (
    exists (
      select 1 from public.entity_documents ed
       where ed.entity_type = 'driver'
         and ed.entity_id = v_trip.driver_id
         and ed.doc_type = 'license'
         and nullif(btrim(ed.storage_path), '') is not null
         and coalesce(ed.status, 'pending') not in ('rejected', 'replaced')
    )
    or exists (
      select 1 from public.driver_kyc_documents k
       where k.deleted_at is null
         and k.doc_type = 'license'
         and nullif(btrim(k.storage_path), '') is not null
         and k.driver_user_id in (
           select d.user_id from public.drivers d where d.id = v_trip.driver_id and d.user_id is not null
           union all
           select v_trip.driver_id
         )
    )
  ) then
    v_missing := array_append(v_missing, 'driver licence');
  end if;

  return v_missing;
end;
$$;

comment on function public.compliance_missing_required_files(uuid) is
  'Required trip/vehicle/driver files still missing for Resubmit. Vehicle/driver are attachment-only (path present, not rejected/replaced); expiry is checked by Compliance after Resubmit.';

revoke all on function public.compliance_missing_required_files(uuid) from public;
revoke all on function public.compliance_missing_required_files(uuid) from anon;
revoke all on function public.compliance_missing_required_files(uuid) from authenticated;
