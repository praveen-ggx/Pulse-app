-- Logs (2026-09-29): 29x statement timeout (57014), idle-in-transaction kills,
-- Auth/Storage 5xx while Postgres was busy. Auto-explain showed
-- get_trip_checkpoint_distance_sums at 10–20s for a single trip id.
--
-- Cause: SECURITY INVOKER SQL + RLS "Trip partners read checkpoints" ran the
-- trips/org/client/supplier EXISTS per checkpoint row. Long-haul trips have
-- thousands of GPS rows. Do not raise max_connections.
--
-- Fix: authorize once per requested trip_id, then sum as definer (table owner
-- bypasses RLS). Same access model as the SELECT policy.

CREATE OR REPLACE FUNCTION public.get_trip_checkpoint_distance_sums(p_trip_ids uuid[])
RETURNS TABLE (trip_id uuid, total_distance_m double precision)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '4s'
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH requested AS (
    SELECT DISTINCT x AS id
    FROM unnest(coalesce(p_trip_ids, ARRAY[]::uuid[])) AS x
    WHERE x IS NOT NULL
    LIMIT 80
  ),
  allowed AS (
    SELECT t.id
    FROM public.trips t
    JOIN requested r ON r.id = t.id
    WHERE public.is_org_member(t.organization_id)
       OR (
         t.client_id IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM public.clients c
           JOIN public.organization_members om
             ON om.organization_id = c.linked_organization_id
            AND om.user_id = v_uid
            AND om.status = 'active'
           WHERE c.id = t.client_id
             AND c.linked_organization_id IS NOT NULL
         )
       )
       OR (
         t.supplier_id IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM public.suppliers s
           JOIN public.organization_members om
             ON om.organization_id = s.linked_organization_id
            AND om.user_id = v_uid
            AND om.status = 'active'
           WHERE s.id = t.supplier_id
             AND s.linked_organization_id IS NOT NULL
         )
       )
  )
  SELECT c.trip_id, sum(c.distance_delta_m)::double precision AS total_distance_m
  FROM public.trip_location_checkpoints c
  JOIN allowed a ON a.id = c.trip_id
  WHERE c.distance_delta_m IS NOT NULL
  GROUP BY c.trip_id;
END;
$$;

COMMENT ON FUNCTION public.get_trip_checkpoint_distance_sums(uuid[]) IS
  'Sum distance_delta_m per allowed trip. Authorizes once per trip_id then aggregates without per-row RLS. authenticated only.';

REVOKE ALL ON FUNCTION public.get_trip_checkpoint_distance_sums(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_trip_checkpoint_distance_sums(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_trip_checkpoint_distance_sums(uuid[]) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_trip_location_checkpoints_trip_delta
  ON public.trip_location_checkpoints (trip_id)
  WHERE distance_delta_m IS NOT NULL;

-- Partner display 500s in the same window were pool starvation from the
-- checkpoint RPC, not a missing index. Fail this batch fast if the pool is
-- already degraded so it cannot hold an 8s PostgREST transaction.
CREATE OR REPLACE FUNCTION public.get_connection_partner_display_batch(p_linked_organization_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '4s'
AS $function$
  WITH wanted AS (
    SELECT DISTINCT id
    FROM unnest(p_linked_organization_ids) AS u(id)
    WHERE id IS NOT NULL
    LIMIT 24
  ),
  trip_stats AS (
    SELECT t.organization_id AS org_id, count(*)::int AS trip_count
    FROM public.trips t
    WHERE t.organization_id IN (SELECT id FROM wanted)
      AND t.deleted_at IS NULL
    GROUP BY t.organization_id
  ),
  rating_stats AS (
    SELECT all_ratings.org_id,
      round(avg(all_ratings.score)::numeric, 2)::numeric(3, 2) AS average_rating,
      count(*)::int AS rating_count
    FROM (
      SELECT w.id AS org_id, r.score
      FROM wanted w
      JOIN public.ratings r ON r.rated_id = w.id

      UNION ALL

      SELECT c.linked_organization_id AS org_id, r.score
      FROM public.clients c
      JOIN public.ratings r ON r.rated_id = c.id
      WHERE c.linked_organization_id IN (SELECT id FROM wanted)
        AND c.deleted_at IS NULL

      UNION ALL

      SELECT s.linked_organization_id AS org_id, r.score
      FROM public.suppliers s
      JOIN public.ratings r ON r.rated_id = s.id
      WHERE s.linked_organization_id IN (SELECT id FROM wanted)
        AND s.deleted_at IS NULL
    ) all_ratings
    GROUP BY all_ratings.org_id
  ),
  fleet_stats AS (
    SELECT v.organization_id AS org_id, count(*)::int AS vehicle_count
    FROM public.vehicles v
    WHERE v.organization_id IN (SELECT id FROM wanted)
      AND v.deleted_at IS NULL
    GROUP BY v.organization_id
  ),
  indent_stats AS (
    SELECT i.organization_id AS org_id, count(*)::int AS network_indent_count
    FROM public.indents i
    WHERE i.organization_id IN (SELECT id FROM wanted)
      AND i.deleted_at IS NULL
      AND (i.status = 'broadcast' OR i.shared_at IS NOT NULL)
    GROUP BY i.organization_id
  )
  SELECT coalesce(
    jsonb_object_agg(
      o.id::text,
      jsonb_build_object(
        'organizationName', o.name,
        'contactPerson',    p.full_name,
        'phone',            p.phone,
        'email',            p.email,
        'logoUrl',          NULLIF(TRIM(o.logo_url), ''),
        'ownerAvatarUrl',   NULLIF(TRIM(p.avatar_url), ''),
        'orgAvatarSeed',    NULLIF(TRIM(p.avatar_seed), ''),
        'avatarUrl',        COALESCE(NULLIF(TRIM(o.logo_url), ''), p.avatar_url),
        'avatarSeed',       NULLIF(TRIM(p.avatar_seed), ''),
        'ownerId',          o.owner_id,
        'orgCreatedAt',     o.created_at,
        'ownerSignedUpAt',  p.created_at,
        'tripCount',        coalesce(trip_stats.trip_count, 0),
        'averageRating',    rating_stats.average_rating,
        'ratingCount',      coalesce(rating_stats.rating_count, 0),
        'verificationStatus', o.verification_status::text,
        'vehicleCount',     coalesce(fleet_stats.vehicle_count, 0),
        'networkIndentCount', coalesce(indent_stats.network_indent_count, 0)
      )
    ),
    '{}'::jsonb
  )
  FROM public.organizations o
  JOIN public.profiles p ON p.id = o.owner_id
  JOIN wanted w ON w.id = o.id
  LEFT JOIN trip_stats ON trip_stats.org_id = o.id
  LEFT JOIN rating_stats ON rating_stats.org_id = o.id
  LEFT JOIN fleet_stats ON fleet_stats.org_id = o.id
  LEFT JOIN indent_stats ON indent_stats.org_id = o.id;
$function$;

REVOKE ALL ON FUNCTION public.get_connection_partner_display_batch(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_connection_partner_display_batch(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_connection_partner_display_batch(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
