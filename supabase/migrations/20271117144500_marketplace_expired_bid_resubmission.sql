-- A carrier whose pending Marketplace bid has passed expires_at can place a
-- fresh offer. The expired row is closed, not edited: its amount, created_at
-- and expires_at stay, and its status becomes 'expired' so it is no longer
-- actionable. The fresh row gets its own created_at and its own 48-hour clock
-- from market_bids_set_expiry.
--
-- The old UNIQUE (indent_id, bidder_user_id) allowed one row forever, so an
-- expired bid blocked the next one. One pending row per carrier and load is
-- still required. Accepted bids are refused in submit_market_bid, because a
-- partial index cannot express "no pending row while an accepted row exists".
--
-- Not applied.
--
-- Rollback, only while no later migration depends on status 'expired':
--   Refuse it while any market_bids row has status 'expired' and a later
--   pending row exists for the same indent and bidder: collapsing those
--   would lose the fresh offer or the history.
--   Then restore submit_market_bid from
--   20271006182000_submit_market_bid_indent_checks.sql and
--   _attach_market_lane_commit from
--   20271117013000_marketplace_lane_commitment_on_pool_rate.sql,
--   DROP INDEX public.market_bids_one_pending_per_carrier_idx,
--   CREATE UNIQUE INDEX market_bids_indent_id_bidder_user_id_key
--     ON public.market_bids (indent_id, bidder_user_id),
--   and put the status check back without 'expired'
--   (20270306000000).

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.market_bids DROP CONSTRAINT market_bids_status_check;
ALTER TABLE public.market_bids ADD CONSTRAINT market_bids_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'accepted'::text, 'rejected'::text, 'withdrawn'::text,
    'superseded'::text, 'expired'::text
  ]));

ALTER TABLE public.market_bids
  DROP CONSTRAINT market_bids_indent_id_bidder_user_id_key;

