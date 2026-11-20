-- Pool rebid after vehicle commit runs out.
-- Problem (prod 2026-11-20, MANI TRANSPORT, Pondicherry -> Chennai): a pool bid
-- with vehicle_limit 1 on 3 loads; 1 award exhausted the commit and
-- tg_network_pool_commit_on_quote_accept (20271118213000) marked the other 2
-- quotes 'rejected'. submit_network_quote treats any non-pending quote as
-- quote_locked, so the supplier could never quote those 2 open loads again.
-- Fix: a quote closed only by pool exhaustion can be quoted again (single load
-- or pool). Shipper rejections, counters and awards stay locked as before.
-- Function bodies are the live prod definitions with the marked additions only.

SET LOCAL lock_timeout = '5s';

-- True only for a quote the exhaustion trigger closed: rejected, on a commit that
-- is exhausted, and closed in the same transaction that exhausted it (same
-- now()). A shipper reject or award-time reject happens in another transaction.
CREATE OR REPLACE FUNCTION public.direct_quote_closed_by_pool_exhaustion(p_quote_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.direct_quotes dq
    JOIN public.network_pool_bid_commits c ON c.id = dq.pool_commit_id
    WHERE dq.id = p_quote_id
      AND dq.status = 'rejected'
      AND c.status = 'exhausted'
      AND dq.updated_at = c.updated_at
  );
$function$;

