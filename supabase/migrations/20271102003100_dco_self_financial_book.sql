SET LOCAL lock_timeout = '5s';

-- DCO Self financial book. Independent of organisation trips.client_id /
-- client_name / supplier_rate. Party B lives in dco_self_parties (not
-- public.clients) because org-member RLS + Finance client lists are not
-- proven isolated. Independents and employees are out of this increment.

-- Workspace helper restated so this file does not depend on unverified
-- remote apply of 20271101154500 / 184600.
CREATE OR REPLACE FUNCTION public.dco_self_workspace_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
  SELECT o.id
  FROM public.organizations o
  WHERE p_user_id IS NOT NULL
    AND o.owner_id = p_user_id
    AND o.operating_model = 'ASSET_BASED'
    AND NOT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = o.id
        AND om.user_id IS DISTINCT FROM p_user_id
        AND om.status = 'active'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.drivers d
      WHERE d.organization_id = o.id
        AND d.left_at IS NULL
        AND d.relationship_status = 'active_employee'
    )
  ORDER BY o.created_at ASC NULLS LAST
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.dco_self_workspace_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dco_self_workspace_id(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.dco_self_workspace_id(uuid) FROM authenticated;

CREATE TABLE IF NOT EXISTS public.dco_self_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  phone text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dco_self_parties_workspace_idx
  ON public.dco_self_parties (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.dco_self_receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.organizations(id),
  dco_user_id uuid NOT NULL,
  party_b_id uuid NOT NULL REFERENCES public.dco_self_parties(id),
  billed_amount numeric NOT NULL CHECK (billed_amount > 0),
  billed_version integer NOT NULL DEFAULT 1 CHECK (billed_version >= 1),
  status text NOT NULL CHECK (status IN ('draft', 'issued', 'received', 'void')),
  operational_trip_id uuid REFERENCES public.trips(id),
  party_a_label text,
  idempotency_key text NOT NULL,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dco_self_receivables_idempotency_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS dco_self_receivables_workspace_idx
  ON public.dco_self_receivables (workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS dco_self_receivables_trip_idx
  ON public.dco_self_receivables (operational_trip_id)
  WHERE operational_trip_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.dco_self_receivable_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id uuid NOT NULL REFERENCES public.dco_self_receivables(id),
  version integer NOT NULL CHECK (version >= 1),
  billed_amount numeric NOT NULL CHECK (billed_amount > 0),
  party_b_id uuid NOT NULL REFERENCES public.dco_self_parties(id),
  reason text,
  idempotency_key text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dco_self_receivable_versions_idempotency_key UNIQUE (idempotency_key),
  CONSTRAINT dco_self_receivable_versions_unique UNIQUE (receivable_id, version)
);

CREATE TABLE IF NOT EXISTS public.dco_self_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id uuid NOT NULL REFERENCES public.dco_self_receivables(id),
  amount numeric NOT NULL CHECK (amount > 0),
  payment_mode text NOT NULL,
  reference text,
  paid_on date,
  idempotency_key text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dco_self_collections_idempotency_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS dco_self_collections_receivable_idx
  ON public.dco_self_collections (receivable_id, created_at ASC);

ALTER TABLE public.dco_self_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dco_self_receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dco_self_receivable_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dco_self_collections ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._dco_self_caller_workspace()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
  SELECT CASE
    WHEN public.is_dco_eligible(auth.uid())
      THEN public.dco_self_workspace_id(auth.uid())
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public._dco_self_caller_workspace() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._dco_self_caller_workspace() FROM anon;
GRANT EXECUTE ON FUNCTION public._dco_self_caller_workspace() TO authenticated;

DROP POLICY IF EXISTS dco_self_parties_select_own ON public.dco_self_parties;
CREATE POLICY dco_self_parties_select_own
  ON public.dco_self_parties
  FOR SELECT
  TO authenticated
  USING (workspace_id IS NOT DISTINCT FROM public._dco_self_caller_workspace());

DROP POLICY IF EXISTS dco_self_receivables_select_own ON public.dco_self_receivables;
CREATE POLICY dco_self_receivables_select_own
  ON public.dco_self_receivables
  FOR SELECT
  TO authenticated
  USING (workspace_id IS NOT DISTINCT FROM public._dco_self_caller_workspace());

DROP POLICY IF EXISTS dco_self_receivable_versions_select_own ON public.dco_self_receivable_versions;
CREATE POLICY dco_self_receivable_versions_select_own
  ON public.dco_self_receivable_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.dco_self_receivables r
      WHERE r.id = receivable_id
        AND r.workspace_id IS NOT DISTINCT FROM public._dco_self_caller_workspace()
    )
  );

DROP POLICY IF EXISTS dco_self_collections_select_own ON public.dco_self_collections;
CREATE POLICY dco_self_collections_select_own
  ON public.dco_self_collections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.dco_self_receivables r
      WHERE r.id = receivable_id
        AND r.workspace_id IS NOT DISTINCT FROM public._dco_self_caller_workspace()
    )
  );

