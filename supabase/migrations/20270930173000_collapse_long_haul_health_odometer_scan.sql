-- Recorded on production (2026-09-30) outside the repository; added here so the
-- repository matches production. Production's history row stored only the view
-- body, so this file is rebuilt from production's live definition
-- (pg_get_viewdef + reloptions, read 2026-10-16). Production already records
-- this version; it is never pushed there again.
-- Long-haul health: distance from actual_distance_traveled_km, else the
-- odometer spread across driver_locations.

CREATE OR REPLACE VIEW public.v_long_haul_health
WITH (security_invoker = true) AS
 SELECT trip_id,
    trip_number,
    total_distance_km,
    time_elapsed,
    expected_km,
    COALESCE(distance_km, (0)::double precision) AS current_km,
        CASE
            WHEN (anchor IS NULL) THEN 'ON_TRACK'::text
            WHEN (lower(TRIM(BOTH FROM status)) <> ALL (ARRAY['in_transit'::text, 'picked_up'::text, 'in_progress'::text, 'transit'::text, 'at_drop'::text, 'loading'::text, 'unloading'::text, 'at_pickup'::text, 'assigned'::text, 'active'::text])) THEN 'ON_TRACK'::text
            WHEN (elapsed_seconds <= (0)::numeric) THEN 'ON_TRACK'::text
            WHEN (COALESCE(distance_km, (0)::double precision) < (expected_km * (0.7)::double precision)) THEN 'CRITICAL_DELAY'::text
            WHEN (COALESCE(distance_km, (0)::double precision) < (expected_km * (0.9)::double precision)) THEN 'LATE_RISK'::text
            ELSE 'ON_TRACK'::text
        END AS health_status
   FROM ( SELECT t.id AS trip_id,
            t.trip_number,
            t.status,
            COALESCE((t.distance)::double precision, (0)::double precision) AS total_distance_km,
            (now() - COALESCE(t.started_at, (t.pickup_date)::timestamp with time zone, t.created_at)) AS time_elapsed,
            EXTRACT(epoch FROM (now() - COALESCE(t.started_at, (t.pickup_date)::timestamp with time zone, t.created_at))) AS elapsed_seconds,
            GREATEST((((EXTRACT(epoch FROM (now() - COALESCE(t.started_at, (t.pickup_date)::timestamp with time zone, t.created_at))) / 86400.0) * 350.0))::double precision, (0)::double precision) AS expected_km,
            COALESCE(t.started_at, (t.pickup_date)::timestamp with time zone) AS anchor,
            COALESCE((t.actual_distance_traveled_km)::double precision, ( SELECT
                        CASE
                            WHEN (count(*) FILTER (WHERE (dl.odometer_km IS NOT NULL)) >= 2) THEN (max(dl.odometer_km) - min(dl.odometer_km))
                            ELSE NULL::double precision
                        END AS "case"
                   FROM driver_locations dl
                  WHERE (dl.trip_id = t.id))) AS distance_km
           FROM trips t) s
;
