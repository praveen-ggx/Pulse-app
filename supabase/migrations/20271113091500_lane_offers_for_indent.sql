-- Lane offers: a shipper sees every offer that is relevant to an indent's lane,
-- not only the offers placed on that exact indent.
--
-- 1. _org_network_link_exists: the shipper -> carrier link used by
--    market_indents_for_org (via_link effective_links), callable without being
--    staff of the carrier org.
-- 2. Live Network pool commitments attach to new and re-opened Network indents
--    on their lane as pending direct_quotes (pool_commit_id set), at the
--    committed rate, while the commitment has vehicles left and is inside
--    valid_until. The carrier consented to the lane when it committed.
-- 3. list_lane_offers_for_indent: keyset page of pending offers on the owner's
--    other open indents with the same pool key, plus live commitments that are
--    not on this indent yet. Owner org staff only; only the owner's own data.
-- 4. lane_bid_invites ("Invite at Rs X"): the carrier accepts or declines. The
--    accept path writes through submit_market_bid / submit_network_quote as the
--    carrier, so no bid exists and nothing is awarded without the carrier.
--    Marketplace invites follow the 20261111105431 masking: the bidder sees the
--    lane and rate, never the shipper or the indent number, in the
--    notification, in list_my_lane_bid_invites, or by reading the table.
--    Accept never overwrites an offer the carrier already has (direct quote,
--    Marketplace bid, attached lane rate): the invite becomes 'superseded'.

SET LOCAL lock_timeout = '5s';

-- ── 1. Network link and quotability ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._org_network_link_exists(p_shipper_org uuid, p_bidder_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_shipper_org IS NOT NULL
    AND p_bidder_org IS NOT NULL
    AND p_shipper_org <> p_bidder_org
    AND (
      EXISTS (
        SELECT 1 FROM public.organization_relations r
        WHERE r.from_organization_id = p_shipper_org
          AND r.to_organization_id = p_bidder_org
          AND r.relation_type = 'client_supplier'
          AND r.status = 'active'
      )
      OR EXISTS (
        SELECT 1 FROM public.organization_relations r
        WHERE r.from_organization_id = p_bidder_org
          AND r.to_organization_id = p_shipper_org
          AND r.relation_type = 'supplier_client'
          AND r.status = 'active'
      )
      OR EXISTS (
        SELECT 1 FROM public.suppliers s
        WHERE s.organization_id = p_shipper_org
          AND s.linked_organization_id = p_bidder_org
      )
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.organization_id = p_bidder_org
          AND c.status = 'active'
          AND c.linked_organization_id = p_shipper_org
      )
    );
$$;

