SET LOCAL lock_timeout = '5s';

-- Forward-only fix for issue_dco_self_receivable (20271102003100).
--
-- Before: a trip-linked issue only checked that the trip existed and was not a
-- marketplace trip, so any eligible DCO could put a Self receivable on any
-- organisation's trip, fleet trips included, and more than once per trip.
--
-- After:
--   * trip must not be deleted; not-found and not-allowed give the same error
--     (dco_self_trip_denied) so the RPC cannot be used to probe trip ids
--   * a trip in the caller's own Self workspace is allowed
--   * any other trip must be operating_mode = 'DCO' AND assigned to a driver row
--     whose user_id is the caller (a FLEET trip stays on the employer ledger)
--   * marketplace trips stay rejected
--   * at most one non-void receivable per operational trip
--     (dco_self_receivables_active_trip_uidx); a second issue with another key
--     raises dco_self_trip_already_issued, also under concurrency
--   * unique-violation handling is constraint-specific; anything unexpected is
--     re-raised, never reported as success
--
-- Signature, parameter names, grants and the response shape are unchanged.
-- Existing rows are never voided, rewritten or deleted by this migration.

DO $$
DECLARE
  v_dupes integer;
BEGIN
  SELECT count(*) INTO v_dupes
  FROM (
    SELECT operational_trip_id
    FROM public.dco_self_receivables
    WHERE operational_trip_id IS NOT NULL
      AND status <> 'void'
    GROUP BY operational_trip_id
    HAVING count(*) > 1
  ) d;
  IF v_dupes > 0 THEN
    RAISE EXCEPTION 'dco_self_active_trip_duplicates: % trip(s) already have more than one non-void receivable; reconcile before applying', v_dupes;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS dco_self_receivables_active_trip_uidx
  ON public.dco_self_receivables (operational_trip_id)
  WHERE operational_trip_id IS NOT NULL AND status <> 'void';

CREATE OR REPLACE FUNCTION public.issue_dco_self_receivable(
  p_party_b_id uuid,
  p_billed numeric,
  p_idempotency_key text,
  p_trip_id uuid DEFAULT NULL,
  p_party_a_label text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ws uuid;
  v_party public.dco_self_parties%ROWTYPE;
  v_trip public.trips%ROWTYPE;
  v_billed numeric;
  v_key text;
  v_id uuid;
  v_existing public.dco_self_receivables%ROWTYPE;
  v_constraint text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'dco_self_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_dco_eligible(v_uid) THEN
    RAISE EXCEPTION 'dco_self_denied' USING ERRCODE = '42501';
  END IF;
  v_ws := public.dco_self_workspace_id(v_uid);
  IF v_ws IS NULL THEN
    RAISE EXCEPTION 'dco_self_workspace_missing' USING ERRCODE = '42501';
  END IF;
  v_key := nullif(trim(p_idempotency_key), '');
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'dco_self_idempotency_required' USING ERRCODE = '22023';
  END IF;
  v_billed := round(coalesce(p_billed, 0));
  IF v_billed <= 0 THEN
    RAISE EXCEPTION 'dco_self_billed_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.dco_self_receivables
  WHERE idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.workspace_id IS DISTINCT FROM v_ws THEN
      RAISE EXCEPTION 'dco_self_denied' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'id', v_existing.id,
      'replayed', true,
      'status', v_existing.status,
      'billed_amount', v_existing.billed_amount,
      'billed_version', v_existing.billed_version
    );
  END IF;

  SELECT * INTO v_party
  FROM public.dco_self_parties
  WHERE id = p_party_b_id;
  IF NOT FOUND OR v_party.workspace_id IS DISTINCT FROM v_ws THEN
    RAISE EXCEPTION 'dco_self_party_denied' USING ERRCODE = '42501';
  END IF;

  IF p_trip_id IS NOT NULL THEN
    SELECT * INTO v_trip
    FROM public.trips
    WHERE id = p_trip_id
      AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'dco_self_trip_denied' USING ERRCODE = '42501';
    END IF;
    IF lower(trim(coalesce(v_trip.source, ''))) = 'market_bid' THEN
      RAISE EXCEPTION 'dco_self_marketplace_denied' USING ERRCODE = '42501';
    END IF;
    IF v_trip.organization_id IS DISTINCT FROM v_ws THEN
      -- Outside the caller's own Self workspace only a DCO operating trip
      -- that the caller is driving qualifies.
      IF v_trip.operating_mode IS DISTINCT FROM 'DCO' THEN
        RAISE EXCEPTION 'dco_self_fleet_trip_denied' USING ERRCODE = '42501';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.drivers d
        WHERE d.id = v_trip.driver_id
          AND d.user_id = v_uid
      ) THEN
        RAISE EXCEPTION 'dco_self_trip_denied' USING ERRCODE = '42501';
      END IF;
    END IF;
    -- Friendly early answer; the partial unique index is the real guard.
    IF EXISTS (
      SELECT 1
      FROM public.dco_self_receivables r
      WHERE r.operational_trip_id = p_trip_id
        AND r.status <> 'void'
    ) THEN
      RAISE EXCEPTION 'dco_self_trip_already_issued' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.dco_self_receivables (
    workspace_id, dco_user_id, party_b_id, billed_amount, billed_version,
    status, operational_trip_id, party_a_label, idempotency_key, issued_at
  ) VALUES (
    v_ws, v_uid, v_party.id, v_billed, 1,
    'issued', p_trip_id, nullif(trim(p_party_a_label), ''), v_key, now()
  )
  RETURNING id INTO v_id;

  INSERT INTO public.dco_self_receivable_versions (
    receivable_id, version, billed_amount, party_b_id, reason, idempotency_key, created_by
  ) VALUES (
    v_id, 1, v_billed, v_party.id, 'issued', v_key || ':v1', v_uid
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'replayed', false,
    'status', 'issued',
    'billed_amount', v_billed,
    'billed_version', 1
  );
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'dco_self_receivables_idempotency_key' THEN
      -- A concurrent call with the same key won: replay it for the same workspace only.
      SELECT * INTO v_existing
      FROM public.dco_self_receivables
      WHERE idempotency_key = v_key;
      IF FOUND AND v_existing.workspace_id IS NOT DISTINCT FROM v_ws THEN
        RETURN jsonb_build_object(
          'ok', true,
          'id', v_existing.id,
          'replayed', true,
          'status', v_existing.status,
          'billed_amount', v_existing.billed_amount,
          'billed_version', v_existing.billed_version
        );
      END IF;
      IF FOUND THEN
        RAISE EXCEPTION 'dco_self_denied' USING ERRCODE = '42501';
      END IF;
    ELSIF v_constraint = 'dco_self_receivables_active_trip_uidx' THEN
      -- A concurrent issue with a different key won the trip.
      RAISE EXCEPTION 'dco_self_trip_already_issued' USING ERRCODE = 'P0001';
    END IF;
    -- Any other unique violation is unexpected: never report it as success.
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_dco_self_receivable(uuid, numeric, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_dco_self_receivable(uuid, numeric, text, uuid, text) TO authenticated;
