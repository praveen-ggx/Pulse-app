SET LOCAL lock_timeout = '5s';

-- DCO Self party tag + dedicated receivable. Drivers cannot UPDATE
-- trips.client_id directly (trips_guard_driver_direct_write). This
-- SECURITY DEFINER write runs as the function owner, so current_user is
-- not `authenticated` and the guard allows the column change.

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS dco_party_billed numeric;

COMMENT ON COLUMN public.trips.dco_party_billed IS
  'DCO Self tagged receivable (middleman/customer). Independent of supplier_rate / client_price settlement.';

CREATE UNIQUE INDEX IF NOT EXISTS driver_ledger_dco_capture_uidx
  ON public.driver_ledger (organization_id, reference_type, reference_id)
  WHERE reference_type = 'dco_capture'
    AND reference_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tag_dco_trip_party(
  p_trip_id uuid,
  p_client_id uuid,
  p_billed numeric DEFAULT NULL
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
  v_self uuid;
  v_name text;
  v_billed numeric;
  v_notes text;
  v_marker text;
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

  IF upper(trim(coalesce(v_trip.operating_mode, ''))) IS DISTINCT FROM 'DCO' THEN
    RAISE EXCEPTION 'dco_tag_fleet_denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_client
  FROM public.clients c
  WHERE c.id = p_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'client_not_found' USING ERRCODE = '42501';
  END IF;

  v_self := public.dco_self_workspace_id(v_uid);
  IF v_self IS NULL OR v_client.organization_id IS DISTINCT FROM v_self THEN
    RAISE EXCEPTION 'dco_tag_client_denied' USING ERRCODE = '42501';
  END IF;

  v_name := coalesce(
    nullif(trim(v_client.name), ''),
    nullif(trim(v_client.contact_person), ''),
    'Party'
  );

  v_billed := NULL;
  IF p_billed IS NOT NULL AND p_billed > 0 THEN
    v_billed := round(p_billed);
  END IF;

  v_notes := regexp_replace(
    coalesce(v_trip.notes, ''),
    '<!--pulse-dco-party:\{[^<]*\}-->',
    '',
    'g'
  );
  v_notes := trim(both from regexp_replace(v_notes, E'\\n{3,}', E'\\n\\n', 'g'));
  v_marker := '<!--pulse-dco-party:'
    || jsonb_strip_nulls(jsonb_build_object(
      'id', v_client.id,
      'name', v_name,
      'billed', v_billed
    ))::text
    || '-->';
  v_notes := CASE
    WHEN v_notes = '' THEN v_marker
    ELSE v_notes || E'\n' || v_marker
  END;

  UPDATE public.trips
  SET
    client_id = v_client.id,
    client_name = v_name,
    dco_party_billed = v_billed,
    notes = v_notes,
    updated_at = now()
  WHERE id = p_trip_id;

  RETURN jsonb_build_object(
    'ok', true,
    'client_id', v_client.id,
    'client_name', v_name,
    'dco_party_billed', v_billed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tag_dco_trip_party(uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tag_dco_trip_party(uuid, uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.tag_dco_trip_party(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tag_dco_trip_party(uuid, uuid, numeric) TO service_role;

-- Drop the 2-arg form if a previous apply created it.
DROP FUNCTION IF EXISTS public.tag_dco_trip_party(uuid, uuid);

COMMENT ON FUNCTION public.tag_dco_trip_party(uuid, uuid, numeric) IS
  'Approved DCO: tag an operating_mode=DCO non-marketplace trip to a Self-workspace client. Writes dco_party_billed, never supplier_rate.';
