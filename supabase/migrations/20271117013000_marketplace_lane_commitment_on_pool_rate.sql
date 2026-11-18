-- Marketplace pool rate: a 48-hour lane commitment for bid visibility.
--
-- market_lane_bid_commits already stores one active rate per organisation and
-- lane. This replaces the opt-in window and the vehicle counter:
--
--   * A new commitment is visible for exactly 48 hours from creation.
--     The database sets valid_until. The client's timestamp is not the window.
--   * The same rate submitted again reuses that row and does not move
--     valid_until. Only loads with no offer from this carrier are filled.
--   * A different rate updates the same row and its pending market_bids.
--     valid_until stays. Accepted bids are not rewritten.
--   * p_renew = true is the only way to start a fresh 48-hour window on a
--     commitment that is still active.
--   * A row with valid_until <= now() is marked expired before matching.
--     Creating a load never makes it active again.
--   * Awarding a bid does not increment awarded_count, exhaust the row, or
--     create a trip. vehicle_limit remains a required column and is not a
--     reservation.
--
-- Network pool tables are only read: direct_quotes, to skip a carrier that
-- already quoted the load. No network pool table or function is changed.
-- Not applied.
--
-- Rollback: re-apply, from 20271114201500_marketplace_lane_rate_opt_in.sql,
-- the definitions with their REVOKE/GRANT/COMMENT statements of
-- market_lane_commit_is_live, _attach_market_lane_commit,
-- apply_standing_lane_bids, tg_market_lane_commit_on_bid_accept and
-- commit_marketplace_lane_rate, and the COMMENT ON TABLE
-- market_lane_bid_commits. Then:
--   DROP FUNCTION public._expire_market_lane_commits(text);
--   DROP FUNCTION public._release_stale_market_lane_bids(uuid, text);
--   DROP FUNCTION public.commit_marketplace_lane_rate(uuid, text, text, text, numeric, integer, timestamptz, boolean);
--   COMMENT ON FUNCTION public.market_lane_commit_is_live(text, integer, integer, timestamptz) IS NULL;
--   COMMENT ON FUNCTION public.tg_market_lane_commit_on_bid_accept() IS NULL;
--   COMMENT ON FUNCTION public._attach_market_lane_commit(uuid, uuid) IS NULL;
--   COMMENT ON FUNCTION public.withdraw_marketplace_lane_rate(uuid) IS NULL;
-- The indent trigger is not replaced by this file, so it stays. Leave
-- market_lane_bid_commits and market_bids rows in place. Do not delete bids.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.market_lane_commit_is_live(
  p_status text,
  p_awarded_count integer,
  p_vehicle_limit integer,
  p_valid_until timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT coalesce(p_status, '') = 'active'
    AND p_valid_until IS NOT NULL
    AND p_valid_until > pg_catalog.now();
$$;

COMMENT ON FUNCTION public.market_lane_commit_is_live(text, integer, integer, timestamptz) IS
  'A Marketplace lane commitment is live when it is active and its 48-hour window has not ended. Awarded count and vehicle limit are ignored: the row does not reserve capacity.';

REVOKE ALL ON FUNCTION public.market_lane_commit_is_live(text, integer, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.market_lane_commit_is_live(text, integer, integer, timestamptz) TO authenticated, service_role;

-- Accepting a bid must not consume the commitment. The shipper update still
-- proceeds; this trigger no longer rewrites the bid or the commitment.
CREATE OR REPLACE FUNCTION public.tg_market_lane_commit_on_bid_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_market_lane_commit_on_bid_accept() IS
  'Marketplace lane commitments do not consume a vehicle or a load when a bid is accepted. Acceptance stays on the existing market_bids award path.';

REVOKE ALL ON FUNCTION public.tg_market_lane_commit_on_bid_accept() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._expire_market_lane_commits(p_lane_key text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
  UPDATE public.market_lane_bid_commits c
  SET status = 'expired', updated_at = pg_catalog.now()
  WHERE c.lane_key = p_lane_key
    AND c.status = 'active'
    AND c.valid_until <= pg_catalog.now();
$$;

REVOKE ALL ON FUNCTION public._expire_market_lane_commits(text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._expire_market_lane_commits(text) IS
  'Marks an active Marketplace lane commitment expired at valid_until. An expired row is not made active when a load is created. Accepted bids are left alone.';

CREATE OR REPLACE FUNCTION public._release_stale_market_lane_bids(p_indent_id uuid, p_lane_key text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
  UPDATE public.market_bids mb
  SET status = 'withdrawn', updated_at = pg_catalog.now()
  FROM public.market_lane_bid_commits c
  WHERE mb.lane_commit_id = c.id
    AND mb.indent_id = p_indent_id
    AND mb.status = 'pending'
    AND c.lane_key IS DISTINCT FROM p_lane_key;
$$;

REVOKE ALL ON FUNCTION public._release_stale_market_lane_bids(uuid, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._release_stale_market_lane_bids(uuid, text) IS
  'Withdraws pending Marketplace bids whose lane commitment no longer matches this load. Accepted bids and other carriers stay.';

-- A lane change withdraws the pending bid, and that row still holds the unique
-- (indent, bidder) key. Point it at the new lane's commitment instead of
-- inserting a second bid. A rejected bid, or a withdrawal that still matches
-- this lane, is not placed again.
CREATE OR REPLACE FUNCTION public._attach_market_lane_commit(p_commit_id uuid, p_indent_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_commit public.market_lane_bid_commits%ROWTYPE;
  v_org uuid;
  v_key text;
  v_circulation text;
  v_status text;
  v_id uuid;
BEGIN
  SELECT * INTO v_commit FROM public.market_lane_bid_commits c WHERE c.id = p_commit_id;
  IF NOT FOUND OR NOT public.market_lane_commit_is_live(
    v_commit.status, v_commit.awarded_count, v_commit.vehicle_limit, v_commit.valid_until
  ) THEN
    RETURN false;
  END IF;

  SELECT
    i.organization_id,
    public.standing_lane_key(i.pickup_area, i.drop_location, i.vehicle_type),
    pg_catalog.lower(pg_catalog.btrim(coalesce(i.circulation_target, ''))),
    i.status::text
  INTO v_org, v_key, v_circulation, v_status
  FROM public.indents i
  WHERE i.id = p_indent_id
    AND i.deleted_at IS NULL;

  IF v_org IS NULL
    OR v_key IS DISTINCT FROM v_commit.lane_key
    OR v_org = v_commit.bidder_organization_id
    OR v_circulation NOT IN ('marketplace', 'both')
    OR NOT public.indent_is_open_marketplace_lane(v_status)
    OR public.indent_is_sponsored_reach_row(p_indent_id)
  THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_commit.bidder_organization_id
      AND om.user_id = v_commit.created_by
      AND om.status = 'active'
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.market_bids mb
  SET status = 'pending',
      amount = v_commit.amount,
      lane_commit_id = v_commit.id,
      note = 'Lane rate',
      updated_at = pg_catalog.now()
  FROM public.market_lane_bid_commits oldc
  WHERE mb.indent_id = p_indent_id
    AND mb.bidder_user_id = v_commit.created_by
    AND mb.status = 'withdrawn'
    AND mb.lane_commit_id = oldc.id
    AND oldc.lane_key IS DISTINCT FROM v_key
    AND NOT EXISTS (
      SELECT 1 FROM public.direct_quotes dq
      WHERE dq.indent_id = p_indent_id
        AND dq.bidder_organization_id = v_commit.bidder_organization_id
    )
  RETURNING mb.id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.market_bids mb
    WHERE mb.indent_id = p_indent_id
      AND (mb.bidder_organization_id = v_commit.bidder_organization_id
        OR mb.bidder_user_id = v_commit.created_by)
  ) OR EXISTS (
    SELECT 1 FROM public.direct_quotes dq
    WHERE dq.indent_id = p_indent_id
      AND dq.bidder_organization_id = v_commit.bidder_organization_id
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.market_bids (
    indent_id, bidder_type, bidder_user_id, bidder_organization_id,
    amount, note, status, lane_commit_id
  ) VALUES (
    p_indent_id, 'organization', v_commit.created_by, v_commit.bidder_organization_id,
    v_commit.amount, 'Lane rate', 'pending', v_commit.id
  )
  ON CONFLICT (indent_id, bidder_user_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._attach_market_lane_commit(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._attach_market_lane_commit(uuid, uuid) IS
  'Places one pending Marketplace bid for a live lane commitment. A bid withdrawn because the load left that lane is moved onto the matching commitment. Rejected bids and same-lane withdrawals are not placed again. Nothing is awarded.';

DROP FUNCTION IF EXISTS public.commit_marketplace_lane_rate(uuid, text, text, text, numeric, integer, timestamptz);

CREATE OR REPLACE FUNCTION public.commit_marketplace_lane_rate(
  p_org_id uuid,
  p_pickup text,
  p_drop text,
  p_vehicle_type text,
  p_amount numeric,
  p_vehicle_limit integer,
  p_valid_until timestamptz,
  p_renew boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_key text := public.standing_lane_key(p_pickup, p_drop, p_vehicle_type);
  v_existing public.market_lane_bid_commits%ROWTYPE;
  v_commit_id uuid;
  v_until timestamptz;
  v_indent_id uuid;
  v_linked integer := 0;
  v_attached integer := 0;
  v_reused boolean := false;
  v_renewed boolean := false;
  v_rate_changed boolean := false;
  v_found boolean := false;
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
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'no_lane: pickup, drop and vehicle type are required';
  END IF;
  IF NOT public.is_org_staff(p_org_id) THEN
    RAISE EXCEPTION 'unauthorized: caller is not an active member of bidder organization';
  END IF;

  -- p_valid_until is accepted so existing callers keep working. The stored
  -- window below is now() + 48 hours, or the row's current valid_until.
  IF p_valid_until IS NULL THEN
    NULL;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.concat('market_lane:', p_org_id, ':', v_key), 0)
  );

  PERFORM public._expire_market_lane_commits(v_key);

  SELECT * INTO v_existing
  FROM public.market_lane_bid_commits c
  WHERE c.bidder_organization_id = p_org_id
    AND c.lane_key = v_key
    AND c.status = 'active'
  FOR UPDATE;
  v_found := FOUND;

  IF v_found AND v_existing.amount = p_amount AND NOT coalesce(p_renew, false) THEN
    v_commit_id := v_existing.id;
    v_until := v_existing.valid_until;
    v_reused := true;
  ELSIF v_found THEN
    v_commit_id := v_existing.id;
    v_rate_changed := v_existing.amount IS DISTINCT FROM p_amount;
    v_renewed := coalesce(p_renew, false);
    v_until := CASE
      WHEN v_renewed THEN pg_catalog.now() + interval '48 hours'
      ELSE v_existing.valid_until
    END;

    UPDATE public.market_lane_bid_commits c
    SET amount = p_amount,
        valid_until = v_until,
        updated_at = pg_catalog.now()
    WHERE c.id = v_commit_id;

    UPDATE public.market_bids mb
    SET amount = p_amount, updated_at = pg_catalog.now()
    WHERE mb.lane_commit_id = v_commit_id
      AND mb.status = 'pending'
      AND mb.amount IS DISTINCT FROM p_amount;
    GET DIAGNOSTICS v_linked = ROW_COUNT;
  ELSE
    v_until := pg_catalog.now() + interval '48 hours';
    v_renewed := coalesce(p_renew, false);
    INSERT INTO public.market_lane_bid_commits (
      bidder_organization_id, created_by, lane_key, pickup_area, drop_location, vehicle_type,
      amount, vehicle_limit, valid_until
    ) VALUES (
      p_org_id, v_uid, v_key, pg_catalog.btrim(p_pickup), pg_catalog.btrim(p_drop),
      pg_catalog.btrim(p_vehicle_type), p_amount, p_vehicle_limit, v_until
    )
    RETURNING id INTO v_commit_id;

    UPDATE public.market_bids mb
    SET lane_commit_id = v_commit_id, updated_at = pg_catalog.now()
    FROM public.indents i
    WHERE mb.indent_id = i.id
      AND mb.bidder_organization_id = p_org_id
      AND mb.status = 'pending'
      AND mb.lane_commit_id IS NULL
      AND mb.amount = p_amount
      AND i.deleted_at IS NULL
      AND public.standing_lane_key(i.pickup_area, i.drop_location, i.vehicle_type) = v_key;
    GET DIAGNOSTICS v_linked = ROW_COUNT;
  END IF;

  -- Eligible loads open now. A lane with none still keeps the commitment.
  -- _attach_market_lane_commit uses ON CONFLICT DO NOTHING, so a retry
  -- cannot insert a second bid for the same carrier user and load.
  FOR v_indent_id IN
    SELECT i.id
    FROM public.indents i
    WHERE i.deleted_at IS NULL
      AND public.standing_lane_key(i.pickup_area, i.drop_location, i.vehicle_type) = v_key
      AND i.organization_id <> p_org_id
      AND pg_catalog.lower(pg_catalog.btrim(coalesce(i.circulation_target, ''))) IN ('marketplace', 'both')
      AND public.indent_is_open_marketplace_lane(i.status::text)
    ORDER BY i.created_at, i.id
  LOOP
    IF public._attach_market_lane_commit(v_commit_id, v_indent_id) THEN
      v_attached := v_attached + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'commit_id', v_commit_id,
    'lane_key', v_key,
    'linked', v_linked,
    'attached', v_attached,
    'reused', v_reused,
    'renewed', v_renewed,
    'rate_changed', v_rate_changed,
    'vehicle_limit', p_vehicle_limit,
    'valid_until', v_until
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_marketplace_lane_rate(uuid, text, text, text, numeric, integer, timestamptz, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_marketplace_lane_rate(uuid, text, text, text, numeric, integer, timestamptz, boolean) TO authenticated;

COMMENT ON FUNCTION public.commit_marketplace_lane_rate(uuid, text, text, text, numeric, integer, timestamptz, boolean) IS
  'Saves a Marketplace lane rate for 48 hours and places one pending market_bids row on each eligible open load. The same rate reuses the commitment without extending it. A different rate updates pending bids only. p_renew starts a new 48-hour window. Nothing is awarded and no vehicle is reserved.';

COMMENT ON FUNCTION public.withdraw_marketplace_lane_rate(uuid) IS
  'Cancels a Marketplace lane commitment so later loads do not receive it. Bids already placed, including accepted bids, are not deleted and awards are not reversed.';

COMMENT ON TABLE public.market_lane_bid_commits IS
  'Marketplace lane rate. One active row per organisation and lane, visible for 48 hours. It places individual market_bids. It does not reserve vehicles or award loads.';

CREATE OR REPLACE FUNCTION public.apply_standing_lane_bids(p_indent_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_key text;
  v_commit_id uuid;
  v_inserted integer := 0;
BEGIN
  SELECT public.standing_lane_key(i.pickup_area, i.drop_location, i.vehicle_type)
    INTO v_key
  FROM public.indents i
  WHERE i.id = p_indent_id
    AND i.deleted_at IS NULL
    AND pg_catalog.lower(pg_catalog.btrim(coalesce(i.circulation_target, ''))) IN ('marketplace', 'both');

  IF v_key IS NULL THEN
    RETURN 0;
  END IF;

  -- Expired rows are closed here. They are not set back to active.
  PERFORM public._expire_market_lane_commits(v_key);
  PERFORM public._release_stale_market_lane_bids(p_indent_id, v_key);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_indent_id::text, 0));

  FOR v_commit_id IN
    SELECT c.id
    FROM public.market_lane_bid_commits c
    WHERE c.lane_key = v_key
      AND c.status = 'active'
      AND public.market_lane_commit_is_live(c.status, c.awarded_count, c.vehicle_limit, c.valid_until)
    ORDER BY c.amount, c.id
  LOOP
    IF public._attach_market_lane_commit(v_commit_id, p_indent_id) THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_standing_lane_bids(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_standing_lane_bids(uuid) TO service_role;

COMMENT ON FUNCTION public.apply_standing_lane_bids(uuid) IS
  'Places each unexpired Marketplace lane commitment on this load as one pending market_bids row. Uses the lane key index. Does not award, reserve a vehicle, or roll the indent back: the caller trigger logs a failure and returns the indent.';
