-- Marketplace/network state-machine integrity.
-- 1) award_market_bid: awarding closes every pending direct quote on the indent.
-- 2) tg_network_pool_commit_on_quote_accept: when a pool commit is exhausted,
--    its other pending quotes (any indent) are closed.
-- 3) notify_indent_supplier_requested: no "Quote requested" on awards; uses indent_code.
-- direct_quotes.status allows only pending|accepted|rejected, so closed quotes are
-- 'rejected' (no 'superseded' value exists; adding one would be a separate constraint change).
-- Function bodies are the live prod definitions with the marked additions only.

CREATE OR REPLACE FUNCTION public.award_market_bid(p_bid_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_bid          public.market_bids;
  v_indent       public.indents;
  v_indent_id    uuid;
  v_fee_calc     jsonb;
  v_platform_fee numeric;
  v_fee_status   text;
BEGIN
  -- Gate 1A: resolve the target indent WITHOUT a row lock, so the indent is
  -- always the first lock this function takes. Every other writer that can
  -- decide a commercial winner locks the indent first; taking the bid first
  -- was the one inversion in the system.
  SELECT indent_id INTO v_indent_id FROM public.market_bids WHERE id = p_bid_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: bid %', p_bid_id;
  END IF;

  -- Lock the INDENT first -- unchanged concurrency rule from accept_market_bid.
  SELECT * INTO v_indent FROM public.indents WHERE id = v_indent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: indent % for bid %', v_indent_id, p_bid_id;
  END IF;

  SELECT * INTO v_bid FROM public.market_bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: bid %', p_bid_id;
  END IF;
  IF v_bid.indent_id IS DISTINCT FROM v_indent_id THEN
    RAISE EXCEPTION 'invalid_state: bid % no longer belongs to indent %', p_bid_id, v_indent_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_indent.organization_id
      AND om.user_id = (select auth.uid())
      AND om.status = 'active'
      AND om.role <> 'driver'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a non-driver member of the organization that owns this indent';
  END IF;

  -- No trip is ever created by this function for either branch now, so
  -- "already decided" is fully expressed by market_bids.status alone -- no
  -- trips lookup needed here at all (a simplification vs. the old
  -- accept_market_bid, which had to special-case "accepted, no trip yet"
  -- only for the organization branch; here it is uniform for both).
  IF v_bid.status = 'accepted' THEN
    RETURN jsonb_build_object(
      'ok', true, 'bid_id', p_bid_id, 'status', 'accepted',
      'fee_payment_status', v_bid.fee_payment_status,
      'platform_fee_amount', v_bid.platform_fee_amount
    );
  END IF;

  IF v_bid.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_state: bid already decided (current: %)', v_bid.status;
  END IF;

  IF lower(trim(coalesce(v_indent.status, ''))) NOT IN ('open', 'broadcast') THEN
    RAISE EXCEPTION 'indent_not_open: indent % is not open for award (status=%)', v_indent.id, v_indent.status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.indent_id = v_indent.id AND t.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'already_awarded: indent % already has an active canonical trip', v_indent.id;
  END IF;

  -- A8.6.2: fee resolution now runs for BOTH bidder types (previously DCO
  -- only) -- this is the one genuinely new behavior for the organization
  -- branch. Never recompute after this; locked into market_bids row below.
  v_fee_calc     := public.calculate_marketplace_platform_fee(v_bid.amount);
  v_platform_fee := coalesce((v_fee_calc->>'resolved_fee')::numeric, 0);
  v_fee_status   := CASE WHEN v_platform_fee > 0 THEN 'required' ELSE 'not_required' END;

  IF v_bid.bidder_type = 'organization' THEN
    IF v_bid.bidder_organization_id IS NULL THEN
      RAISE EXCEPTION 'invalid_bid: organization bid % has no bidder_organization_id', v_bid.id;
    END IF;

    UPDATE public.market_bids
    SET status = 'accepted', accepted_at = now(), updated_at = now(),
        platform_fee_amount = v_platform_fee,
        platform_fee_calc_snapshot = v_fee_calc,
        fee_payment_status = v_fee_status
    WHERE id = p_bid_id;

    UPDATE public.market_bids
    SET status = 'rejected', updated_at = now()
    WHERE indent_id = v_indent.id AND id <> v_bid.id AND status = 'pending';

    UPDATE public.direct_quotes
    SET status = 'rejected', updated_at = now()
    WHERE indent_id = v_indent.id AND status = 'pending';

    UPDATE public.indents
    SET status = 'awarded',
        assigned_supplier_id = v_bid.bidder_organization_id,
        updated_at = now()
    WHERE id = v_indent.id;

    RETURN jsonb_build_object(
      'ok', true, 'bid_id', p_bid_id, 'status', 'accepted',
      'fee_payment_status', v_fee_status, 'platform_fee_amount', v_platform_fee
    );
  END IF;

  IF v_bid.bidder_type <> 'dco' THEN
    RAISE EXCEPTION 'unexpected_bidder_type: %', v_bid.bidder_type;
  END IF;

  IF NOT public.is_driver_available(v_bid.bidder_user_id) THEN
    RAISE EXCEPTION 'driver_unavailable: this driver is already on an active trip';
  END IF;

  IF v_bid.owner_vehicle_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.owner_vehicles ov
    WHERE ov.id = v_bid.owner_vehicle_id
      AND ov.owner_user_id = v_bid.bidder_user_id
      AND ov.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'vehicle_no_longer_eligible: owner_vehicle % is no longer valid for bidder %', v_bid.owner_vehicle_id, v_bid.bidder_user_id;
  END IF;

  -- _resolve_or_create_market_driver() deliberately NOT called here anymore
  -- -- it moves to create_market_trip_after_fee_payment(), the moment a
  -- trip actually gets created. Creating the drivers-row stub before a fee
  -- is even paid would be premature side-effecting for a bid that might
  -- never convert.

  UPDATE public.market_bids
  SET status = 'accepted', accepted_at = now(), updated_at = now(),
      platform_fee_amount = v_platform_fee,
      platform_fee_calc_snapshot = v_fee_calc,
      fee_payment_status = v_fee_status
  WHERE id = p_bid_id;

  UPDATE public.market_bids
  SET status = 'rejected', updated_at = now()
  WHERE indent_id = v_indent.id AND id <> v_bid.id AND status = 'pending';

  -- Close competing direct quotes on this indent (pool or network). They are
  -- losing offers now; leaving them pending leaves stale state in the DB.
  UPDATE public.direct_quotes
  SET status = 'rejected', updated_at = now()
  WHERE indent_id = v_indent.id AND status = 'pending';

  -- A6.3 superseding: unchanged timing -- runs at AWARD, not at eventual
  -- trip creation. NOTE (A8.6.2 known gap, documented in the plan): this
  -- only closes out bids that are already PENDING at award time. A driver
  -- can still submit and be awarded a second bid while this one sits
  -- fee-pending, since is_driver_available() has no visibility into an
  -- accepted-but-unpaid market_bids row. Not fixed in this phase.
  UPDATE public.market_bids
  SET status = 'superseded', updated_at = now()
  WHERE bidder_user_id = v_bid.bidder_user_id
    AND status = 'pending'
    AND id <> v_bid.id;

  UPDATE public.driver_direct_bids
  SET status = 'superseded', updated_at = now()
  WHERE driver_user_id = v_bid.bidder_user_id
    AND status = 'pending';

  UPDATE public.indents SET status = 'awarded', updated_at = now() WHERE id = v_indent.id;

  RETURN jsonb_build_object(
    'ok', true, 'bid_id', p_bid_id, 'status', 'accepted',
    'fee_payment_status', v_fee_status, 'platform_fee_amount', v_platform_fee
  );
END;
$function$



CREATE OR REPLACE FUNCTION public.tg_network_pool_commit_on_quote_accept()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Commit used up: every other pending quote still riding on this commit
  -- (on any indent) can no longer be awarded. Close it here instead of
  -- leaving it pending and hidden by the read-side filter.
  IF v_next >= v_commit.vehicle_limit THEN
    UPDATE public.direct_quotes
    SET status = 'rejected', updated_at = now()
    WHERE pool_commit_id = v_commit.id
      AND id <> NEW.id
      AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$function$



CREATE OR REPLACE FUNCTION public.notify_indent_supplier_requested()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code text;
  v_route text;
  v_supplier_org uuid;
  v_market_bid public.market_bids%ROWTYPE;
BEGIN
  IF NEW.assigned_supplier_id IS NULL
     OR NEW.assigned_supplier_id IS NOT DISTINCT FROM OLD.assigned_supplier_id THEN
    RETURN NEW;
  END IF;

  v_supplier_org := NEW.assigned_supplier_id;

  -- Same label the Load Center card uses (indent_code), so push text and UI agree.
  v_code := COALESCE(NEW.indent_code, NEW.indent_number, NEW.indent_operational_code, 'Indent');
  v_route := public.indent_route_label(NEW);

  -- Winning Marketplace bid: the supplier has WON. Emit "awarded", never
  -- "Quote requested".
  SELECT * INTO v_market_bid
  FROM public.market_bids mb
  WHERE mb.indent_id = NEW.id
    AND mb.bidder_organization_id = v_supplier_org
    AND mb.status = 'accepted'
  ORDER BY mb.accepted_at DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    PERFORM public.emit_network_notification(
      v_supplier_org,
      NEW.organization_id,
      'awarded',
      CONCAT(v_code, ' awarded to you'),
      v_route,
      v_market_bid.amount,
      NEW.id, NULL, v_market_bid.id,
      CONCAT('awarded:market_bid:', v_market_bid.id),
      jsonb_build_object('indent_code', v_code, 'route', v_route)
    );
    RETURN NEW;
  END IF;

  -- Network quote award: notify_direct_quote_lifecycle already emits "awarded"
  -- for the accepted quote. Do not add a second message.
  IF EXISTS (
    SELECT 1 FROM public.direct_quotes dq
    WHERE dq.indent_id = NEW.id
      AND dq.bidder_organization_id = v_supplier_org
      AND dq.status = 'accepted'
  ) THEN
    RETURN NEW;
  END IF;

  -- Genuine request: owner invited this supplier to quote.
  PERFORM public.emit_network_notification(
    v_supplier_org,
    NEW.organization_id,
    'quote_requested',
    CONCAT('Quote requested on ', v_code),
    v_route,
    NEW.supplier_target,
    NEW.id, NULL, NULL,
    CONCAT('quote_requested:', NEW.id, ':', v_supplier_org),
    jsonb_build_object('indent_code', v_code, 'route', v_route)
  );

  RETURN NEW;
END;
$$;