CREATE UNIQUE INDEX market_bids_one_pending_per_carrier_idx
  ON public.market_bids (indent_id, bidder_user_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.submit_market_bid(
  p_indent_id uuid,
  p_amount numeric,
  p_note text DEFAULT NULL,
  p_bidder_organization_id uuid DEFAULT NULL,
  p_owner_vehicle_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_bidder_type text;
  v_bid_id uuid;
  v_indent_org uuid;
  v_circulation text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  SELECT i.organization_id, lower(trim(coalesce(i.circulation_target, '')))
    INTO v_indent_org, v_circulation
  FROM public.indents i
  WHERE i.id = p_indent_id
  FOR SHARE;

  IF NOT FOUND OR NOT public.indent_open_for_marketplace_bids(p_indent_id) THEN
    RAISE EXCEPTION 'indent_not_open: this load is no longer open for bids';
  END IF;

  IF v_circulation NOT IN ('marketplace', 'both') THEN
    RAISE EXCEPTION 'not_marketplace_circulated: this load is not offered on Marketplace';
  END IF;

  IF p_bidder_organization_id IS NOT NULL THEN
    IF p_bidder_organization_id = v_indent_org THEN
      RAISE EXCEPTION 'own_indent: you cannot bid on your own organization''s load';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_indent_org
      AND om.user_id = v_uid
      AND om.status = 'active'
  ) THEN
    RAISE EXCEPTION 'own_indent: you cannot bid on your own organization''s load';
  END IF;

  IF p_bidder_organization_id IS NULL THEN
    v_bidder_type := 'dco';

    IF NOT public.is_dco_marketplace_eligible(v_uid) THEN
      RAISE EXCEPTION 'unauthorized: approved, currently-independent DCO status with an active vehicle is required for a DCO bid';
    END IF;

    IF NOT public.is_driver_available(v_uid) THEN
      RAISE EXCEPTION 'driver_unavailable: you are on an active trip -- complete it before bidding on another load';
    END IF;

    IF p_owner_vehicle_id IS NULL THEN
      RAISE EXCEPTION 'owner_vehicle_required: a DCO bid must specify the vehicle that will operate this trip';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.owner_vehicles ov
      WHERE ov.id = p_owner_vehicle_id
        AND ov.owner_user_id = v_uid
        AND ov.deleted_at IS NULL
        AND ov.status = 'active'
    ) THEN
      RAISE EXCEPTION 'owner_vehicle_id must be an active vehicle in the caller''s own fleet';
    END IF;
  ELSE
    v_bidder_type := 'organization';

    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = p_bidder_organization_id
        AND om.user_id = v_uid
        AND om.status = 'active'
    ) THEN
      RAISE EXCEPTION 'unauthorized: caller is not an active member of bidder organization';
    END IF;
  END IF;

  -- One carrier, one load, at a time. Closes the expired offer before the
  -- insert so the partial unique index has a single pending slot.
  PERFORM 1
  FROM public.market_bids
  WHERE indent_id = p_indent_id
    AND bidder_user_id = v_uid
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.market_bids
    WHERE indent_id = p_indent_id
      AND bidder_user_id = v_uid
      AND status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'bid_locked: an existing decided bid cannot be changed';
  END IF;

  -- Status only. Amount, created_at and expires_at stay on the historical row.
  UPDATE public.market_bids
  SET status = 'expired'
  WHERE indent_id = p_indent_id
    AND bidder_user_id = v_uid
    AND status = 'pending'
    AND expires_at <= pg_catalog.now();

  INSERT INTO public.market_bids (
    indent_id, bidder_type, bidder_user_id, bidder_organization_id, owner_vehicle_id, amount, note
  )
  VALUES (
    p_indent_id, v_bidder_type, v_uid, p_bidder_organization_id, p_owner_vehicle_id, p_amount,
    NULLIF(TRIM(COALESCE(p_note, '')), '')
  )
  ON CONFLICT (indent_id, bidder_user_id) WHERE status = 'pending' DO UPDATE SET
    amount = EXCLUDED.amount,
    note = EXCLUDED.note,
    owner_vehicle_id = EXCLUDED.owner_vehicle_id,
    updated_at = now()
  WHERE public.market_bids.status = 'pending'
    AND public.market_bids.expires_at > pg_catalog.now()
  RETURNING id INTO v_bid_id;

  IF v_bid_id IS NULL THEN
    RAISE EXCEPTION 'bid_locked: an existing decided bid cannot be changed';
  END IF;

  RETURN jsonb_build_object(
    'bid_id', v_bid_id, 'indent_id', p_indent_id, 'bidder_type', v_bidder_type, 'amount', p_amount
  );
END;
$function$;

COMMENT ON FUNCTION public.submit_market_bid(uuid, numeric, text, uuid, uuid) IS
  'Places or edits the caller''s one pending Marketplace bid. An expired pending bid is closed as expired and a new bid with its own 48-hour clock is inserted. An accepted bid cannot be replaced.';

-- The lane attach inserts with ON CONFLICT. That target has to match the
-- partial index, or the insert fails at runtime. A withdrawn bid is still
-- moved onto the new lane, but not while this carrier already has a pending
-- bid. Any historical row, including an expired one, still blocks a second
-- lane-placed bid.
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
    AND NOT EXISTS (
      SELECT 1 FROM public.market_bids live
      WHERE live.indent_id = p_indent_id
        AND live.bidder_user_id = v_commit.created_by
        AND live.status = 'pending'
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
  ON CONFLICT (indent_id, bidder_user_id) WHERE status = 'pending' DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._attach_market_lane_commit(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._attach_market_lane_commit(uuid, uuid) IS
  'Places one pending Marketplace bid for a live lane commitment. A bid withdrawn because the load left that lane is moved onto the matching commitment unless a pending bid already exists. An expired, rejected or same-lane withdrawn bid is not placed again. Nothing is awarded.';
