SET LOCAL lock_timeout = '5s';

-- Independent DRIVER financial book.
-- Separate from DCO Self (party_b_id / workspace) and from employer driver_ledger.
-- Ownership is auth.uid() directly. No DCO workspace. No organisation clients.

CREATE OR REPLACE FUNCTION public.is_independent_driver_eligible(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = p_user_id
        AND lower(coalesce(p.role, '')) = 'driver'
    )
    AND NOT coalesce(public.is_dco_eligible(p_user_id), false)
    AND NOT EXISTS (
      SELECT 1
      FROM public.drivers d
      WHERE d.user_id = p_user_id
        AND d.left_at IS NULL
        AND lower(coalesce(d.relationship_status, '')) = 'active_employee'
        AND coalesce(d.tracking_only, false) IS NOT TRUE
    );
$$;

REVOKE ALL ON FUNCTION public.is_independent_driver_eligible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_independent_driver_eligible(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_independent_driver_eligible(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.driver_indie_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_indie_parties_owner_idx
  ON public.driver_indie_parties (owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.driver_indie_receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  party_id uuid NOT NULL REFERENCES public.driver_indie_parties(id),
  billed_amount numeric NOT NULL CHECK (billed_amount > 0),
  billed_version integer NOT NULL DEFAULT 1 CHECK (billed_version >= 1),
  status text NOT NULL CHECK (status IN ('draft', 'issued', 'received', 'void')),
  operational_trip_id uuid REFERENCES public.trips(id),
  party_label text,
  idempotency_key text NOT NULL,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_indie_receivables_idempotency_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS driver_indie_receivables_owner_idx
  ON public.driver_indie_receivables (owner_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS driver_indie_receivables_trip_idx
  ON public.driver_indie_receivables (operational_trip_id)
  WHERE operational_trip_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.driver_indie_receivable_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id uuid NOT NULL REFERENCES public.driver_indie_receivables(id),
  version integer NOT NULL CHECK (version >= 1),
  billed_amount numeric NOT NULL CHECK (billed_amount > 0),
  party_id uuid NOT NULL REFERENCES public.driver_indie_parties(id),
  reason text,
  idempotency_key text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_indie_receivable_versions_idempotency_key UNIQUE (idempotency_key),
  CONSTRAINT driver_indie_receivable_versions_unique UNIQUE (receivable_id, version)
);

CREATE TABLE IF NOT EXISTS public.driver_indie_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id uuid NOT NULL REFERENCES public.driver_indie_receivables(id),
  amount numeric NOT NULL CHECK (amount > 0),
  payment_mode text NOT NULL,
  reference text,
  paid_on date,
  idempotency_key text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_indie_collections_idempotency_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS driver_indie_collections_receivable_idx
  ON public.driver_indie_collections (receivable_id, created_at ASC);

ALTER TABLE public.driver_indie_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_indie_receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_indie_receivable_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_indie_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_indie_parties_select_own ON public.driver_indie_parties;
CREATE POLICY driver_indie_parties_select_own
  ON public.driver_indie_parties
  FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    AND public.is_independent_driver_eligible(auth.uid())
  );

DROP POLICY IF EXISTS driver_indie_receivables_select_own ON public.driver_indie_receivables;
CREATE POLICY driver_indie_receivables_select_own
  ON public.driver_indie_receivables
  FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    AND public.is_independent_driver_eligible(auth.uid())
  );

DROP POLICY IF EXISTS driver_indie_receivable_versions_select_own ON public.driver_indie_receivable_versions;
CREATE POLICY driver_indie_receivable_versions_select_own
  ON public.driver_indie_receivable_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.driver_indie_receivables r
      WHERE r.id = receivable_id
        AND r.owner_user_id = auth.uid()
        AND public.is_independent_driver_eligible(auth.uid())
    )
  );

DROP POLICY IF EXISTS driver_indie_collections_select_own ON public.driver_indie_collections;
CREATE POLICY driver_indie_collections_select_own
  ON public.driver_indie_collections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.driver_indie_receivables r
      WHERE r.id = receivable_id
        AND r.owner_user_id = auth.uid()
        AND public.is_independent_driver_eligible(auth.uid())
    )
  );

