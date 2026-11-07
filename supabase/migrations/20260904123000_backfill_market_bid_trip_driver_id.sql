-- Market award trips must always stamp trips.driver_id so:
--   1) drivers can SELECT the trip (RLS: Drivers can read own trips)
--   2) is_driver_available() marks them unavailable
--   3) Driver Home shows JobRequestCard instead of the empty Available surface
--
-- One historical DCO award (Chennai → Marthandam, ₹28k) landed with a
-- market_award drivers row but NULL trips.driver_id. Backfill any such
-- orphans, then harden _resolve_or_create_market_driver so it never
-- returns NULL again.
--
-- Fresh replay reaches this file before trips.source_market_bid_id and
-- drivers.relationship_origin exist. The statements below are unchanged
-- and run only when both columns are already present. 20270304030500
-- applies them after those columns and the March resolver exist.

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'trips'
      AND column_name = 'source_market_bid_id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'drivers'
      AND column_name = 'relationship_origin'
  ) THEN
    RAISE NOTICE 'market bid driver backfill deferred: source_market_bid_id or relationship_origin is absent';
    RETURN;
  END IF;

  -- 1. Backfill: attach the bidder's market_award (or any active) drivers row
  EXECUTE $historical_update$
UPDATE public.trips t
SET driver_id = sub.driver_row_id,
    updated_at = now()
FROM (
  SELECT DISTINCT ON (t2.id)
    t2.id AS trip_id,
    d.id AS driver_row_id
  FROM public.trips t2
  JOIN public.market_bids mb ON mb.id = t2.source_market_bid_id
  JOIN public.drivers d
    ON d.user_id = mb.bidder_user_id
   AND d.organization_id = t2.organization_id
   AND d.left_at IS NULL
  WHERE t2.source = 'market_bid'
    AND t2.driver_id IS NULL
    AND mb.bidder_type = 'dco'
  ORDER BY t2.id,
    CASE WHEN d.relationship_origin = 'market_award' THEN 0 ELSE 1 END,
    d.created_at ASC
) sub
WHERE t.id = sub.trip_id
  AND t.driver_id IS NULL;
  $historical_update$;

  -- 2. Harden resolver: never return NULL (would create an unreadable trip)
  EXECUTE $historical_function$
CREATE OR REPLACE FUNCTION public._resolve_or_create_market_driver(
  p_organization_id uuid,
  p_bidder_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_driver_phone     text;
  v_driver_name      text;
  v_last10           text;
  v_driver_id        uuid;
  v_matched_user_id  uuid;
BEGIN
  SELECT
    nullif(trim(coalesce(p.full_name, '')), ''),
    nullif(trim(coalesce(p.phone, '')), '')
  INTO v_driver_name, v_driver_phone
  FROM public.profiles p
  WHERE p.id = p_bidder_user_id;
  v_driver_name := coalesce(v_driver_name, 'Driver');
  v_last10 := right(regexp_replace(coalesce(v_driver_phone, ''), '\D', '', 'g'), 10);

  SELECT d.id, d.user_id INTO v_driver_id, v_matched_user_id
  FROM public.drivers d
  WHERE d.organization_id = p_organization_id
    AND (
      d.user_id = p_bidder_user_id
      OR (length(v_last10) = 10 AND d.phone_normalised = v_last10)
    )
  ORDER BY CASE WHEN d.user_id = p_bidder_user_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_driver_id IS NOT NULL AND v_matched_user_id IS NOT NULL AND v_matched_user_id <> p_bidder_user_id THEN
    v_driver_id := NULL;
  END IF;

  IF v_driver_id IS NULL THEN
    BEGIN
      INSERT INTO public.drivers (
        organization_id, name, phone, user_id, status, tracking_only,
        relationship_origin, relationship_status
      )
      VALUES (
        p_organization_id, v_driver_name, v_driver_phone, p_bidder_user_id,
        'offline', true, 'market_award', 'independent'
      )
      RETURNING id INTO v_driver_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT d.id INTO v_driver_id
      FROM public.drivers d
      WHERE d.organization_id = p_organization_id
        AND d.user_id = p_bidder_user_id
        AND d.left_at IS NULL
      LIMIT 1;

      IF v_driver_id IS NULL THEN
        INSERT INTO public.drivers (
          organization_id, name, phone, user_id, status, tracking_only,
          relationship_origin, relationship_status
        )
        VALUES (
          p_organization_id, v_driver_name, NULL, p_bidder_user_id,
          'offline', true, 'market_award', 'independent'
        )
        RETURNING id INTO v_driver_id;
      END IF;
    END;
  ELSIF v_matched_user_id IS NULL THEN
    UPDATE public.drivers SET user_id = p_bidder_user_id, updated_at = now()
    WHERE id = v_driver_id;
  END IF;

  UPDATE public.drivers
  SET relationship_status = 'independent', left_at = NULL, updated_at = now()
  WHERE id = v_driver_id
    AND relationship_status = 'disconnected';

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'market_driver_resolve_failed: could not resolve driver for org % user %',
      p_organization_id, p_bidder_user_id;
  END IF;

  RETURN v_driver_id;
END;
$function$;
  $historical_function$;

  EXECUTE $historical_comment$
COMMENT ON FUNCTION public._resolve_or_create_market_driver(uuid, uuid) IS
  'Shared Market/Reach award identity resolver. Always returns a drivers.id or raises — never NULL (NULL would create an awarded trip the DCO cannot read under Drivers-can-read-own-trips RLS).';
  $historical_comment$;
END
$guard$;
