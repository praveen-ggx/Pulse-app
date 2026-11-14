-- Marketplace lane rate, opt-in (owner decision 2026-11-14).
--
-- 20271114173800 / 20271114174600 copied every carrier's latest pending bid
-- onto each new Marketplace load on the lane, without the carrier opting in.
-- This replaces that with an explicit commitment, the Marketplace twin of
-- network_pool_bid_commits:
--
--   * The carrier opts in after a pooled bid: amount, vehicle limit, valid until.
--   * commit_marketplace_lane_rate places the rate on every open Marketplace
--     load on the lane that it has no offer on yet (past loads), and
--     apply_standing_lane_bids keeps adding it to loads shared later (future).
--   * Only live commitments apply: status active, awards below the limit,
--     before valid_until. An award consumes one vehicle.
--   * Never touches an offer the carrier already has on a load (any status),
--     so a rejected or withdrawn bid is not re-placed.
--
-- Lane identity is standing_lane_key (executable by authenticated). The
-- revoked _pool_key is not called: an indent write evaluates the trigger and
-- index expressions, and a revoked helper there rolls the insert back.
--
-- Depends on 20271114173800 / 20271114174600 (standing_lane_key,
-- indent_is_open_marketplace_lane, indent_is_sponsored_reach_row, trigger).
-- Not applied. Path: V1 -> preprod -> prod release set.

SET LOCAL lock_timeout = '5s';

-- ── 1. Commitments ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.market_lane_bid_commits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bidder_organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  lane_key text NOT NULL,
  pickup_area text NOT NULL,
  drop_location text NOT NULL,
  vehicle_type text NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  vehicle_limit integer NOT NULL CHECK (vehicle_limit >= 1 AND vehicle_limit <= 200),
  valid_until timestamptz NOT NULL,
  awarded_count integer NOT NULL DEFAULT 0 CHECK (awarded_count >= 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'exhausted', 'expired', 'superseded', 'withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_lane_bid_commits_awarded_lte_limit CHECK (awarded_count <= vehicle_limit)
);

COMMENT ON TABLE public.market_lane_bid_commits IS
  'Carrier opt-in: keep a Marketplace rate on every open and future load on one lane (pickup, drop, vehicle) for vehicle_limit awards or until valid_until.';

CREATE UNIQUE INDEX IF NOT EXISTS market_lane_bid_commits_one_active
  ON public.market_lane_bid_commits (bidder_organization_id, lane_key)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS market_lane_bid_commits_active_lane_idx
  ON public.market_lane_bid_commits (lane_key)
  WHERE status = 'active';

ALTER TABLE public.market_lane_bid_commits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_lane_bid_commits_select ON public.market_lane_bid_commits;
CREATE POLICY market_lane_bid_commits_select
  ON public.market_lane_bid_commits
  FOR SELECT
  TO authenticated
  USING (public.is_org_staff(bidder_organization_id));

REVOKE ALL ON TABLE public.market_lane_bid_commits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.market_lane_bid_commits TO authenticated;

