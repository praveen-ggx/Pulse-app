SET LOCAL lock_timeout = '5s';

-- DCO tags an offline trip to a Self shipper / middleman.
-- Drivers cannot UPDATE trips.client_id directly
-- (trips_guard_driver_direct_write → driver_direct_trip_write_denied).
-- This SECURITY DEFINER write is the allowed path.

CREATE OR REPLACE FUNCTION public.tag_dco_trip_party(
  p_trip_id uuid,
  p_client_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_trip public.trips%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_name text;
BEGIN
  IF v_uid IS NULL OR p_trip_id IS NULL OR p_client_id IS NULL THEN
    RAISE EXCEPTION 'dco_tag_denied' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_dco_eligible(v_uid) THEN
    RAISE EXCEPTION 'dco_tag_denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_trip
  FROM public.trips t
  WHERE t.id = p_trip_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'trip_not_found' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.drivers d
    WHERE d.id = v_trip.driver_id
      AND d.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'dco_tag_denied' USING ERRCODE = '42501';
  END IF;

  IF lower(trim(coalesce(v_trip.source, ''))) = 'market_bid' THEN
    RAISE EXCEPTION 'dco_tag_marketplace_denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_client
  FROM public.clients c
  WHERE c.id = p_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'client_not_found' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = v_client.organization_id
        AND o.owner_id = v_uid
    )
    OR public.is_org_staff(v_client.organization_id)
  ) THEN
    RAISE EXCEPTION 'dco_tag_client_denied' USING ERRCODE = '42501';
  END IF;

  v_name := coalesce(
    nullif(trim(v_client.name), ''),
    nullif(trim(v_client.contact_person), ''),
    'Party'
  );

  UPDATE public.trips
  SET
    client_id = v_client.id,
    client_name = v_name,
    updated_at = now()
  WHERE id = p_trip_id;

  RETURN jsonb_build_object(
    'ok', true,
    'client_id', v_client.id,
    'client_name', v_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tag_dco_trip_party(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tag_dco_trip_party(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.tag_dco_trip_party(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tag_dco_trip_party(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.tag_dco_trip_party(uuid, uuid) IS
  'Approved DCO: tag an assigned non-marketplace trip to a Self client. Bypasses driver_direct_trip_write_denied.';