REVOKE ALL ON FUNCTION public.direct_quote_closed_by_pool_exhaustion(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_network_quote(p_indent_id uuid, p_bidder_org_id uuid, p_amount numeric, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_indent_org uuid;
  v_existing public.direct_quotes%ROWTYPE;
  v_quote_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  -- Same membership rule as the "Bidders can insert own direct quotes" policy.
  IF p_bidder_org_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_bidder_org_id
      AND om.user_id = v_uid
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member', 'dispatcher', 'finance')
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller is not an active member of bidder organization';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.market_indents_for_org(p_bidder_org_id) m
    WHERE m.id = p_indent_id
  ) THEN
    RAISE EXCEPTION 'indent_not_visible: this load is not available to your organization';
  END IF;

  SELECT i.organization_id INTO v_indent_org
  FROM public.indents i
  WHERE i.id = p_indent_id
  FOR SHARE;

  IF NOT FOUND OR NOT public.indent_open_for_marketplace_bids(p_indent_id) THEN
    RAISE EXCEPTION 'indent_not_open: this load is no longer open for quotes';
  END IF;

  IF v_indent_org = p_bidder_org_id THEN
    RAISE EXCEPTION 'own_indent: your organization cannot quote on its own load';
  END IF;

  SELECT * INTO v_existing
  FROM public.direct_quotes dq
  WHERE dq.indent_id = p_indent_id
    AND dq.bidder_organization_id = p_bidder_org_id
  FOR UPDATE;

  -- ADDED (pool rebid): a quote closed only because its pool vehicle commit
  -- ran out reopens as a fresh pending quote. pool_commit_id is cleared; a pool
  -- resubmit sets it again to the new commit.
  IF v_existing.id IS NOT NULL
     AND public.direct_quote_closed_by_pool_exhaustion(v_existing.id) THEN
    UPDATE public.direct_quotes
    SET status = 'pending',
        amount = p_amount,
        notes = NULLIF(btrim(coalesce(p_notes, '')), ''),
        counter_amount = NULL,
        pool_commit_id = NULL,
        updated_at = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_quote_id;

    RETURN jsonb_build_object(
      'quote_id', v_quote_id,
      'indent_id', p_indent_id,
      'bidder_organization_id', p_bidder_org_id,
      'amount', p_amount,
      'status', 'pending',
      'created', false
    );
  END IF;
  -- END ADDED

  IF FOUND AND (v_existing.status IS DISTINCT FROM 'pending' OR v_existing.counter_amount IS NOT NULL) THEN
    RAISE EXCEPTION 'quote_locked: this quote is no longer open for changes (status=%)',
      CASE WHEN v_existing.counter_amount IS NOT NULL AND v_existing.status = 'pending'
        THEN 'countered' ELSE v_existing.status END;
  END IF;

  INSERT INTO public.direct_quotes (indent_id, bidder_organization_id, amount, notes, status)
  VALUES (p_indent_id, p_bidder_org_id, p_amount, NULLIF(btrim(coalesce(p_notes, '')), ''), 'pending')
  ON CONFLICT (indent_id, bidder_organization_id) DO UPDATE SET
    amount = EXCLUDED.amount,
    notes = EXCLUDED.notes,
    updated_at = now()
  WHERE public.direct_quotes.status = 'pending'
    AND public.direct_quotes.counter_amount IS NULL
  RETURNING id INTO v_quote_id;

  IF v_quote_id IS NULL THEN
    RAISE EXCEPTION 'quote_locked: this quote is no longer open for changes';
  END IF;

  RETURN jsonb_build_object(
    'quote_id', v_quote_id,
    'indent_id', p_indent_id,
    'bidder_organization_id', p_bidder_org_id,
    'amount', p_amount,
    'status', 'pending',
    'created', v_existing.id IS NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_org_network_pool(p_org_id uuid, p_pickup text, p_drop text, p_vehicle_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  c_max_members constant integer := 150;
  v_key text;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  -- Same role set as submit_network_quote and market_indents_for_org.
  IF NOT public.is_org_staff(p_org_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  v_key := public._pool_key(p_pickup, p_drop, p_vehicle_type);
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'invalid_pool_key: pickup, drop and vehicle are required';
  END IF;

  WITH state AS (
    SELECT
      r.*,
      q.id AS quote_id,
      q.status AS quote_status,
      q.amount AS quote_amount,
      q.counter_amount AS quote_counter_amount,
      q.updated_at AS quote_updated_at,
      -- submit_network_quote accepts a new quote, an uncountered pending one,
      -- or (ADDED) one closed only because its pool vehicle commit ran out.
      (q.id IS NULL
        OR (q.status = 'pending' AND q.counter_amount IS NULL)
        OR public.direct_quote_closed_by_pool_exhaustion(q.id)) AS quotable
    FROM public._network_pool_rows(p_org_id, v_key) r
    LEFT JOIN public.direct_quotes q
      ON q.indent_id = r.id AND q.bidder_organization_id = p_org_id
  ),
  stats AS (
    SELECT
      count(*) FILTER (WHERE NOT s.sponsored)::integer AS member_count,
      count(*) FILTER (WHERE s.sponsored)::integer AS sponsored_count,
      (count(DISTINCT s.organization_id) FILTER (WHERE NOT s.sponsored))::integer AS shipper_count,
      md5(jsonb_build_array(
        p_org_id,
        coalesce(jsonb_agg(jsonb_build_array(
          s.id, s.pickup_key, s.drop_key, s.vehicle_key, s.status, s.circulation_target,
          s.supplier_target, s.client_price, s.pickup_date, s.load_type, s.weight,
          s.sponsored, s.quote_id, s.quote_status, s.quote_amount, s.quote_counter_amount
        ) ORDER BY s.id), '[]'::jsonb)
      )::text) AS fingerprint
    FROM state s
  )
  SELECT jsonb_build_object(
    'pool_key', v_key,
    'viewing_organization_id', p_org_id,
    'as_of', now(),
    'max_members', c_max_members,
    'member_count', t.member_count,
    'shipper_count', t.shipper_count,
    'excluded_sponsored_count', t.sponsored_count,
    'complete', t.member_count <= c_max_members,
    'fingerprint', CASE WHEN t.member_count <= c_max_members THEN t.fingerprint END,
    'members', CASE WHEN t.member_count <= c_max_members THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'indent_number', s.indent_number,
        'pickup_area', s.pickup_area,
        'drop_location', s.drop_location,
        'vehicle_type', s.vehicle_type,
        'load_type', s.load_type,
        'pickup_date', s.pickup_date,
        'status', s.status,
        'circulation_target', s.circulation_target,
        'supplier_target', s.supplier_target,
        'client_price', s.client_price,
        'weight', s.weight,
        'organization_id', s.organization_id,
        'creator_organization_name', s.creator_organization_name,
        'created_at', s.created_at
      ) ORDER BY s.created_at DESC, s.id)
      FROM state s WHERE NOT s.sponsored
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'quotable_ids', CASE WHEN t.member_count <= c_max_members THEN coalesce((
      SELECT jsonb_agg(s.id ORDER BY s.created_at DESC, s.id)
      FROM state s WHERE NOT s.sponsored AND s.quotable
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'org_quotes', CASE WHEN t.member_count <= c_max_members THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.quote_id,
        'indent_id', s.id,
        'status', s.quote_status,
        'amount', s.quote_amount,
        'counter_amount', s.quote_counter_amount,
        'quotable', s.quotable,
        'updated_at', s.quote_updated_at
      ) ORDER BY s.id)
      FROM state s WHERE NOT s.sponsored AND s.quote_id IS NOT NULL
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  )
  INTO v_result
  FROM stats t;

  RETURN v_result;
END;
$function$;
