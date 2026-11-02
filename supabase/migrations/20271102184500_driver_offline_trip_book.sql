SET LOCAL lock_timeout = '5s';

-- Drivers tag offline parties and record their own collections.
-- Direct trips updates are limited to notes, and a zero-row RLS update
-- looks successful to the client. These writes run as the function owner,
-- only for the trip's assigned driver.

CREATE OR REPLACE FUNCTION public.driver_save_offline_trip_notes(
  p_trip_id uuid,
  p_notes text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_notes text;
BEGIN
  IF v_uid IS NULL OR p_trip_id IS NULL THEN
    RAISE EXCEPTION 'driver_notes_denied' USING ERRCODE = '42501';
  END IF;

  IF coalesce(length(p_notes), 0) > 12000 THEN
    RAISE EXCEPTION 'driver_notes_too_long' USING ERRCODE = '22001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.drivers d ON d.id = t.driver_id
    WHERE t.id = p_trip_id
      AND d.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'driver_notes_denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.trips
  SET notes = p_notes, updated_at = now()
  WHERE id = p_trip_id
  RETURNING notes INTO v_notes;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'trip_not_found' USING ERRCODE = '42501';
  END IF;

  RETURN v_notes;
END;
$$;

REVOKE ALL ON FUNCTION public.driver_save_offline_trip_notes(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.driver_save_offline_trip_notes(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.driver_save_offline_trip_notes(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_save_offline_trip_notes(uuid, text) TO service_role;

COMMENT ON FUNCTION public.driver_save_offline_trip_notes(uuid, text) IS
  'Assigned driver saves trip notes (offline party tag or fleet mark). Bypasses driver_direct_trip_write_denied.';

CREATE OR REPLACE FUNCTION public.driver_record_trip_settlement(
  p_trip_id uuid,
  p_amount numeric,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_trip public.trips%ROWTYPE;
  v_id uuid;
  v_balance numeric := 0;
  v_amount numeric := round(coalesce(p_amount, 0), 2);
BEGIN
  IF v_uid IS NULL OR p_trip_id IS NULL OR v_amount <= 0 OR v_amount > 100000000 THEN
    RAISE EXCEPTION 'driver_settlement_denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_trip
  FROM public.trips t
  WHERE t.id = p_trip_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'trip_not_found' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.drivers d
    WHERE d.id = v_trip.driver_id
      AND d.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'driver_settlement_denied' USING ERRCODE = '42501';
  END IF;

  IF lower(trim(coalesce(v_trip.source, ''))) = 'market_bid' THEN
    RAISE EXCEPTION 'driver_settlement_marketplace_denied' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(balance_after, 0) INTO v_balance
  FROM public.driver_ledger
  WHERE driver_id = v_trip.driver_id
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO public.driver_ledger (
    organization_id,
    driver_id,
    trip_id,
    type,
    amount,
    balance_after,
    description,
    created_by
  )
  VALUES (
    v_trip.organization_id,
    v_trip.driver_id,
    v_trip.id,
    'settlement',
    v_amount,
    v_balance + v_amount,
    nullif(trim(coalesce(p_description, '')), ''),
    v_uid
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.driver_record_trip_settlement(uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.driver_record_trip_settlement(uuid, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.driver_record_trip_settlement(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_record_trip_settlement(uuid, numeric, text) TO service_role;

COMMENT ON FUNCTION public.driver_record_trip_settlement(uuid, numeric, text) IS
  'Assigned driver records a settlement on their own trip. Marketplace trips are refused.';
