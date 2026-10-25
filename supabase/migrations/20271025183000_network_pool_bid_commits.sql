-- Pool bid commitment: how many vehicles stay on a Network pool quote, and
-- until when shippers may award it. Remaining pending quotes stay pending so
-- the supplier can bid again; shipper lists hide a commit that is exhausted
-- or past valid_until.

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.network_pool_bid_commits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bidder_organization_id uuid NOT NULL REFERENCES public.organizations (id),
  pool_key text NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  vehicle_limit integer NOT NULL CHECK (vehicle_limit >= 1 AND vehicle_limit <= 200),
  valid_until timestamptz NOT NULL,
  awarded_count integer NOT NULL DEFAULT 0 CHECK (awarded_count >= 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'exhausted', 'expired', 'superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT network_pool_bid_commits_awarded_lte_limit
    CHECK (awarded_count <= vehicle_limit)
);

CREATE UNIQUE INDEX IF NOT EXISTS network_pool_bid_commits_one_active
  ON public.network_pool_bid_commits (bidder_organization_id, pool_key)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS network_pool_bid_commits_org_pool_idx
  ON public.network_pool_bid_commits (bidder_organization_id, pool_key);

ALTER TABLE public.direct_quotes
  ADD COLUMN IF NOT EXISTS pool_commit_id uuid
    REFERENCES public.network_pool_bid_commits (id);

CREATE INDEX IF NOT EXISTS direct_quotes_pool_commit_id_idx
  ON public.direct_quotes (pool_commit_id)
  WHERE pool_commit_id IS NOT NULL;

COMMENT ON TABLE public.network_pool_bid_commits IS
  'Supplier pool quote capacity: vehicle_limit awards, then remaining members no longer see the bid until they quote again.';
COMMENT ON COLUMN public.direct_quotes.pool_commit_id IS
  'Network pool quote batch this row belongs to. Null = standalone indent quote.';

ALTER TABLE public.network_pool_bid_commits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS network_pool_bid_commits_select ON public.network_pool_bid_commits;
CREATE POLICY network_pool_bid_commits_select
  ON public.network_pool_bid_commits
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_staff(bidder_organization_id)
    OR EXISTS (
      SELECT 1
      FROM public.direct_quotes dq
      JOIN public.indents i ON i.id = dq.indent_id
      WHERE dq.pool_commit_id = network_pool_bid_commits.id
        AND public.is_org_staff(i.organization_id)
    )
  );

REVOKE ALL ON TABLE public.network_pool_bid_commits FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.network_pool_bid_commits TO authenticated;

