-- Lane list already groups open marketplace loads. Add the supplier-target
-- range for that group so the card can show it without reading each load.

SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS public.list_marketplace_search_lanes(uuid);

CREATE FUNCTION public.list_marketplace_search_lanes(
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

COMMENT ON FUNCTION public.list_marketplace_search_lanes(uuid) IS
  'Open Marketplace lanes with load counts and the supplier-target range. For Find Loads.';

REVOKE ALL ON FUNCTION public.list_marketplace_search_lanes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_marketplace_search_lanes(uuid) TO authenticated;