GRANT SELECT ON public.dco_self_parties TO authenticated;
GRANT SELECT ON public.dco_self_receivables TO authenticated;
GRANT SELECT ON public.dco_self_receivable_versions TO authenticated;
GRANT SELECT ON public.dco_self_collections TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_dco_self_party(
  p_name text,
  p_phone text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ws uuid;
  v_name text;
  v_phone text;
  v_id uuid;
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
  v_name := nullif(trim(p_name), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'dco_self_party_name_required' USING ERRCODE = '22023';
  END IF;
  v_phone := nullif(trim(p_phone), '');

  INSERT INTO public.dco_self_parties (workspace_id, name, phone, created_by)
  VALUES (v_ws, v_name, v_phone, v_uid)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'name', v_name, 'phone', v_phone);
END;
$$;

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
    SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'dco_self_trip_not_found' USING ERRCODE = '42501';
    END IF;
    IF lower(trim(coalesce(v_trip.source, ''))) = 'market_bid' THEN
      RAISE EXCEPTION 'dco_self_marketplace_denied' USING ERRCODE = '42501';
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
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_dco_self_receivable(
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
  v_ws uuid;
  v_row public.dco_self_receivables%ROWTYPE;
  v_billed numeric;
  v_key text;
  v_existing public.dco_self_receivable_versions%ROWTYPE;
  v_collected numeric;
  v_status text;
BEGIN
  IF v_uid IS NULL OR NOT public.is_dco_eligible(v_uid) THEN
    RAISE EXCEPTION 'dco_self_denied' USING ERRCODE = '42501';
  END IF;
  v_ws := public.dco_self_workspace_id(v_uid);
  v_key := nullif(trim(p_idempotency_key), '');
  IF v_ws IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'dco_self_denied' USING ERRCODE = '42501';
  END IF;
  v_billed := round(coalesce(p_billed, 0));
  IF v_billed <= 0 THEN
    RAISE EXCEPTION 'dco_self_billed_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.dco_self_receivable_versions
  WHERE idempotency_key = v_key;
  IF FOUND THEN
    SELECT * INTO v_row FROM public.dco_self_receivables WHERE id = v_existing.receivable_id;
    RETURN jsonb_build_object(
      'ok', true,
      'id', v_row.id,
      'replayed', true,
      'billed_amount', v_row.billed_amount,
      'billed_version', v_row.billed_version
    );
  END IF;

  SELECT * INTO v_row
  FROM public.dco_self_receivables
  WHERE id = p_receivable_id
  FOR UPDATE;
  IF NOT FOUND OR v_row.workspace_id IS DISTINCT FROM v_ws THEN
    RAISE EXCEPTION 'dco_self_denied' USING ERRCODE = '42501';
  END IF;
  IF v_row.status = 'void' THEN
    RAISE EXCEPTION 'dco_self_void' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.dco_self_receivable_versions (
    receivable_id, version, billed_amount, party_b_id, reason, idempotency_key, created_by
  ) VALUES (
    v_row.id, v_row.billed_version + 1, v_billed, v_row.party_b_id,
    nullif(trim(p_reason), ''), v_key, v_uid
  );

  SELECT coalesce(sum(amount), 0) INTO v_collected
  FROM public.dco_self_collections
  WHERE receivable_id = v_row.id;
  v_status := CASE WHEN v_collected >= v_billed THEN 'received' ELSE 'issued' END;

  UPDATE public.dco_self_receivables
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

CREATE OR REPLACE FUNCTION public.collect_dco_self_receivable(
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
  v_ws uuid;
  v_row public.dco_self_receivables%ROWTYPE;
  v_amt numeric;
  v_key text;
  v_existing public.dco_self_collections%ROWTYPE;
  v_id uuid;
  v_collected numeric;
  v_status text;
BEGIN
  IF v_uid IS NULL OR NOT public.is_dco_eligible(v_uid) THEN
    RAISE EXCEPTION 'dco_self_denied' USING ERRCODE = '42501';
  END IF;
  v_ws := public.dco_self_workspace_id(v_uid);
  v_key := nullif(trim(p_idempotency_key), '');
  IF v_ws IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'dco_self_denied' USING ERRCODE = '42501';
  END IF;
  v_amt := round(coalesce(p_amount, 0));
  IF v_amt <= 0 THEN
    RAISE EXCEPTION 'dco_self_amount_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.dco_self_collections
  WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'id', v_existing.id, 'replayed', true);
  END IF;

  SELECT * INTO v_row
  FROM public.dco_self_receivables
  WHERE id = p_receivable_id
  FOR UPDATE;
  IF NOT FOUND OR v_row.workspace_id IS DISTINCT FROM v_ws THEN
    RAISE EXCEPTION 'dco_self_denied' USING ERRCODE = '42501';
  END IF;
  IF v_row.status NOT IN ('issued', 'received') THEN
    RAISE EXCEPTION 'dco_self_not_due' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.dco_self_collections (
    receivable_id, amount, payment_mode, reference, paid_on, idempotency_key, created_by
  ) VALUES (
    v_row.id, v_amt, upper(trim(coalesce(p_payment_mode, 'CASH'))),
    nullif(trim(p_reference), ''), p_paid_on, v_key, v_uid
  )
  RETURNING id INTO v_id;

  SELECT coalesce(sum(amount), 0) INTO v_collected
  FROM public.dco_self_collections
  WHERE receivable_id = v_row.id;
  v_status := CASE WHEN v_collected >= v_row.billed_amount THEN 'received' ELSE 'issued' END;

  UPDATE public.dco_self_receivables
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

REVOKE ALL ON FUNCTION public.upsert_dco_self_party(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_dco_self_receivable(uuid, numeric, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.correct_dco_self_receivable(uuid, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.collect_dco_self_receivable(uuid, numeric, text, text, text, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.upsert_dco_self_party(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_dco_self_receivable(uuid, numeric, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_dco_self_receivable(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.collect_dco_self_receivable(uuid, numeric, text, text, text, date) TO authenticated;

COMMENT ON TABLE public.dco_self_parties IS
  'DCO Party B book. Isolated from public.clients / organisation Finance.';
COMMENT ON TABLE public.dco_self_receivables IS
  'DCO Self AR. Due only when status=issued. Never writes organisation trip customer or supplier_rate.';
COMMENT ON TABLE public.dco_self_collections IS
  'Append-only DCO Self collections. No UPDATE/DELETE policies for authenticated.';
