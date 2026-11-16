-- One grouped read for Find Loads first paint: lane identity, open count,
-- and the supplier-target range. No per-load walk and no indent_stops lookup.
-- The existing list_marketplace_search_lanes stays as it is deployed.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.list_marketplace_lane_bootstrap(
  p_org_id uuid
)
RETURNS TABLE (
  pickup_area text,
  drop_location text,
  vehicle_type text,
  load_count integer,
  target_rate_min numeric,
  target_rate_max numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  RETURN QUERY
  SELECT
    trim(i.pickup_area) AS pickup_area,
    trim(i.drop_location) AS drop_location,
    trim(i.vehicle_type) AS vehicle_type,
    count(*)::integer AS load_count,
    min(NULLIF(i.supplier_target, 0)) AS target_rate_min,
    max(NULLIF(i.supplier_target, 0)) AS target_rate_max
  FROM public.indents i
  WHERE i.deleted_at IS NULL
    AND i.organization_id <> p_org_id
    AND lower(trim(coalesce(i.circulation_target, ''))) IN ('marketplace', 'both')
    AND lower(trim(coalesce(i.status::text, ''))) <> ALL (
      ARRAY[
        'awarded',
        'completed',
        'cancelled',
        'closed',
        'expired',
        'draft'
      ]::text[]
    )
    AND coalesce(trim(i.pickup_area), '') <> ''
    AND coalesce(trim(i.drop_location), '') <> ''
    AND coalesce(trim(i.vehicle_type), '') <> ''
  GROUP BY 1, 2, 3
  ORDER BY load_count DESC, pickup_area ASC, drop_location ASC
  LIMIT 200;
END;
$$;

COMMENT ON FUNCTION public.list_marketplace_lane_bootstrap(uuid) IS
  'Find Loads bootstrap: open Marketplace lanes with load counts and the supplier-target range, in one grouped read.';

REVOKE ALL ON FUNCTION public.list_marketplace_lane_bootstrap(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_marketplace_lane_bootstrap(uuid) TO authenticated;