GRANT SELECT ON public.driver_indie_parties TO authenticated;
GRANT SELECT ON public.driver_indie_receivables TO authenticated;
GRANT SELECT ON public.driver_indie_receivable_versions TO authenticated;
GRANT SELECT ON public.driver_indie_collections TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_driver_indie_party(
  p_name text,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text := nullif(trim(p_name), '');
  v_phone text := nullif(trim(p_phone), '');
  v_row public.driver_indie_parties%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.is_independent_driver_eligible(v_uid) THEN
    RAISE EXCEPTION 'driver_indie_denied' USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'driver_indie_name_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.driver_indie_parties
  WHERE owner_user_id = v_uid
    AND lower(name) = lower(v_name)
    AND coalesce(phone, '') = coalesce(v_phone, '')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.driver_indie_parties
    SET name = v_name, phone = v_phone, updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.driver_indie_parties (owner_user_id, name, phone)
    VALUES (v_uid, v_name, v_phone)
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'phone', v_row.phone
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_driver_indie_receivable(
  p_party_id uuid,
  p_billed numeric,
  p_idempotency_key text,
  p_trip_id uuid DEFAULT NULL,
  p_party_label text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_billed numeric;
  v_key text := nullif(trim(p_idempotency_key), '');
  v_party public.driver_indie_parties%ROWTYPE;
  v_existing public.driver_indie_receivables%ROWTYPE;
  v_id uuid;
  v_source text;
BEGIN
  IF v_uid IS NULL OR NOT public.is_independent_driver_eligible(v_uid) THEN
    RAISE EXCEPTION 'driver_indie_denied' USING ERRCODE = '42501';
  END IF;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'driver_indie_denied' USING ERRCODE = '42501';
  END IF;
  v_billed := round(coalesce(p_billed, 0));
  IF v_billed <= 0 THEN
    RAISE EXCEPTION 'driver_indie_billed_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.driver_indie_receivables
  WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'id', v_existing.id, 'replayed', true);
  END IF;

  SELECT * INTO v_party
  FROM public.driver_indie_parties
  WHERE id = p_party_id
    AND owner_user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_indie_party_denied' USING ERRCODE = '42501';
  END IF;

  IF p_trip_id IS NOT NULL THEN
    SELECT source INTO v_source FROM public.trips WHERE id = p_trip_id;
    IF coalesce(v_source, '') = 'market_bid' THEN
      RAISE EXCEPTION 'driver_indie_marketplace_denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.driver_indie_receivables (
    owner_user_id, party_id, billed_amount, billed_version, status,
    operational_trip_id, party_label, idempotency_key, issued_at
  ) VALUES (
    v_uid, p_party_id, v_billed, 1, 'issued',
    p_trip_id, nullif(trim(p_party_label), ''), v_key, now()
  )
  RETURNING id INTO v_id;

  INSERT INTO public.driver_indie_receivable_versions (
    receivable_id, version, billed_amount, party_id, reason, idempotency_key, created_by
  ) VALUES (
    v_id, 1, v_billed, p_party_id, 'issue', v_key || ':v1', v_uid
  );

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_driver_indie_receivable(
  p_receivable_id uuid,
  p_billed numeric,
  p_idempotency_key text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_billed numeric;
  v_key text := nullif(trim(p_idempotency_key), '');
  v_row public.driver_indie_receivables%ROWTYPE;
  v_existing public.driver_indie_receivable_versions%ROWTYPE;
  v_status text;
  v_collected numeric;
BEGIN
  IF v_uid IS NULL OR NOT public.is_independent_driver_eligible(v_uid) THEN
    RAISE EXCEPTION 'driver_indie_denied' USING ERRCODE = '42501';
  END IF;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'driver_indie_denied' USING ERRCODE = '42501';
  END IF;
  v_billed := round(coalesce(p_billed, 0));
  IF v_billed <= 0 THEN
    RAISE EXCEPTION 'driver_indie_billed_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.driver_indie_receivable_versions
  WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'id', v_existing.receivable_id, 'replayed', true);
  END IF;

  SELECT * INTO v_row
  FROM public.driver_indie_receivables
  WHERE id = p_receivable_id
  FOR UPDATE;
  IF NOT FOUND OR v_row.owner_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'driver_indie_denied' USING ERRCODE = '42501';
  END IF;
  IF v_row.status = 'void' THEN
    RAISE EXCEPTION 'driver_indie_voided' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.driver_indie_receivable_versions (
    receivable_id, version, billed_amount, party_id, reason, idempotency_key, created_by
  ) VALUES (
    v_row.id, v_row.billed_version + 1, v_billed, v_row.party_id,
    nullif(trim(p_reason), ''), v_key, v_uid
  );

  SELECT coalesce(sum(amount), 0) INTO v_collected
  FROM public.driver_indie_collections
  WHERE receivable_id = v_row.id;
  v_status := CASE
    WHEN v_collected >= v_billed THEN 'received'
    ELSE 'issued'
  END;

  UPDATE public.driver_indie_receivables
  SET billed_amount = v_billed,
      billed_version = billed_version + 1,
      status = v_status,
      updated_at = now()
  WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'replayed', false,
    'billed_amount', v_billed,
    'billed_version', v_row.billed_version + 1,
    'status', v_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.collect_driver_indie_receivable(
  p_receivable_id uuid,
  p_amount numeric,
  p_payment_mode text,
  p_idempotency_key text,
  p_reference text DEFAULT NULL,
  p_paid_on date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_amt numeric;
  v_key text := nullif(trim(p_idempotency_key), '');
  v_row public.driver_indie_receivables%ROWTYPE;
  v_existing public.driver_indie_collections%ROWTYPE;
  v_id uuid;
  v_collected numeric;
  v_status text;
BEGIN
  IF v_uid IS NULL OR NOT public.is_independent_driver_eligible(v_uid) THEN
    RAISE EXCEPTION 'driver_indie_denied' USING ERRCODE = '42501';
  END IF;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'driver_indie_denied' USING ERRCODE = '42501';
  END IF;
  v_amt := round(coalesce(p_amount, 0));
  IF v_amt <= 0 THEN
    RAISE EXCEPTION 'driver_indie_amount_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.driver_indie_collections
  WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'id', v_existing.id, 'replayed', true);
  END IF;

  SELECT * INTO v_row
  FROM public.driver_indie_receivables
  WHERE id = p_receivable_id
  FOR UPDATE;
  IF NOT FOUND OR v_row.owner_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'driver_indie_denied' USING ERRCODE = '42501';
  END IF;
  IF v_row.status NOT IN ('issued', 'received') THEN
    RAISE EXCEPTION 'driver_indie_not_due' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.driver_indie_collections (
    receivable_id, amount, payment_mode, reference, paid_on, idempotency_key, created_by
  ) VALUES (
    v_row.id, v_amt, upper(trim(coalesce(p_payment_mode, 'CASH'))),
    nullif(trim(p_reference), ''), p_paid_on, v_key, v_uid
  )
  RETURNING id INTO v_id;

  SELECT coalesce(sum(amount), 0) INTO v_collected
  FROM public.driver_indie_collections
  WHERE receivable_id = v_row.id;
  v_status := CASE WHEN v_collected >= v_row.billed_amount THEN 'received' ELSE 'issued' END;

  UPDATE public.driver_indie_receivables
  SET status = v_status, updated_at = now()
  WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'replayed', false,
    'collected', v_collected,
    'outstanding', greatest(0, v_row.billed_amount - v_collected),
    'status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_driver_indie_party(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_driver_indie_receivable(uuid, numeric, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.correct_driver_indie_receivable(uuid, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.collect_driver_indie_receivable(uuid, numeric, text, text, text, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.upsert_driver_indie_party(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_driver_indie_receivable(uuid, numeric, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_driver_indie_receivable(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.collect_driver_indie_receivable(uuid, numeric, text, text, text, date) TO authenticated;

COMMENT ON TABLE public.driver_indie_parties IS
  'Independent DRIVER customers. Never DCO Self parties or organisation clients.';
COMMENT ON TABLE public.driver_indie_receivables IS
  'Independent DRIVER AR. Due only when issued. Never writes DCO Self or employer ledger.';
COMMENT ON TABLE public.driver_indie_collections IS
  'Append-only independent DRIVER collections.';
