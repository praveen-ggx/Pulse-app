SET LOCAL lock_timeout = '5s';

-- Forward-only: stop writing DCO financial amounts into trips.notes / dco_party_billed
-- at tagging time. Tagging remains Party B association only; billed amount lives on
-- dco_self_receivables after explicit issue/correct. Does not rewrite historical notes.

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
  v_notes text;
BEGIN
  -- p_billed retained for signature compatibility; ignored (tag ≠ issue).
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

  -- Strip legacy financial/party markers from notes; do not rewrite other note text.
  v_notes := regexp_replace(
    coalesce(v_trip.notes, ''),
    '<!--pulse-dco-party:\{[^<]*\}-->',
    '',
    'g'
  );
  v_notes := nullif(trim(both from regexp_replace(v_notes, E'\\n{3,}', E'\\n\\n', 'g')), '');

  UPDATE public.trips
  SET
    client_id = v_client.id,
    client_name = v_name,
    -- Tagging must not establish or mirror a billed amount.
    dco_party_billed = NULL,
    notes = v_notes,
    updated_at = now()
  WHERE id = p_trip_id;

  RETURN jsonb_build_object(
    'ok', true,
    'client_id', v_client.id,
    'client_name', v_name,
    'dco_party_billed', NULL,
    'billed_ignored', p_billed IS NOT NULL
  );
END;
$$;

COMMENT ON FUNCTION public.tag_dco_trip_party(uuid, uuid, numeric) IS
  'Approved DCO: tag an operating_mode=DCO non-marketplace trip to a Self-workspace client. Party association only — no notes financial marker, no dco_party_billed write. Issue via issue_dco_self_receivable.';

COMMENT ON COLUMN public.trips.dco_party_billed IS
  'Deprecated mirror. Authoritative DCO Self billed amount is dco_self_receivables.billed_amount. Tagging clears this column.';

REVOKE ALL ON FUNCTION public.tag_dco_trip_party(uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tag_dco_trip_party(uuid, uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.tag_dco_trip_party(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tag_dco_trip_party(uuid, uuid, numeric) TO service_role;

-- Security: remove the legacy 2-arg overload if it still exists (no trip-ownership check).
DROP FUNCTION IF EXISTS public.tag_dco_trip_party(uuid, uuid);