REVOKE ALL ON FUNCTION public._org_network_link_exists(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._org_network_link_exists(uuid, uuid) IS
  'Internal. Shipper org -> carrier org Network link, same sources as market_indents_for_org effective_links.';

-- Network-circulated, open, not deleted: the via_link indent predicate of
-- market_indents_for_org plus indent_open_for_marketplace_bids.
CREATE OR REPLACE FUNCTION public._indent_network_open(p_indent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.indents i
    WHERE i.id = p_indent_id
      AND i.deleted_at IS NULL
      AND (i.circulation_target IS NULL OR i.circulation_target IN ('integrated_supplier', 'both'))
      AND i.status <> 'draft'
      AND lower(i.status) NOT IN ('awarded', 'completed', 'cancelled', 'canceled')
  ) AND public.indent_open_for_marketplace_bids(p_indent_id);
$$;

REVOKE ALL ON FUNCTION public._indent_network_open(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._indent_marketplace_open(p_indent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.indents i
    WHERE i.id = p_indent_id
      AND lower(btrim(coalesce(i.circulation_target, ''))) IN ('marketplace', 'both')
  ) AND public.indent_open_for_marketplace_bids(p_indent_id);
$$;

REVOKE ALL ON FUNCTION public._indent_marketplace_open(uuid) FROM PUBLIC, anon, authenticated;

-- An offer the carrier still stands behind on the load: a pending or accepted
-- direct quote (own or an attached lane rate) or Marketplace bid.
CREATE OR REPLACE FUNCTION public._lane_bidder_has_active_offer(
  p_indent_id uuid,
  p_bidder_type text,
  p_bidder_org uuid,
  p_bidder_user uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN p_bidder_type = 'dco' THEN EXISTS (
      SELECT 1 FROM public.market_bids mb
      WHERE mb.indent_id = p_indent_id
        AND mb.bidder_user_id = p_bidder_user
        AND mb.status IN ('pending', 'accepted')
    )
    ELSE EXISTS (
      SELECT 1 FROM public.direct_quotes dq
      WHERE dq.indent_id = p_indent_id
        AND dq.bidder_organization_id = p_bidder_org
        AND dq.status IN ('pending', 'accepted')
    ) OR EXISTS (
      SELECT 1 FROM public.market_bids mb
      WHERE mb.indent_id = p_indent_id
        AND mb.bidder_organization_id = p_bidder_org
        AND mb.status IN ('pending', 'accepted')
    )
  END;
$$;

REVOKE ALL ON FUNCTION public._lane_bidder_has_active_offer(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS network_pool_bid_commits_active_pool_key_idx
  ON public.network_pool_bid_commits (pool_key)
  WHERE status = 'active';

-- Sibling lookup: one org's live indents on one lane.
CREATE INDEX IF NOT EXISTS indents_org_pool_key_live_idx
  ON public.indents (organization_id, public._pool_key(pickup_area, drop_location, vehicle_type))
  WHERE deleted_at IS NULL;

-- ── 3. Attach live lane commitments ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._attach_lane_commitments(p_indent_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_org uuid;
  v_key text;
  v_commit record;
  v_id uuid;
  v_count integer := 0;
BEGIN
  SELECT i.organization_id, public._pool_key(i.pickup_area, i.drop_location, i.vehicle_type)
    INTO v_org, v_key
  FROM public.indents i
  WHERE i.id = p_indent_id;

  IF v_org IS NULL OR v_key IS NULL OR NOT public._indent_network_open(p_indent_id) THEN
    RETURN 0;
  END IF;

  FOR v_commit IN
    SELECT c.id, c.bidder_organization_id, c.amount
    FROM public.network_pool_bid_commits c
    WHERE c.pool_key = v_key
      AND c.status = 'active'
      AND public.network_pool_commit_is_live(c.status, c.awarded_count, c.vehicle_limit, c.valid_until)
      AND c.bidder_organization_id <> v_org
      AND NOT EXISTS (
        SELECT 1 FROM public.direct_quotes dq
        WHERE dq.indent_id = p_indent_id
          AND dq.bidder_organization_id = c.bidder_organization_id
      )
    ORDER BY c.amount, c.id
  LOOP
    IF NOT public._org_network_link_exists(v_org, v_commit.bidder_organization_id) THEN
      CONTINUE;
    END IF;

    v_id := NULL;
    INSERT INTO public.direct_quotes (indent_id, bidder_organization_id, amount, notes, status, pool_commit_id)
    VALUES (p_indent_id, v_commit.bidder_organization_id, v_commit.amount, NULL, 'pending', v_commit.id)
    ON CONFLICT (indent_id, bidder_organization_id) DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public._attach_lane_commitments(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._attach_lane_commitments(uuid) IS
  'Internal. Adds a pending pool quote (pool_commit_id set) for each live lane commitment whose carrier is Network-linked to the indent owner and has no quote on the indent yet.';

CREATE OR REPLACE FUNCTION public.tg_indent_attach_lane_commitments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- The attach itself updates this indent to quoted; do not re-enter.
  IF pg_catalog.pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.circulation_target IS NOT DISTINCT FROM OLD.circulation_target
     AND NEW.pickup_area IS NOT DISTINCT FROM OLD.pickup_area
     AND NEW.drop_location IS NOT DISTINCT FROM OLD.drop_location
     AND NEW.vehicle_type IS NOT DISTINCT FROM OLD.vehicle_type
     AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN
    RETURN NULL;
  END IF;

  IF NEW.deleted_at IS NOT NULL OR lower(coalesce(NEW.status, '')) = 'draft' THEN
    RETURN NULL;
  END IF;

  -- An indent write must never fail because a lane commitment could not attach.
  BEGIN
    PERFORM public._attach_lane_commitments(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lane commitment attach skipped for indent %: %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_indent_attach_lane_commitments() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_indents_attach_lane_commitments ON public.indents;
CREATE TRIGGER trg_indents_attach_lane_commitments
  AFTER INSERT OR UPDATE OF status, circulation_target, pickup_area, drop_location, vehicle_type, deleted_at
  ON public.indents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_indent_attach_lane_commitments();

-- On demand, for indents that existed before the trigger or were shared while
-- a commitment was being created.
CREATE OR REPLACE FUNCTION public.attach_lane_commitments_for_indent(p_indent_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_org uuid;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT i.organization_id INTO v_org FROM public.indents i WHERE i.id = p_indent_id;
  IF v_org IS NULL OR NOT public.is_org_staff(v_org) THEN
    RAISE EXCEPTION 'unauthorized: caller is not staff of the organization that owns this indent';
  END IF;

  v_count := public._attach_lane_commitments(p_indent_id);
  RETURN jsonb_build_object('indent_id', p_indent_id, 'attached', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.attach_lane_commitments_for_indent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_lane_commitments_for_indent(uuid) TO authenticated;

-- ── 4. Invites ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lane_bid_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indent_id uuid NOT NULL REFERENCES public.indents (id) ON DELETE CASCADE,
  shipper_organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('marketplace', 'network')),
  source_kind text NOT NULL CHECK (source_kind IN ('market_bid', 'network_quote')),
  source_id uuid NOT NULL,
  source_indent_id uuid REFERENCES public.indents (id) ON DELETE SET NULL,
  bidder_type text NOT NULL CHECK (bidder_type IN ('dco', 'organization')),
  bidder_organization_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  bidder_user_id uuid,
  owner_vehicle_id uuid,
  amount numeric NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'superseded')),
  invited_by uuid NOT NULL,
  responded_by uuid,
  responded_at timestamptz,
  result_market_bid_id uuid,
  result_direct_quote_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lane_bid_invites_bidder_shape CHECK (
    (bidder_type = 'dco' AND bidder_user_id IS NOT NULL AND bidder_organization_id IS NULL)
    OR (bidder_type = 'organization' AND bidder_organization_id IS NOT NULL)
  ),
  CONSTRAINT lane_bid_invites_channel_shape CHECK (
    (channel = 'marketplace' AND source_kind = 'market_bid')
    OR (channel = 'network' AND source_kind = 'network_quote' AND bidder_type = 'organization')
  )
);

COMMENT ON TABLE public.lane_bid_invites IS
  'Shipper asks a carrier who bid on another indent of the same lane to bid this indent at the same rate. The carrier accepts (a normal bid is written as the carrier) or declines.';

CREATE UNIQUE INDEX IF NOT EXISTS lane_bid_invites_one_pending
  ON public.lane_bid_invites (indent_id, channel, coalesce(bidder_organization_id, bidder_user_id))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS lane_bid_invites_indent_idx
  ON public.lane_bid_invites (indent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS lane_bid_invites_bidder_org_pending_idx
  ON public.lane_bid_invites (bidder_organization_id, created_at DESC, id DESC)
  WHERE status = 'pending' AND bidder_organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS lane_bid_invites_bidder_user_pending_idx
  ON public.lane_bid_invites (bidder_user_id, created_at DESC, id DESC)
  WHERE status = 'pending' AND bidder_type = 'dco';

ALTER TABLE public.lane_bid_invites ENABLE ROW LEVEL SECURITY;

-- Marketplace bidders do not read rows directly: a row carries the shipper org,
-- the inviting user and the indent ids, and Marketplace hides the load owner
-- until allocation (20261111105431). They use list_my_lane_bid_invites, which
-- masks those fields. Network bidders already see the shipper.
DROP POLICY IF EXISTS lane_bid_invites_select ON public.lane_bid_invites;
CREATE POLICY lane_bid_invites_select
  ON public.lane_bid_invites
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_staff(shipper_organization_id)
    OR (
      channel = 'network'
      AND bidder_organization_id IS NOT NULL
      AND public.is_org_staff(bidder_organization_id)
    )
  );

REVOKE ALL ON TABLE public.lane_bid_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lane_bid_invites TO authenticated;

-- ── 5. Lane offers for one indent (keyset) ──────────────────────────────────
-- Order: amount ascending, then offer_key (kind:source_id). Cursor is the last
-- row's (amount, offer_key). total_count and the per-channel counts cover the
-- whole eligible set, not the page.

CREATE OR REPLACE FUNCTION public.list_lane_offers_for_indent(
  p_indent_id uuid,
  p_limit integer DEFAULT 50,
  p_after_amount numeric DEFAULT NULL,
  p_after_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_org uuid;
  v_key text;
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_network_open boolean;
  v_market_open boolean;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT i.organization_id, public._pool_key(i.pickup_area, i.drop_location, i.vehicle_type)
    INTO v_org, v_key
  FROM public.indents i
  WHERE i.id = p_indent_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not_found: indent %', p_indent_id;
  END IF;

  IF NOT public.is_org_staff(v_org) THEN
    RAISE EXCEPTION 'unauthorized: caller is not staff of the organization that owns this indent';
  END IF;

  IF (p_after_amount IS NULL) <> (p_after_key IS NULL) THEN
    RAISE EXCEPTION 'invalid_cursor: p_after_amount and p_after_key go together';
  END IF;

  v_network_open := public._indent_network_open(p_indent_id);
  v_market_open := public._indent_marketplace_open(p_indent_id);

  WITH siblings AS (
    SELECT s.id, s.indent_number
    FROM public.indents s
    WHERE s.organization_id = v_org
      AND s.deleted_at IS NULL
      AND public._pool_key(s.pickup_area, s.drop_location, s.vehicle_type) = v_key
      AND s.id <> p_indent_id
      AND public.indent_open_for_marketplace_bids(s.id)
  ),
  raw AS (
    SELECT
      'market_bid'::text AS kind,
      b.id AS source_id,
      b.indent_id AS source_indent_id,
      s.indent_number AS source_indent_number,
      b.bidder_type,
      b.bidder_organization_id,
      CASE WHEN b.bidder_type = 'dco' THEN b.bidder_user_id END AS bidder_user_id,
      b.amount,
      b.created_at,
      'marketplace'::text AS channel,
      NULL::integer AS vehicles_left,
      NULL::timestamptz AS valid_until
    FROM public.market_bids b
    JOIN siblings s ON s.id = b.indent_id
    WHERE b.status = 'pending'
    UNION ALL
    SELECT
      'network_quote', q.id, q.indent_id, s.indent_number,
      'organization', q.bidder_organization_id, NULL::uuid,
      q.amount, q.created_at, 'network', NULL::integer, NULL::timestamptz
    FROM public.direct_quotes q
    JOIN siblings s ON s.id = q.indent_id
    WHERE q.status = 'pending'
      AND q.pool_commit_id IS NULL
      AND q.bidder_organization_id <> v_org
    UNION ALL
    SELECT
      'pool_commitment', c.id, NULL::uuid, NULL::text,
      'organization', c.bidder_organization_id, NULL::uuid,
      c.amount, c.created_at, 'network', c.vehicle_limit - c.awarded_count, c.valid_until
    FROM public.network_pool_bid_commits c
    WHERE v_key IS NOT NULL
      AND c.pool_key = v_key
      AND c.status = 'active'
      AND public.network_pool_commit_is_live(c.status, c.awarded_count, c.vehicle_limit, c.valid_until)
      AND public._org_network_link_exists(v_org, c.bidder_organization_id)
  ),
  not_on_target AS (
    SELECT r.*
    FROM raw r
    WHERE NOT (
      (r.bidder_organization_id IS NOT NULL AND (
        EXISTS (
          SELECT 1 FROM public.direct_quotes dq
          WHERE dq.indent_id = p_indent_id AND dq.bidder_organization_id = r.bidder_organization_id
        )
        OR EXISTS (
          SELECT 1 FROM public.market_bids mb
          WHERE mb.indent_id = p_indent_id AND mb.bidder_organization_id = r.bidder_organization_id
        )
      ))
      OR (r.bidder_type = 'dco' AND EXISTS (
        SELECT 1 FROM public.market_bids mb
        WHERE mb.indent_id = p_indent_id AND mb.bidder_user_id = r.bidder_user_id
      ))
    )
  ),
  best AS (
    -- One row per carrier and channel: its lowest live offer on the lane.
    SELECT DISTINCT ON (n.channel, coalesce(n.bidder_organization_id, n.bidder_user_id))
      n.*,
      (n.kind || ':' || n.source_id::text) COLLATE "C" AS offer_key
    FROM not_on_target n
    ORDER BY n.channel, coalesce(n.bidder_organization_id, n.bidder_user_id),
      n.amount, (n.kind = 'pool_commitment') DESC, n.created_at DESC, n.source_id
  ),
  decorated AS (
    SELECT
      b.*,
      CASE
        WHEN b.bidder_type = 'organization' THEN coalesce(o.name::text, 'Carrier')
        ELSE coalesce(nullif(btrim(pr.full_name), ''), 'Driver')
      END AS bidder_name,
      inv.id AS invite_id,
      inv.status AS invite_status,
      CASE
        WHEN b.channel = 'marketplace' AND NOT v_market_open THEN 'needs_marketplace'
        WHEN b.channel = 'network' AND NOT v_network_open THEN 'needs_network'
        WHEN b.kind = 'network_quote'
          AND NOT public._org_network_link_exists(v_org, b.bidder_organization_id) THEN 'not_in_network'
        ELSE NULL
      END AS invite_blocker
    FROM best b
    LEFT JOIN public.organizations o ON o.id = b.bidder_organization_id
    LEFT JOIN public.profiles pr ON pr.id = b.bidder_user_id
    LEFT JOIN LATERAL (
      SELECT li.id, li.status
      FROM public.lane_bid_invites li
      WHERE li.indent_id = p_indent_id
        AND li.channel = b.channel
        AND coalesce(li.bidder_organization_id, li.bidder_user_id)
          = coalesce(b.bidder_organization_id, b.bidder_user_id)
      ORDER BY li.created_at DESC, li.id DESC
      LIMIT 1
    ) inv ON true
  ),
  page AS (
    SELECT d.*
    FROM decorated d
    WHERE p_after_amount IS NULL
       OR (d.amount, d.offer_key) > (p_after_amount, p_after_key COLLATE "C")
    ORDER BY d.amount, d.offer_key
    LIMIT v_limit + 1
  ),
  page_numbered AS (
    SELECT p.*, row_number() OVER (ORDER BY p.amount, p.offer_key) AS rn
    FROM page p
  )
  SELECT jsonb_build_object(
    'indent_id', p_indent_id,
    'pool_key', v_key,
    'network_open', v_network_open,
    'marketplace_open', v_market_open,
    'total_count', (SELECT count(*) FROM decorated),
    'network_count', (SELECT count(*) FROM decorated WHERE channel = 'network'),
    'marketplace_count', (SELECT count(*) FROM decorated WHERE channel = 'marketplace'),
    'min_network_amount', (SELECT min(amount) FROM decorated WHERE channel = 'network'),
    'min_marketplace_amount', (SELECT min(amount) FROM decorated WHERE channel = 'marketplace'),
    'has_more', (SELECT count(*) FROM page_numbered) > v_limit,
    'next_cursor', (
      SELECT CASE WHEN (SELECT count(*) FROM page_numbered) > v_limit
        THEN jsonb_build_object('amount', pn.amount, 'key', pn.offer_key) END
      FROM page_numbered pn WHERE pn.rn = v_limit
    ),
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'offer_key', pn.offer_key,
        'kind', pn.kind,
        'source_id', pn.source_id,
        'source_indent_id', pn.source_indent_id,
        'source_indent_number', pn.source_indent_number,
        'channel', pn.channel,
        'bidder_type', pn.bidder_type,
        'bidder_organization_id', pn.bidder_organization_id,
        'bidder_name', pn.bidder_name,
        'amount', pn.amount,
        'created_at', pn.created_at,
        'vehicles_left', pn.vehicles_left,
        'valid_until', pn.valid_until,
        'invite_id', pn.invite_id,
        'invite_status', pn.invite_status,
        'invite_blocker', pn.invite_blocker
      ) ORDER BY pn.amount, pn.offer_key)
      FROM page_numbered pn
      WHERE pn.rn <= v_limit
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_lane_offers_for_indent(uuid, integer, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_lane_offers_for_indent(uuid, integer, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.list_lane_offers_for_indent(uuid, integer, numeric, text) IS
  'Owner Review Hub: pending offers on the owner''s other open indents with the same pool key, and live Network lane commitments, one row per carrier and channel, excluding carriers already on this indent. Keyset (amount, offer_key).';

-- ── 6. Invite, respond, list ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.invite_lane_bidder(
  p_indent_id uuid,
  p_kind text,
  p_source_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_key text;
  v_code text;
  v_route text;
  v_channel text;
  v_source_indent uuid;
  v_bidder_type text;
  v_bidder_org uuid;
  v_bidder_user uuid;
  v_vehicle uuid;
  v_amount numeric;
  v_commit public.network_pool_bid_commits%ROWTYPE;
  v_quote_id uuid;
  v_invite public.lane_bid_invites%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT i.organization_id,
         public._pool_key(i.pickup_area, i.drop_location, i.vehicle_type),
         coalesce(to_jsonb(i) ->> 'indent_operational_code', i.indent_number, 'Indent'),
         nullif(concat_ws(' → ', nullif(btrim(coalesce(i.pickup_area, '')), ''),
                                 nullif(btrim(coalesce(i.drop_location, '')), '')), '')
    INTO v_org, v_key, v_code, v_route
  FROM public.indents i
  WHERE i.id = p_indent_id
  FOR SHARE;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not_found: indent %', p_indent_id;
  END IF;
  IF NOT public.is_org_staff(v_org) THEN
    RAISE EXCEPTION 'unauthorized: caller is not staff of the organization that owns this indent';
  END IF;
  IF NOT public.indent_open_for_marketplace_bids(p_indent_id) THEN
    RAISE EXCEPTION 'indent_not_open: this load is no longer open for offers';
  END IF;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'no_lane: this load has no pickup, drop and vehicle type to match';
  END IF;

  IF p_kind = 'pool_commitment' THEN
    SELECT * INTO v_commit
    FROM public.network_pool_bid_commits c
    WHERE c.id = p_source_id
      AND c.pool_key = v_key
      AND c.bidder_organization_id <> v_org;
    IF NOT FOUND
       OR NOT public.network_pool_commit_is_live(v_commit.status, v_commit.awarded_count, v_commit.vehicle_limit, v_commit.valid_until) THEN
      RAISE EXCEPTION 'source_not_found: this lane commitment is no longer live';
    END IF;
    IF NOT public._indent_network_open(p_indent_id) THEN
      RAISE EXCEPTION 'needs_network: share this load with your Network to receive this commitment';
    END IF;
    IF NOT public._org_network_link_exists(v_org, v_commit.bidder_organization_id) THEN
      RAISE EXCEPTION 'not_in_network: this carrier is not in your Network';
    END IF;

    -- The carrier committed this rate to the lane; no second consent needed.
    INSERT INTO public.direct_quotes (indent_id, bidder_organization_id, amount, notes, status, pool_commit_id)
    VALUES (p_indent_id, v_commit.bidder_organization_id, v_commit.amount, NULL, 'pending', v_commit.id)
    ON CONFLICT (indent_id, bidder_organization_id) DO NOTHING
    RETURNING id INTO v_quote_id;

    RETURN jsonb_build_object(
      'kind', 'pool_commitment',
      'attached', v_quote_id IS NOT NULL,
      'quote_id', v_quote_id,
      'amount', v_commit.amount
    );
  ELSIF p_kind = 'market_bid' THEN
    SELECT b.indent_id, b.bidder_type, b.bidder_organization_id,
           CASE WHEN b.bidder_type = 'dco' THEN b.bidder_user_id END,
           b.owner_vehicle_id, b.amount
      INTO v_source_indent, v_bidder_type, v_bidder_org, v_bidder_user, v_vehicle, v_amount
    FROM public.market_bids b
    JOIN public.indents s ON s.id = b.indent_id
    WHERE b.id = p_source_id
      AND b.status = 'pending'
      AND s.organization_id = v_org
      AND s.id <> p_indent_id
      AND s.deleted_at IS NULL
      AND public._pool_key(s.pickup_area, s.drop_location, s.vehicle_type) = v_key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'source_not_found: that bid is no longer pending on this lane';
    END IF;
    IF NOT public._indent_marketplace_open(p_indent_id) THEN
      RAISE EXCEPTION 'needs_marketplace: post this load to Marketplace to invite Marketplace bidders';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.market_bids mb
      WHERE mb.indent_id = p_indent_id
        AND ((v_bidder_org IS NOT NULL AND mb.bidder_organization_id = v_bidder_org)
          OR (v_bidder_org IS NULL AND mb.bidder_user_id = v_bidder_user))
    ) OR (v_bidder_org IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.direct_quotes dq
      WHERE dq.indent_id = p_indent_id AND dq.bidder_organization_id = v_bidder_org
    )) THEN
      RAISE EXCEPTION 'already_bid: this carrier already has an offer on this load';
    END IF;
    v_channel := 'marketplace';
  ELSIF p_kind = 'network_quote' THEN
    SELECT q.indent_id, q.bidder_organization_id, q.amount
      INTO v_source_indent, v_bidder_org, v_amount
    FROM public.direct_quotes q
    JOIN public.indents s ON s.id = q.indent_id
    WHERE q.id = p_source_id
      AND q.status = 'pending'
      AND q.pool_commit_id IS NULL
      AND s.organization_id = v_org
      AND s.id <> p_indent_id
      AND s.deleted_at IS NULL
      AND public._pool_key(s.pickup_area, s.drop_location, s.vehicle_type) = v_key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'source_not_found: that quote is no longer pending on this lane';
    END IF;
    IF NOT public._indent_network_open(p_indent_id) THEN
      RAISE EXCEPTION 'needs_network: share this load with your Network to invite Network carriers';
    END IF;
    IF NOT public._org_network_link_exists(v_org, v_bidder_org) THEN
      RAISE EXCEPTION 'not_in_network: this carrier is not in your Network';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.direct_quotes dq
      WHERE dq.indent_id = p_indent_id AND dq.bidder_organization_id = v_bidder_org
    ) OR EXISTS (
      SELECT 1 FROM public.market_bids mb
      WHERE mb.indent_id = p_indent_id AND mb.bidder_organization_id = v_bidder_org
    ) THEN
      RAISE EXCEPTION 'already_bid: this carrier already has an offer on this load';
    END IF;
    v_bidder_type := 'organization';
    v_channel := 'network';
  ELSE
    RAISE EXCEPTION 'invalid_kind: %', p_kind;
  END IF;

  SELECT * INTO v_invite
  FROM public.lane_bid_invites li
  WHERE li.indent_id = p_indent_id
    AND li.channel = v_channel
    AND li.status = 'pending'
    AND coalesce(li.bidder_organization_id, li.bidder_user_id) = coalesce(v_bidder_org, v_bidder_user);

  IF FOUND THEN
    RETURN jsonb_build_object('kind', p_kind, 'invite_id', v_invite.id, 'status', v_invite.status, 'created', false);
  END IF;

  INSERT INTO public.lane_bid_invites (
    indent_id, shipper_organization_id, channel, source_kind, source_id, source_indent_id,
    bidder_type, bidder_organization_id, bidder_user_id, owner_vehicle_id, amount, invited_by
  ) VALUES (
    p_indent_id, v_org, v_channel, p_kind, p_source_id, v_source_indent,
    v_bidder_type, v_bidder_org, v_bidder_user, v_vehicle, v_amount, v_uid
  )
  RETURNING * INTO v_invite;

  -- payload kind 'lane_bid_invite' routes the tap to My Bids -> Rate requests,
  -- not to the Network quote flow. A Marketplace invite names neither the
  -- shipper (actor org) nor the load (indent id, indent code): the lane is
  -- visible, the party is not, until allocation (20261111105431).
  IF v_bidder_org IS NOT NULL AND v_channel = 'network' THEN
    PERFORM public.emit_network_notification(
      v_bidder_org,
      v_org,
      'quote_requested',
      concat('Rate request on ', v_code),
      v_route,
      v_amount,
      p_indent_id, NULL, NULL,
      concat('lane_invite:', v_invite.id),
      jsonb_build_object(
        'kind', 'lane_bid_invite', 'lane_invite_id', v_invite.id, 'channel', 'network',
        'indent_code', v_code, 'route', v_route
      )
    );
  ELSIF v_bidder_org IS NOT NULL THEN
    PERFORM public.emit_network_notification(
      v_bidder_org,
      NULL,
      'quote_requested',
      'Marketplace rate request',
      v_route,
      v_amount,
      NULL, NULL, NULL,
      concat('lane_invite:', v_invite.id),
      jsonb_build_object(
        'kind', 'lane_bid_invite', 'lane_invite_id', v_invite.id, 'channel', 'marketplace',
        'route', v_route
      )
    );
  END IF;

  RETURN jsonb_build_object('kind', p_kind, 'invite_id', v_invite.id, 'status', v_invite.status, 'created', true);
END;
$$;

REVOKE ALL ON FUNCTION public.invite_lane_bidder(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_lane_bidder(uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.invite_lane_bidder(uuid, text, uuid) IS
  'Owner asks a carrier with a pending offer on another indent of the same lane to bid this indent at that rate. pool_commitment attaches the committed rate directly.';

CREATE OR REPLACE FUNCTION public.respond_lane_bid_invite(p_invite_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invite public.lane_bid_invites%ROWTYPE;
  v_result jsonb;
  v_offer_id uuid;
  v_conflict boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Serializes concurrent responses to the same invite.
  SELECT * INTO v_invite FROM public.lane_bid_invites li WHERE li.id = p_invite_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: invite %', p_invite_id;
  END IF;

  IF NOT (
    (v_invite.bidder_type = 'dco' AND v_invite.bidder_user_id = v_uid)
    OR (v_invite.bidder_organization_id IS NOT NULL AND public.is_org_staff(v_invite.bidder_organization_id))
  ) THEN
    RAISE EXCEPTION 'unauthorized: this invite is addressed to another carrier';
  END IF;

  -- A repeated accept (double tap, retry after a timeout) returns the first outcome.
  IF v_invite.status = 'accepted' AND coalesce(p_accept, false) THEN
    RETURN jsonb_build_object(
      'invite_id', v_invite.id, 'status', 'accepted', 'already_responded', true,
      'market_bid_id', v_invite.result_market_bid_id,
      'direct_quote_id', v_invite.result_direct_quote_id
    );
  END IF;
  IF v_invite.status = 'superseded' THEN
    RETURN jsonb_build_object(
      'invite_id', v_invite.id, 'status', 'superseded', 'reason', 'already_offered',
      'already_responded', true
    );
  END IF;
  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'invite_not_pending: this invite is already %', v_invite.status;
  END IF;

  IF NOT public.indent_open_for_marketplace_bids(v_invite.indent_id) THEN
    UPDATE public.lane_bid_invites
    SET status = 'expired', responded_by = v_uid, responded_at = now(), updated_at = now()
    WHERE id = v_invite.id;
    RETURN jsonb_build_object('invite_id', v_invite.id, 'status', 'expired');
  END IF;

  IF NOT coalesce(p_accept, false) THEN
    UPDATE public.lane_bid_invites
    SET status = 'declined', responded_by = v_uid, responded_at = now(), updated_at = now()
    WHERE id = v_invite.id;
    RETURN jsonb_build_object('invite_id', v_invite.id, 'status', 'declined');
  END IF;

  -- The invite never replaces an offer the carrier already has on this load: a
  -- quote or bid it placed itself, or a lane rate attached after the invite.
  -- submit_market_bid / submit_network_quote upsert a pending row, so accepting
  -- would silently overwrite its amount (and, for a lane rate, consume the
  -- commitment at the invite's price). One lock per (load, carrier) serializes
  -- different invites to the same carrier on the same load.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat('lane_offer:', v_invite.indent_id, ':',
           coalesce(v_invite.bidder_organization_id, v_invite.bidder_user_id)), 0));

  IF public._lane_bidder_has_active_offer(
       v_invite.indent_id, v_invite.bidder_type, v_invite.bidder_organization_id, v_invite.bidder_user_id
     ) THEN
    v_conflict := true;
  ELSE
    -- Same write path as a bid the carrier places itself, with its own checks.
    -- A concurrent offer committed between the check above and the upsert is
    -- detected below (the row predates this transaction, or a second active
    -- offer exists) and this block is rolled back, restoring that offer.
    BEGIN
      IF v_invite.channel = 'marketplace' THEN
        v_result := public.submit_market_bid(
          v_invite.indent_id, v_invite.amount, 'Accepted rate request',
          v_invite.bidder_organization_id, v_invite.owner_vehicle_id
        );
        v_offer_id := (v_result ->> 'bid_id')::uuid;
        IF NOT EXISTS (
          SELECT 1 FROM public.market_bids mb
          WHERE mb.id = v_offer_id AND mb.created_at = pg_catalog.now()
        ) OR (v_invite.bidder_organization_id IS NOT NULL AND (
          EXISTS (
            SELECT 1 FROM public.market_bids mb
            WHERE mb.indent_id = v_invite.indent_id
              AND mb.bidder_organization_id = v_invite.bidder_organization_id
              AND mb.status IN ('pending', 'accepted')
              AND mb.id <> v_offer_id
          ) OR EXISTS (
            SELECT 1 FROM public.direct_quotes dq
            WHERE dq.indent_id = v_invite.indent_id
              AND dq.bidder_organization_id = v_invite.bidder_organization_id
              AND dq.status IN ('pending', 'accepted')
          )
        )) THEN
          RAISE EXCEPTION 'lane_invite_conflict';
        END IF;
      ELSE
        v_result := public.submit_network_quote(
          v_invite.indent_id, v_invite.bidder_organization_id, v_invite.amount, 'Accepted rate request'
        );
        v_offer_id := (v_result ->> 'quote_id')::uuid;
        IF NOT EXISTS (
          SELECT 1 FROM public.direct_quotes dq
          WHERE dq.id = v_offer_id AND dq.created_at = pg_catalog.now() AND dq.pool_commit_id IS NULL
        ) OR EXISTS (
          SELECT 1 FROM public.market_bids mb
          WHERE mb.indent_id = v_invite.indent_id
            AND mb.bidder_organization_id = v_invite.bidder_organization_id
            AND mb.status IN ('pending', 'accepted')
        ) THEN
          RAISE EXCEPTION 'lane_invite_conflict';
        END IF;
      END IF;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'lane_invite_conflict' THEN
        RAISE;
      END IF;
      v_conflict := true;
    END;
  END IF;

  IF v_conflict THEN
    UPDATE public.lane_bid_invites
    SET status = 'superseded', responded_by = v_uid, responded_at = now(), updated_at = now()
    WHERE id = v_invite.id;
    RETURN jsonb_build_object(
      'invite_id', v_invite.id, 'status', 'superseded', 'reason', 'already_offered'
    );
  END IF;

  IF v_invite.channel = 'marketplace' THEN
    UPDATE public.lane_bid_invites
    SET status = 'accepted', responded_by = v_uid, responded_at = now(), updated_at = now(),
        result_market_bid_id = v_offer_id
    WHERE id = v_invite.id;
  ELSE
    UPDATE public.lane_bid_invites
    SET status = 'accepted', responded_by = v_uid, responded_at = now(), updated_at = now(),
        result_direct_quote_id = v_offer_id
    WHERE id = v_invite.id;
  END IF;

  RETURN jsonb_build_object('invite_id', v_invite.id, 'status', 'accepted', 'bid', v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.respond_lane_bid_invite(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_lane_bid_invite(uuid, boolean) TO authenticated;

-- Carrier inbox: pending invites on open indents addressed to the caller (DCO)
-- or to an org the caller is staff of. Keyset (created_at DESC, id DESC).
CREATE OR REPLACE FUNCTION public.list_my_lane_bid_invites(
  p_limit integer DEFAULT 50,
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF (p_after_created_at IS NULL) <> (p_after_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_cursor: p_after_created_at and p_after_id go together';
  END IF;

  WITH mine AS (
    SELECT li.*
    FROM public.lane_bid_invites li
    WHERE li.status = 'pending'
      AND (
        (li.bidder_type = 'dco' AND li.bidder_user_id = v_uid)
        OR (li.bidder_organization_id IS NOT NULL AND li.bidder_organization_id IN (
          SELECT om.organization_id FROM public.organization_members om
          WHERE om.user_id = v_uid
            AND om.status = 'active'
            AND om.role IN ('owner', 'admin', 'member', 'dispatcher', 'finance')
        ))
      )
      AND public.indent_open_for_marketplace_bids(li.indent_id)
  ),
  page AS (
    SELECT m.*, row_number() OVER (ORDER BY m.created_at DESC, m.id DESC) AS rn
    FROM (
      SELECT * FROM mine m
      WHERE p_after_created_at IS NULL
         OR (m.created_at, m.id) < (p_after_created_at, p_after_id)
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT v_limit + 1
    ) m
  )
  SELECT jsonb_build_object(
    'total_count', (SELECT count(*) FROM mine),
    'has_more', (SELECT count(*) FROM page) > v_limit,
    'next_cursor', (
      SELECT CASE WHEN (SELECT count(*) FROM page) > v_limit
        THEN jsonb_build_object('created_at', p.created_at, 'id', p.id) END
      FROM page p WHERE p.rn = v_limit
    ),
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'invite_id', p.id,
        'indent_id', p.indent_id,
        'indent_number', CASE WHEN p.channel = 'network'
          THEN coalesce(to_jsonb(i) ->> 'indent_operational_code', i.indent_number) END,
        'pickup_area', i.pickup_area,
        'drop_location', i.drop_location,
        'vehicle_type', i.vehicle_type,
        'pickup_date', i.pickup_date,
        'channel', p.channel,
        'bidder_type', p.bidder_type,
        'bidder_organization_id', p.bidder_organization_id,
        'amount', p.amount,
        'shipper_name', CASE WHEN p.channel = 'network' THEN o.name::text END,
        'created_at', p.created_at
      ) ORDER BY p.created_at DESC, p.id DESC)
      FROM page p
      JOIN public.indents i ON i.id = p.indent_id
      LEFT JOIN public.organizations o ON o.id = p.shipper_organization_id
      WHERE p.rn <= v_limit
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_lane_bid_invites(integer, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_lane_bid_invites(integer, timestamptz, uuid) TO authenticated;
