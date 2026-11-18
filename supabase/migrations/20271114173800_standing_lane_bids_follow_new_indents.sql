-- A pooled Marketplace rate follows the lane (pickup, drop, vehicle).
-- When another shipper shares a matching load to Marketplace, each other
-- carrier's latest pending rate is copied onto that load.
--
-- Lane matching is inlined here. It does not call _pool_key / _pool_key_part:
-- those are revoked from authenticated, and a trigger that calls them rolls
-- back indent creation with "permission denied for function _pool_key".
-- The expression matches _pool_key_part: lower + btrim of the same whitespace.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.standing_lane_key(
  p_pickup text,
  p_drop text,
  p_vehicle_type text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN k.pickup = '' OR k.drop = '' OR k.vehicle = '' THEN NULL
    ELSE k.pickup || '|' || k.drop || '|' || k.vehicle
  END
  FROM (
    SELECT
      pg_catalog.lower(pg_catalog.btrim(
        coalesce(p_pickup, ''),
        E' \t\n\u000B\f\r\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF'
      )) AS pickup,
      pg_catalog.lower(pg_catalog.btrim(
        coalesce(p_drop, ''),
        E' \t\n\u000B\f\r\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF'
      )) AS drop,
      pg_catalog.lower(pg_catalog.btrim(
        coalesce(p_vehicle_type, ''),
        E' \t\n\u000B\f\r\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF'
      )) AS vehicle
  ) k;
$$;

CREATE OR REPLACE FUNCTION public.indent_is_open_marketplace_lane(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT pg_catalog.lower(pg_catalog.btrim(coalesce(p_status, '')))
    <> ALL (ARRAY['awarded', 'completed', 'cancelled', 'closed', 'expired', 'draft']::text[]);
$$;

CREATE OR REPLACE FUNCTION public.indent_is_sponsored_reach_row(p_indent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.reach_campaigns c
    WHERE c.status = 'active'
      AND c.archived_at IS NULL
      AND (c.expires_at IS NULL OR c.expires_at > pg_catalog.now())
      AND (
        c.snapshot_source_indent_id = p_indent_id
        OR EXISTS (
          SELECT 1
          FROM public.posts p
          WHERE p.id = c.post_id
            AND p.source_indent_id = p_indent_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.apply_standing_lane_bids(p_indent_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_key text;
  v_circulation text;
  v_status text;
  v_inserted integer := 0;
BEGIN
  SELECT
    i.organization_id,
    public.standing_lane_key(i.pickup_area, i.drop_location, i.vehicle_type),
    pg_catalog.lower(pg_catalog.btrim(coalesce(i.circulation_target, ''))),
    i.status::text
  INTO v_org, v_key, v_circulation, v_status
  FROM public.indents i
  WHERE i.id = p_indent_id
    AND i.deleted_at IS NULL;

  IF v_org IS NULL
    OR v_key IS NULL
    OR v_circulation NOT IN ('marketplace', 'both')
    OR NOT public.indent_is_open_marketplace_lane(v_status)
    OR public.indent_is_sponsored_reach_row(p_indent_id)
  THEN
    RETURN 0;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_indent_id::text, 0));

  INSERT INTO public.market_bids (
    indent_id,
    bidder_type,
    bidder_user_id,
    bidder_organization_id,
    amount,
    note,
    status
  )
  SELECT
    p_indent_id,
    'organization',
    src.bidder_user_id,
    src.bidder_organization_id,
    src.amount,
    src.note,
    'pending'
  FROM (
    SELECT DISTINCT ON (mb.bidder_organization_id)
      mb.bidder_user_id,
      mb.bidder_organization_id,
      mb.amount,
      mb.note
    FROM public.market_bids mb
    JOIN public.indents i ON i.id = mb.indent_id
    WHERE mb.status = 'pending'
      AND mb.bidder_type = 'organization'
      AND mb.bidder_organization_id IS NOT NULL
      AND mb.bidder_organization_id <> v_org
      AND mb.amount > 0
      AND i.id <> p_indent_id
      AND i.deleted_at IS NULL
      AND pg_catalog.lower(pg_catalog.btrim(coalesce(i.circulation_target, ''))) IN ('marketplace', 'both')
      AND public.standing_lane_key(i.pickup_area, i.drop_location, i.vehicle_type) = v_key
      AND public.indent_is_open_marketplace_lane(i.status::text)
      AND NOT public.indent_is_sponsored_reach_row(i.id)
    ORDER BY mb.bidder_organization_id, mb.updated_at DESC NULLS LAST, mb.created_at DESC
  ) src
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.market_bids existing
    WHERE existing.indent_id = p_indent_id
      AND (
        existing.bidder_user_id = src.bidder_user_id
        OR existing.bidder_organization_id = src.bidder_organization_id
      )
  )
  ON CONFLICT (indent_id, bidder_user_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_apply_standing_lane_bids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF pg_catalog.lower(pg_catalog.btrim(coalesce(NEW.circulation_target, ''))) NOT IN ('marketplace', 'both') THEN
    RETURN NEW;
  END IF;
  IF public.standing_lane_key(NEW.pickup_area, NEW.drop_location, NEW.vehicle_type) IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT public.indent_is_open_marketplace_lane(NEW.status::text) THEN
    RETURN NEW;
  END IF;
  PERFORM public.apply_standing_lane_bids(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS indents_apply_standing_lane_bids ON public.indents;
CREATE TRIGGER indents_apply_standing_lane_bids
  AFTER INSERT OR UPDATE OF circulation_target, pickup_area, drop_location, vehicle_type, status
  ON public.indents
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_apply_standing_lane_bids();

DROP FUNCTION IF EXISTS public.preview_standing_lane_bids(text, text, text);

CREATE OR REPLACE FUNCTION public.preview_standing_lane_bids(
  p_pickup text,
  p_drop text,
  p_vehicle_type text,
  p_indent_id uuid DEFAULT NULL
)
RETURNS TABLE (
  bidder_organization_id uuid,
  bidder_organization_name text,
  amount numeric,
  updated_at timestamptz,
  already_on_indent boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_key text := public.standing_lane_key(p_pickup, p_drop, p_vehicle_type);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.user_id = v_uid
      AND om.status = 'active'
      AND om.role <> 'driver'
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF v_key IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    src.bidder_organization_id,
    coalesce(nullif(pg_catalog.btrim(o.name), ''), 'Carrier') AS bidder_organization_name,
    src.amount,
    src.updated_at,
    EXISTS (
      SELECT 1
      FROM public.market_bids mine
      WHERE p_indent_id IS NOT NULL
        AND mine.indent_id = p_indent_id
        AND mine.bidder_organization_id = src.bidder_organization_id
    ) AS already_on_indent
  FROM (
    SELECT DISTINCT ON (mb.bidder_organization_id)
      mb.bidder_organization_id,
      mb.amount,
      mb.updated_at
    FROM public.market_bids mb
    JOIN public.indents i ON i.id = mb.indent_id
    WHERE mb.status = 'pending'
      AND mb.bidder_type = 'organization'
      AND mb.bidder_organization_id IS NOT NULL
      AND mb.amount > 0
      AND i.deleted_at IS NULL
      AND pg_catalog.lower(pg_catalog.btrim(coalesce(i.circulation_target, ''))) IN ('marketplace', 'both')
      AND public.standing_lane_key(i.pickup_area, i.drop_location, i.vehicle_type) = v_key
      AND public.indent_is_open_marketplace_lane(i.status::text)
      AND NOT public.indent_is_sponsored_reach_row(i.id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_members mine
        WHERE mine.organization_id = mb.bidder_organization_id
          AND mine.user_id = v_uid
          AND mine.status = 'active'
      )
    ORDER BY mb.bidder_organization_id, mb.updated_at DESC NULLS LAST, mb.created_at DESC
  ) src
  LEFT JOIN public.organizations o ON o.id = src.bidder_organization_id
  ORDER BY src.amount ASC, bidder_organization_name ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.standing_lane_key(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.indent_is_open_marketplace_lane(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.indent_is_sponsored_reach_row(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_standing_lane_bids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trg_apply_standing_lane_bids() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_standing_lane_bids(text, text, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.standing_lane_key(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.indent_is_open_marketplace_lane(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_standing_lane_bids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_standing_lane_bids(text, text, text, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.apply_standing_lane_bids(uuid) IS
  'Copies each other organization''s latest pending lane rate onto this Marketplace load. Skips the load owner, sponsored loads, and any carrier that already has a bid. ON CONFLICT DO NOTHING keeps a retry from duplicating or changing an existing bid.';

COMMENT ON FUNCTION public.preview_standing_lane_bids(text, text, text, uuid) IS
  'Lane rates a shipper may see before or during Marketplace sharing. already_on_indent marks rates already stored on p_indent_id. Hides the caller''s own organizations.';
