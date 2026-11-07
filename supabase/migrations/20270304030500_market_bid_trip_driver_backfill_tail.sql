-- Fresh-replay tail for 20260904123000_backfill_market_bid_trip_driver_id.sql.
-- That file no-ops when source_market_bid_id or relationship_origin is
-- missing. Both now exist: relationship_origin from 20270210090000, and
-- source_market_bid_id from 20270304030000. 20270301050000 has installed
-- the nullable resolver and revoked PUBLIC.
--
-- The UPDATE still changes only trips whose driver_id is null. The raising
-- body is installed only when the current function does not already raise
-- market_driver_resolve_failed. CREATE OR REPLACE keeps the existing PUBLIC
-- revoke. This file grants nothing.

SET LOCAL lock_timeout = '5s';

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

DO $tail$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc
    INTO v_src
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public._resolve_or_create_market_driver(uuid,uuid)');

  IF v_src IS NOT NULL AND position('market_driver_resolve_failed' IN v_src) > 0 THEN
    RETURN;
  END IF;

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

  EXECUTE 'REVOKE ALL ON FUNCTION public._resolve_or_create_market_driver(uuid, uuid) FROM PUBLIC';

  EXECUTE $historical_comment$
COMMENT ON FUNCTION public._resolve_or_create_market_driver(uuid, uuid) IS
  'Shared Market/Reach award identity resolver. Always returns a drivers.id or raises — never NULL (NULL would create an awarded trip the DCO cannot read under Drivers-can-read-own-trips RLS).';
  $historical_comment$;
END
$tail$;