CREATE OR REPLACE FUNCTION public.network_pool_commit_is_live(
  p_status text,
  p_awarded_count integer,
  p_vehicle_limit integer,
  p_valid_until timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    coalesce(p_status, '') = 'active'
    AND coalesce(p_awarded_count, 0) < coalesce(p_vehicle_limit, 0)
    AND p_valid_until IS NOT NULL
    AND p_valid_until > now();
$$;

CREATE OR REPLACE FUNCTION public.tg_network_pool_commit_on_quote_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_commit public.network_pool_bid_commits%ROWTYPE;
  v_next integer;
BEGIN
  IF NEW.pool_commit_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'accepted' OR NEW.status IS DISTINCT FROM 'accepted' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_commit
  FROM public.network_pool_bid_commits
  WHERE id = NEW.pool_commit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pool_commit_inactive: this pool bid is no longer open for award';
  END IF;

  IF v_commit.valid_until <= now() THEN
    UPDATE public.network_pool_bid_commits
    SET status = 'expired', updated_at = now()
    WHERE id = v_commit.id AND status = 'active';
    RAISE EXCEPTION 'pool_commit_expired: this pool bid is past its valid-until date';
  END IF;

  IF v_commit.status <> 'active' OR v_commit.awarded_count >= v_commit.vehicle_limit THEN
    RAISE EXCEPTION 'pool_commit_exhausted: this supplier has no remaining vehicles on this pool bid';
  END IF;

  v_next := v_commit.awarded_count + 1;
  UPDATE public.network_pool_bid_commits
  SET
    awarded_count = v_next,
    status = CASE WHEN v_next >= v_commit.vehicle_limit THEN 'exhausted' ELSE 'active' END,
    updated_at = now()
  WHERE id = v_commit.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_network_pool_commit_on_quote_accept ON public.direct_quotes;
CREATE TRIGGER trg_network_pool_commit_on_quote_accept
  BEFORE UPDATE OF status ON public.direct_quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_network_pool_commit_on_quote_accept();

CREATE OR REPLACE FUNCTION public.get_direct_quotes_with_bidder_names(p_indent_id uuid)
RETURNS TABLE (
  id uuid,
  indent_id uuid,
  bidder_organization_id uuid,
  amount numeric,
  notes text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  driver_id uuid,
  vehicle_id uuid,
  bidder_organization_name text,
  counter_amount numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dq.id,
    dq.indent_id,
    dq.bidder_organization_id,
    dq.amount,
    dq.notes,
    dq.status,
    dq.created_at,
    dq.updated_at,
    dq.driver_id,
    dq.vehicle_id,
    coalesce(nullif(trim(o.name), ''), 'Supplier') AS bidder_organization_name,
    dq.counter_amount
  FROM public.direct_quotes dq
  LEFT JOIN public.organizations o ON o.id = dq.bidder_organization_id
  LEFT JOIN public.network_pool_bid_commits c ON c.id = dq.pool_commit_id
  WHERE dq.indent_id = p_indent_id
    AND EXISTS (
      SELECT 1 FROM public.indents i
      JOIN public.organization_members om
        ON om.organization_id = i.organization_id AND om.user_id = auth.uid()
      WHERE i.id = dq.indent_id
    )
    AND (
      dq.status IS DISTINCT FROM 'pending'
      OR dq.pool_commit_id IS NULL
      OR public.network_pool_commit_is_live(
        c.status, c.awarded_count, c.vehicle_limit, c.valid_until
      )
    )
  ORDER BY dq.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_direct_quotes_with_bidder_names(uuid) IS
  'List direct quotes for an indent with bidder org name + counter_amount. Hides pending pool quotes whose vehicle commit is exhausted or expired. Caller must be member of indent org.';

GRANT EXECUTE ON FUNCTION public.get_direct_quotes_with_bidder_names(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_network_pool_quote(
  p_org_id uuid,
  p_pickup text,
  p_drop text,
  p_vehicle_type text,
  p_amount numeric,
  p_vehicle_limit integer,
  p_valid_until timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_manifest jsonb;
  v_key text;
  v_commit_id uuid;
  v_indent_id uuid;
  v_quoted int := 0;
  v_failed int := 0;
  v_quote jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  IF p_vehicle_limit IS NULL OR p_vehicle_limit < 1 OR p_vehicle_limit > 200 THEN
    RAISE EXCEPTION 'invalid_vehicle_limit';
  END IF;
  IF p_valid_until IS NULL OR p_valid_until <= now() THEN
    RAISE EXCEPTION 'invalid_valid_until';
  END IF;
  IF p_valid_until > now() + interval '90 days' THEN
    RAISE EXCEPTION 'invalid_valid_until: furthest date is 90 days';
  END IF;
  IF NOT public.is_org_staff(p_org_id) THEN
    RAISE EXCEPTION 'unauthorized: caller is not an active member of bidder organization';
  END IF;

  v_manifest := public.get_org_network_pool(p_org_id, p_pickup, p_drop, p_vehicle_type);
  IF v_manifest IS NULL OR coalesce((v_manifest ->> 'complete')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'pool_incomplete';
  END IF;
  v_key := v_manifest ->> 'pool_key';
  IF v_key IS NULL OR btrim(v_key) = '' THEN
    RAISE EXCEPTION 'invalid_pool_key';
  END IF;
  IF coalesce(jsonb_array_length(v_manifest -> 'quotable_ids'), 0) = 0 THEN
    RAISE EXCEPTION 'pool_not_quotable';
  END IF;
  IF p_vehicle_limit > coalesce((v_manifest ->> 'member_count')::int, 0) THEN
    RAISE EXCEPTION 'invalid_vehicle_limit: cannot commit more vehicles than loads in this pool';
  END IF;

  UPDATE public.network_pool_bid_commits
  SET status = 'superseded', updated_at = now()
  WHERE bidder_organization_id = p_org_id
    AND pool_key = v_key
    AND status = 'active';

  INSERT INTO public.network_pool_bid_commits (
    bidder_organization_id, pool_key, amount, vehicle_limit, valid_until, status
  ) VALUES (
    p_org_id, v_key, p_amount, p_vehicle_limit, p_valid_until, 'active'
  )
  RETURNING id INTO v_commit_id;

  FOR v_indent_id IN
    SELECT t.value::uuid
    FROM jsonb_array_elements_text(v_manifest -> 'quotable_ids') AS t(value)
  LOOP
    BEGIN
      v_quote := public.submit_network_quote(v_indent_id, p_org_id, p_amount, NULL);
      UPDATE public.direct_quotes
      SET pool_commit_id = v_commit_id, updated_at = now()
      WHERE id = (v_quote ->> 'quote_id')::uuid;
      v_quoted := v_quoted + 1;
    EXCEPTION
      WHEN OTHERS THEN
        v_failed := v_failed + 1;
    END;
  END LOOP;

  IF v_quoted = 0 THEN
    UPDATE public.network_pool_bid_commits
    SET status = 'superseded', updated_at = now()
    WHERE id = v_commit_id;
    RAISE EXCEPTION 'pool_not_quoted: none of the loads took your rate';
  END IF;

  RETURN jsonb_build_object(
    'commit_id', v_commit_id,
    'pool_key', v_key,
    'quoted', v_quoted,
    'failed', v_failed,
    'vehicle_limit', p_vehicle_limit,
    'valid_until', p_valid_until
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_network_pool_quote(uuid, text, text, text, numeric, integer, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_network_pool_quote(uuid, text, text, text, numeric, integer, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.submit_network_pool_quote(uuid, text, text, text, numeric, integer, timestamptz) IS
  'One Network pool quote plus a vehicle-count / valid-until commit. Remaining shippers stop seeing the bid after vehicle_limit awards or after valid_until.';
