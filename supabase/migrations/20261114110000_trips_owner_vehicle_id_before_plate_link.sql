-- Prerequisite for 20261114111733 on a clean replay.
--
-- The plate-link backfill and vehicle trigger read trips.owner_vehicle_id.
-- That column is added in 20270211100000, which sorts later. The later file
-- uses ADD COLUMN IF NOT EXISTS and still owns the index, comment, and
-- set_trip_owner_vehicle. This file adds only the nullable foreign key.
-- owner_vehicles already exists from 20260903040000.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS owner_vehicle_id uuid
    REFERENCES public.owner_vehicles(id) ON DELETE SET NULL;