ALTER TABLE public.market_bids
  ADD COLUMN IF NOT EXISTS lane_commit_id uuid
    REFERENCES public.market_lane_bid_commits (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.market_bids.lane_commit_id IS
  'Marketplace lane rate this bid came from. Null = a bid the carrier placed on this load only.';

CREATE INDEX IF NOT EXISTS market_bids_lane_commit_id_idx
  ON public.market_bids (lane_commit_id)
  WHERE lane_commit_id IS NOT NULL;

-- Key-only lane lookup for the past-load sweep (the org-prefixed lane index
-- cannot serve it).
CREATE INDEX IF NOT EXISTS indents_standing_lane_key_live_idx
  ON public.indents (public.standing_lane_key(pickup_area, drop_location, vehicle_type))
  WHERE deleted_at IS NULL;

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
    AND coalesce(p_awarded_count, 0) < coalesce(p_vehicle_limit, 0)
    AND p_valid_until IS NOT NULL
    AND p_valid_until > pg_catalog.now();
$$;

REVOKE ALL ON FUNCTION public.market_lane_commit_is_live(text, integer, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.market_lane_commit_is_live(text, integer, integer, timestamptz) TO authenticated, service_role;

-- ── 2. Place one commitment on one load ─────────────────────────────────────

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

  -- The member who opted in must still be in the carrier org.
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_commit.bidder_organization_id
      AND om.user_id = v_commit.created_by
      AND om.status = 'active'
  ) THEN
    RETURN false;
  END IF;

  -- Any offer the carrier has or had on this load wins: never re-place a
  -- rejected or withdrawn bid, never overwrite a quote.
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

-- ── 3. Future loads: the existing trigger now applies opt-in rates only ─────

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
  'Places each live opt-in Marketplace lane rate (market_lane_bid_commits) on this load. Skips the owner, sponsored loads, and carriers that have or had an offer on it.';

CREATE OR REPLACE FUNCTION public.trg_apply_standing_lane_bids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF pg_catalog.lower(pg_catalog.btrim(coalesce(NEW.circulation_target, ''))) NOT IN ('marketplace', 'both') THEN
    RETURN NEW;
  END IF;
  IF public.standing_lane_key(NEW.pickup_area, NEW.drop_location, NEW.vehicle_type) IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT public.indent_is_open_marketplace_lane(NEW.status::text) THEN
    RETURN NEW;
  END IF;

  -- An indent write must never fail because a lane rate could not attach.
  BEGIN
    PERFORM public.apply_standing_lane_bids(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'marketplace lane rate attach skipped for indent %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_apply_standing_lane_bids() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS indents_apply_standing_lane_bids ON public.indents;
CREATE TRIGGER indents_apply_standing_lane_bids
  AFTER INSERT OR UPDATE OF circulation_target, pickup_area, drop_location, vehicle_type, status
  ON public.indents
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_apply_standing_lane_bids();

-- ── 4. Awards consume a vehicle ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_market_lane_commit_on_bid_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_commit public.market_lane_bid_commits%ROWTYPE;
  v_next integer;
BEGIN
  IF NEW.lane_commit_id IS NULL
     OR OLD.status = 'accepted'
     OR NEW.status IS DISTINCT FROM 'accepted' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_commit
  FROM public.market_lane_bid_commits c
  WHERE c.id = NEW.lane_commit_id
  FOR UPDATE;

  -- A lane rate that ended (withdrawn, expired, exhausted) leaves this bid as
  -- an ordinary bid: the shipper may still award it, nothing is counted.
  IF NOT FOUND OR NOT public.market_lane_commit_is_live(
    v_commit.status, v_commit.awarded_count, v_commit.vehicle_limit, v_commit.valid_until
  ) THEN
    NEW.lane_commit_id := NULL;
    RETURN NEW;
  END IF;

  v_next := v_commit.awarded_count + 1;
  UPDATE public.market_lane_bid_commits
  SET awarded_count = v_next,
      status = CASE WHEN v_next >= v_commit.vehicle_limit THEN 'exhausted' ELSE 'active' END,
      updated_at = pg_catalog.now()
  WHERE id = v_commit.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_market_lane_commit_on_bid_accept() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_market_lane_commit_on_bid_accept ON public.market_bids;
CREATE TRIGGER trg_market_lane_commit_on_bid_accept
  BEFORE UPDATE OF status ON public.market_bids
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_market_lane_commit_on_bid_accept();

-- ── 5. Carrier RPCs ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.commit_marketplace_lane_rate(
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
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_key text := public.standing_lane_key(p_pickup, p_drop, p_vehicle_type);
  v_old uuid[];
  v_commit_id uuid;
  v_indent_id uuid;
  v_linked integer := 0;
  v_attached integer := 0;
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
  IF p_valid_until IS NULL OR p_valid_until <= pg_catalog.now() THEN
    RAISE EXCEPTION 'invalid_valid_until';
  END IF;
  IF p_valid_until > pg_catalog.now() + interval '90 days' THEN
    RAISE EXCEPTION 'invalid_valid_until: furthest date is 90 days';
  END IF;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'no_lane: pickup, drop and vehicle type are required';
  END IF;
  IF NOT public.is_org_staff(p_org_id) THEN
    RAISE EXCEPTION 'unauthorized: caller is not an active member of bidder organization';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.concat('market_lane:', p_org_id, ':', v_key), 0)
  );

  WITH ended AS (
    UPDATE public.market_lane_bid_commits c
    SET status = 'superseded', updated_at = pg_catalog.now()
    WHERE c.bidder_organization_id = p_org_id
      AND c.lane_key = v_key
      AND c.status = 'active'
    RETURNING c.id
  )
  SELECT pg_catalog.array_agg(id) INTO v_old FROM ended;

  INSERT INTO public.market_lane_bid_commits (
    bidder_organization_id, created_by, lane_key, pickup_area, drop_location, vehicle_type,
    amount, vehicle_limit, valid_until
  ) VALUES (
    p_org_id, v_uid, v_key, pg_catalog.btrim(p_pickup), pg_catalog.btrim(p_drop),
    pg_catalog.btrim(p_vehicle_type), p_amount, p_vehicle_limit, p_valid_until
  )
  RETURNING id INTO v_commit_id;

  -- Pending bids from the previous lane rate move to the new rate.
  IF v_old IS NOT NULL THEN
    UPDATE public.market_bids mb
    SET lane_commit_id = v_commit_id, amount = p_amount, updated_at = pg_catalog.now()
    WHERE mb.lane_commit_id = ANY (v_old)
      AND mb.status = 'pending';
  END IF;

  -- Past loads: the pooled bid just placed at this rate counts toward it.
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

  -- Past loads with no offer from this carrier yet.
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
    'vehicle_limit', p_vehicle_limit,
    'valid_until', p_valid_until
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_marketplace_lane_rate(uuid, text, text, text, numeric, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_marketplace_lane_rate(uuid, text, text, text, numeric, integer, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.commit_marketplace_lane_rate(uuid, text, text, text, numeric, integer, timestamptz) IS
  'Carrier opt-in: keep this Marketplace rate on every open and future load on the lane. Supersedes the org''s previous rate on the lane and moves its pending lane bids to the new rate.';

CREATE OR REPLACE FUNCTION public.withdraw_marketplace_lane_rate(p_commit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT c.bidder_organization_id INTO v_org
  FROM public.market_lane_bid_commits c
  WHERE c.id = p_commit_id
  FOR UPDATE;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not_found: lane rate %', p_commit_id;
  END IF;
  IF NOT public.is_org_staff(v_org) THEN
    RAISE EXCEPTION 'unauthorized: caller is not an active member of bidder organization';
  END IF;

  -- Bids already placed stay as ordinary bids; the carrier withdraws them per load.
  UPDATE public.market_lane_bid_commits
  SET status = 'withdrawn', updated_at = pg_catalog.now()
  WHERE id = p_commit_id AND status = 'active';

  RETURN jsonb_build_object('commit_id', p_commit_id, 'status', 'withdrawn');
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_marketplace_lane_rate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_marketplace_lane_rate(uuid) TO authenticated;

-- ── 6. Shipper preview: only rates that will actually apply ─────────────────

CREATE OR REPLACE FUNCTION public.preview_standing_lane_bids(
  p_pickup text,
  p_drop text,
  p_vehicle_type text,
  p_indent_id uuid DEFAULT NULL
)
RETURNS TABLE (
  bidder_organization_id uuid,
  bidder_organization_name text,
  amount numeric,
  updated_at timestamptz,
  already_on_indent boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_key text := public.standing_lane_key(p_pickup, p_drop, p_vehicle_type);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = v_uid
      AND om.status = 'active'
      AND om.role <> 'driver'
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF v_key IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.bidder_organization_id,
    coalesce(nullif(pg_catalog.btrim(o.name), ''), 'Carrier')::text,
    c.amount::numeric,
    c.updated_at,
    EXISTS (
      SELECT 1 FROM public.market_bids mine
      WHERE p_indent_id IS NOT NULL
        AND mine.indent_id = p_indent_id
        AND mine.bidder_organization_id = c.bidder_organization_id
    )
  FROM public.market_lane_bid_commits c
  LEFT JOIN public.organizations o ON o.id = c.bidder_organization_id
  WHERE c.lane_key = v_key
    AND c.status = 'active'
    AND public.market_lane_commit_is_live(c.status, c.awarded_count, c.vehicle_limit, c.valid_until)
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_members mine
      WHERE mine.organization_id = c.bidder_organization_id
        AND mine.user_id = v_uid
        AND mine.status = 'active'
    )
  ORDER BY c.amount ASC, 2 ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.preview_standing_lane_bids(text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_standing_lane_bids(text, text, text, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.preview_standing_lane_bids(text, text, text, uuid) IS
  'Live opt-in Marketplace lane rates a shipper''s load on this lane will receive. already_on_indent marks rates already placed on p_indent_id. Hides the caller''s own organizations.';
