-- Restore trip / rating / vehicle / indent counts on
-- get_connection_partner_display_batch. A post-migration hotfix nulled those
-- JSON keys (kept branding only), so network profile modals showed 0 trips /
-- 0 assets even when the single partner-display RPC still returned real counts.
-- Keep the 4s statement_timeout and 24-id cap from the live hotfix.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.get_connection_partner_display_batch(
  p_linked_organization_ids uuid[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
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

COMMENT ON FUNCTION public.get_connection_partner_display_batch(uuid[]) IS
  'Batch partner display JSON keyed by org id. Restores trip/rating/vehicle/indent counts (set-based). Caps at 24 ids; 4s statement_timeout.';

REVOKE ALL ON FUNCTION public.get_connection_partner_display_batch(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_connection_partner_display_batch(uuid[]) TO authenticated;
