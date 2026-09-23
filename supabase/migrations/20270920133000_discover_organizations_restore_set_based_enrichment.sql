-- Local candidate only — do not db push until approved.
-- discover_organizations (20261215) reintroduced per-candidate correlated
-- subqueries for mutual_count, ratings, and trip_count after 20261030 had
-- already made those set-based. Restore set-based aggregation and keep the
-- later columns (operating_model, verification_status), auth guards, and
-- ORDER BY. trip_count stays the viewer-client-link count only: coalesce of
-- count(*) short-circuits, so the supplier and candidate-org branches never
-- ran.

CREATE OR REPLACE FUNCTION public.discover_organizations(
  p_org_id   uuid,
  p_search   text DEFAULT '',
  p_limit    int  DEFAULT 20,
  p_offset   int  DEFAULT 0
)
RETURNS TABLE (
  id                    uuid,
  name                  text,
  avatar_seed           text,
  connection_status     text,
  address_line          text,
  city                  text,
  state                 text,
  profile_role          text,
  operating_model       text,
  mutual_count          int,
  average_rating        numeric(3, 2),
  trip_count            int,
  lane_overlap_count    int,
  recommendation_score  int,
  is_in_user_trip_city  boolean,
  verification_status   text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Access denied for organization %', p_org_id;
  END IF;

  RETURN QUERY
  WITH
  user_peers AS (
    SELECT
      CASE
        WHEN cr.from_organization_id = p_org_id THEN cr.to_organization_id
        ELSE cr.from_organization_id
      END AS peer_org_id
    FROM public.connection_requests cr
    WHERE cr.status = 'approved'
      AND (cr.from_organization_id = p_org_id OR cr.to_organization_id = p_org_id)
  ),
  user_cities AS (
    SELECT DISTINCT public.discover_extract_city(loc) AS city
    FROM (
      SELECT i.pickup_area AS loc
      FROM public.indents i
      WHERE i.organization_id = p_org_id
        AND i.deleted_at IS NULL
      UNION ALL
      SELECT i.drop_location
      FROM public.indents i
      WHERE i.organization_id = p_org_id
        AND i.deleted_at IS NULL
    ) indent_locs
    WHERE public.discover_extract_city(loc) IS NOT NULL
  ),
  post_lane_cities AS (
    SELECT
      p.organization_id AS org_id,
      public.discover_extract_city(p.origin) AS city
    FROM public.posts p
    WHERE p.is_active = true
      AND p.type = 'LOAD'
      AND p.origin IS NOT NULL
    UNION
    SELECT
      p.organization_id,
      public.discover_extract_city(p.destination)
    FROM public.posts p
    WHERE p.is_active = true
      AND p.type = 'LOAD'
      AND p.destination IS NOT NULL
  ),
  candidate_post_cities AS (
    SELECT plc.org_id, array_agg(DISTINCT plc.city) AS cities
    FROM post_lane_cities plc
    WHERE plc.city IS NOT NULL
    GROUP BY plc.org_id
  ),
  base_candidates AS (
    SELECT
      o.id,
      o.name,
      NULLIF(trim(o.address_line), '') AS address_line,
      NULLIF(trim(o.city), '') AS city,
      NULLIF(trim(o.state), '') AS state,
      lower(coalesce(p.role, 'user')) AS profile_role,
      NULLIF(trim(o.operating_model), '') AS operating_model,
      COALESCE(cr.status, 'none') AS connection_status,
      o.verification_status::text AS verification_status
    FROM public.organizations o
    LEFT JOIN public.profiles p ON p.id = o.owner_id
    LEFT JOIN public.connection_requests cr ON (
      (cr.from_organization_id = p_org_id AND cr.to_organization_id = o.id)
      OR (cr.to_organization_id = p_org_id AND cr.from_organization_id = o.id)
    )
    WHERE o.id <> p_org_id
      AND o.deleted_at IS NULL
      AND coalesce(lower(p.role), 'user') <> 'driver'
      AND COALESCE(cr.status, 'none') <> 'approved'
      AND (
        coalesce(trim(p_search), '') = ''
        OR o.name ILIKE '%' || trim(p_search) || '%'
      )
  ),
  peer_connections AS (
    SELECT
      CASE
        WHEN cr.from_organization_id IN (SELECT peer_org_id FROM user_peers)
          THEN cr.to_organization_id
        ELSE cr.from_organization_id
      END AS candidate_id,
      CASE
        WHEN cr.from_organization_id IN (SELECT peer_org_id FROM user_peers)
          THEN cr.from_organization_id
        ELSE cr.to_organization_id
      END AS the_peer_id
    FROM public.connection_requests cr
    WHERE cr.status = 'approved'
      AND (
        cr.from_organization_id IN (SELECT peer_org_id FROM user_peers)
        OR cr.to_organization_id IN (SELECT peer_org_id FROM user_peers)
      )
  ),
  mutual_counts AS (
    SELECT
      bc.id AS org_id,
      count(DISTINCT pc.the_peer_id)::int AS mutual_count
    FROM base_candidates bc
    LEFT JOIN peer_connections pc ON pc.candidate_id = bc.id
    GROUP BY bc.id
  ),
  trip_counts AS (
    SELECT c.linked_organization_id AS org_id, count(*)::int AS trip_count
    FROM public.clients c
    JOIN public.trips t
      ON t.client_id = c.id
     AND t.organization_id = p_org_id
     AND t.deleted_at IS NULL
    WHERE c.organization_id = p_org_id
      AND c.deleted_at IS NULL
      AND c.linked_organization_id IN (SELECT bc.id FROM base_candidates bc)
    GROUP BY c.linked_organization_id
  ),
  avg_ratings AS (
    SELECT all_ratings.org_id,
      round(avg(all_ratings.score)::numeric, 2)::numeric(3, 2) AS average_rating
    FROM (
      SELECT bc.id AS org_id, r.score
      FROM base_candidates bc
      JOIN public.ratings r
        ON r.rated_id = bc.id
       AND r.organization_id = p_org_id

      UNION ALL

      SELECT c.linked_organization_id AS org_id, r.score
      FROM public.clients c
      JOIN public.ratings r
        ON r.rated_id = c.id
       AND r.organization_id = p_org_id
      WHERE c.organization_id = p_org_id
        AND c.deleted_at IS NULL
        AND c.linked_organization_id IN (SELECT bc.id FROM base_candidates bc)

      UNION ALL

      SELECT s.linked_organization_id AS org_id, r.score
      FROM public.suppliers s
      JOIN public.ratings r
        ON r.rated_id = s.id
       AND r.organization_id = p_org_id
      WHERE s.organization_id = p_org_id
        AND s.deleted_at IS NULL
        AND s.linked_organization_id IN (SELECT bc.id FROM base_candidates bc)
    ) all_ratings
    GROUP BY all_ratings.org_id
  ),
  enriched AS (
    SELECT
      bc.*,
      coalesce(mc.mutual_count, 0) AS mutual_count,
      ar.average_rating,
      coalesce(tc.trip_count, 0) AS trip_count,
      (
        SELECT count(*)::int
        FROM unnest(coalesce(cpc.cities, ARRAY[]::text[])) AS cc(city)
        WHERE cc.city IN (SELECT uc.city FROM user_cities uc)
      ) AS lane_overlap_count,
      (
        public.discover_extract_city(bc.city) IN (SELECT uc.city FROM user_cities uc)
      ) AS org_city_in_user_lanes
    FROM base_candidates bc
    LEFT JOIN mutual_counts mc ON mc.org_id = bc.id
    LEFT JOIN trip_counts tc ON tc.org_id = bc.id
    LEFT JOIN avg_ratings ar ON ar.org_id = bc.id
    LEFT JOIN candidate_post_cities cpc ON cpc.org_id = bc.id
  ),
  scored AS (
    SELECT
      e.*,
      CASE
        WHEN e.mutual_count > 0 OR e.lane_overlap_count > 0 OR e.org_city_in_user_lanes THEN
          (CASE WHEN e.mutual_count > 0 THEN 2 ELSE 0 END)
          + (CASE WHEN e.lane_overlap_count >= 1 OR e.org_city_in_user_lanes THEN 2 ELSE 0 END)
          + (CASE WHEN e.lane_overlap_count >= 2 THEN 1 ELSE 0 END)
        ELSE -1
      END AS recommendation_score,
      (e.lane_overlap_count >= 1 OR e.org_city_in_user_lanes) AS is_in_user_trip_city
    FROM enriched e
  )
  SELECT
    s.id,
    s.name,
    NULL::text AS avatar_seed,
    s.connection_status,
    s.address_line,
    s.city,
    s.state,
    s.profile_role,
    s.operating_model,
    s.mutual_count,
    s.average_rating,
    s.trip_count,
    s.lane_overlap_count,
    s.recommendation_score,
    s.is_in_user_trip_city,
    s.verification_status
  FROM scored s
  ORDER BY
    s.recommendation_score DESC,
    CASE
      WHEN s.recommendation_score >= 4 THEN 0
      ELSE abs(hashtext(s.id::text || statement_timestamp()::text))
    END DESC,
    s.mutual_count DESC,
    s.is_in_user_trip_city DESC,
    s.trip_count DESC,
    s.average_rating DESC NULLS LAST,
    s.name ASC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 20), 100))
  OFFSET GREATEST(0, coalesce(p_offset, 0));
END;
$$;

COMMENT ON FUNCTION public.discover_organizations(uuid, text, integer, integer) IS
  'Discover orgs outside network with recommendation scoring and KYC verification_status. Set-based mutual/rating/trip enrichment.';

REVOKE ALL ON FUNCTION public.discover_organizations(uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discover_organizations(uuid, text, integer, integer) TO authenticated, service_role;
