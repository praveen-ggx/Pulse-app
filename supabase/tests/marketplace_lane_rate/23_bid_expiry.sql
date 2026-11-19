-- Individual bid clock, production award_market_bid, and production
-- create_trip_from_assigned_indent. Disposable Postgres only.
-- Stubs below stand in for fee, party, and exchange side effects so the
-- production function bodies can run. They are not a second award system.

ALTER TABLE public.market_bids
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS platform_fee_amount numeric,
  ADD COLUMN IF NOT EXISTS platform_fee_calc_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS fee_payment_status text NOT NULL DEFAULT 'not_required';

ALTER TABLE public.indents
  ADD COLUMN IF NOT EXISTS owner_user_id uuid;

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS trip_number text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_market_bid_id uuid,
  ADD COLUMN IF NOT EXISTS pickup_area text,
  ADD COLUMN IF NOT EXISTS drop_location text,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS client_price numeric,
  ADD COLUMN IF NOT EXISTS supplier_rate numeric,
  ADD COLUMN IF NOT EXISTS supplier_id uuid,
  ADD COLUMN IF NOT EXISTS trip_payout_mode text,
  ADD COLUMN IF NOT EXISTS driver_id uuid,
  ADD COLUMN IF NOT EXISTS vehicle_id uuid,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS pickup_date date,
  ADD COLUMN IF NOT EXISTS load_type text,
  ADD COLUMN IF NOT EXISTS vehicle_display_number text,
  ADD COLUMN IF NOT EXISTS platform_fee numeric,
  ADD COLUMN IF NOT EXISTS driver_commission numeric,
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS amount_paid numeric,
  ADD COLUMN IF NOT EXISTS platform_fee_calc_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS sale_rate_basis text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY,
  name text
);
CREATE TABLE IF NOT EXISTS public.drivers (
  id uuid PRIMARY KEY,
  organization_id uuid
);
CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY,
  organization_id uuid
);

CREATE OR REPLACE FUNCTION public.calculate_marketplace_platform_fee(p_amount numeric)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('resolved_fee', 0);
$$;

CREATE OR REPLACE FUNCTION public.indent_has_convertible_sale(p_indent public.indents)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(p_indent.client_price, 0) > 0;
$$;

CREATE OR REPLACE FUNCTION public.is_marketplace_indent_award(p_indent_id uuid, p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT false;
$$;

CREATE OR REPLACE FUNCTION public._ensure_marketplace_counterparty_account(
  p_org_id uuid, p_kind text, p_counterparty_org_id uuid
) RETURNS uuid LANGUAGE sql VOLATILE AS $$
  SELECT gen_random_uuid();
$$;

CREATE OR REPLACE FUNCTION public._exchange_enroll_trip(
  p_trip_id uuid, p_market_bid_id uuid, p_via text
) RETURNS void LANGUAGE sql AS $$
  SELECT NULL::void;
$$;

INSERT INTO public.indents (
  id, organization_id, indent_number, pickup_area, drop_location, vehicle_type,
  circulation_target, status, client_name, client_price, load_type, pickup_date, owner_user_id
) VALUES
  ('e4000000-0000-0000-0000-0000000000a1', t_id('SHIP1'), 'T-clk-1', 'Pune', 'Mumbai', '32FT', 'marketplace', 'open', 'Client', 50000, 'FTL', DATE '2026-11-20', t_id('u_ship')),
  ('e4000000-0000-0000-0000-0000000000a2', t_id('SHIP1'), 'T-clk-2', 'Pune', 'Mumbai', '32FT', 'marketplace', 'open', 'Client', 50000, 'FTL', DATE '2026-11-20', t_id('u_ship'));

INSERT INTO public.market_bids (
  indent_id, bidder_type, bidder_user_id, bidder_organization_id, amount, status
) VALUES (
  'e4000000-0000-0000-0000-0000000000a1', 'organization', t_id('u_bid1'), t_id('B1'), 30000, 'pending'
);

DO $$
DECLARE
  v_first timestamptz;
  v_second timestamptz;
  v_kept timestamptz;
  v_bid uuid;
  v_commit uuid;
  v_status text;
  v_trips int;
  v_award jsonb;
BEGIN
  SELECT id, expires_at INTO v_bid, v_first
  FROM public.market_bids
  WHERE indent_id = 'e4000000-0000-0000-0000-0000000000a1';
  PERFORM t_ok('Bid clock: the first bid is acceptable for 48 hours from its creation',
    abs(extract(epoch FROM (
      v_first - ((SELECT created_at FROM public.market_bids WHERE id = v_bid) + interval '48 hours')
    ))) < 2);

  UPDATE public.market_bids
  SET expires_at = now() - interval '1 hour'
  WHERE id = v_bid;
  SELECT expires_at INTO v_first FROM public.market_bids WHERE id = v_bid;

  INSERT INTO public.market_bids (
    indent_id, bidder_type, bidder_user_id, bidder_organization_id, amount, status
  ) VALUES (
    'e4000000-0000-0000-0000-0000000000a2', 'organization', t_id('u_bid1'), t_id('B1'), 30000, 'pending'
  );
  SELECT expires_at INTO v_second
  FROM public.market_bids
  WHERE indent_id = 'e4000000-0000-0000-0000-0000000000a2';
  PERFORM t_ok('Bid clock: a later bid gets its own 48-hour window',
    v_second > now() + interval '47 hours' AND v_second > v_first + interval '40 hours',
    v_second::text);

  PERFORM t_as(t_id('u_bid1'));
  UPDATE public.market_bids SET expires_at = now() + interval '90 days' WHERE id = v_bid;
  PERFORM t_admin();
  PERFORM t_ok('Bid clock: an app user cannot extend an offer',
    (SELECT expires_at FROM public.market_bids WHERE id = v_bid) = v_first);

  v_commit := (t_exec_as(t_id('u_bid1'), format(
    $q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', 'Mumbai', '32FT', 30000, 2, now() + interval '10 days')$q$,
    t_id('B1'))) ->> 'commit_id')::uuid;
  SELECT expires_at, status INTO v_kept, v_status
  FROM public.market_bids WHERE id = v_bid;
  UPDATE public.market_lane_bid_commits
  SET valid_until = now() - interval '1 second'
  WHERE id = v_commit;
  PERFORM public._expire_market_lane_commits('pune|mumbai|32ft');
  PERFORM t_ok('Bid clock: expiring the commitment does not expire or withdraw the existing bid',
    (SELECT status FROM public.market_lane_bid_commits WHERE id = v_commit) = 'expired'
    AND (SELECT expires_at FROM public.market_bids WHERE id = v_bid) = v_kept
    AND (SELECT status FROM public.market_bids WHERE id = v_bid) = v_status);
END $$;

SELECT t_err_as('Bid clock: an expired bid cannot be accepted directly', t_id('u_ship'),
  $q$UPDATE public.market_bids SET status = 'accepted' WHERE indent_id = 'e4000000-0000-0000-0000-0000000000a1'$q$,
  'bid_expired');

SELECT t_ok('Bid clock: the direct refusal leaves the bid pending',
  (SELECT status FROM public.market_bids WHERE indent_id = 'e4000000-0000-0000-0000-0000000000a1') = 'pending');

SELECT t_err_as('Award: award_market_bid refuses an expired bid', t_id('u_ship'),
  format('SELECT public.award_market_bid(%L)',
    (SELECT id FROM public.market_bids WHERE indent_id = 'e4000000-0000-0000-0000-0000000000a1')),
  'bid_expired');

SELECT t_ok('Award: a refused expired bid does not award the indent or create a trip',
  (SELECT status FROM public.indents WHERE id = 'e4000000-0000-0000-0000-0000000000a1') = 'open'
  AND (SELECT status FROM public.market_bids WHERE indent_id = 'e4000000-0000-0000-0000-0000000000a1') = 'pending'
  AND (SELECT count(*) FROM public.trips WHERE indent_id = 'e4000000-0000-0000-0000-0000000000a1') = 0);

DO $$
DECLARE v_award jsonb; v_trip jsonb; v_accepted uuid;
BEGIN
  v_award := t_exec_as(t_id('u_ship'), format(
    'SELECT public.award_market_bid(%L)',
    (SELECT id FROM public.market_bids WHERE indent_id = 'e4000000-0000-0000-0000-0000000000a2')));
  PERFORM t_ok('Award: award_market_bid accepts a live individual bid',
    (v_award ->> 'ok')::boolean AND (v_award ->> 'status') = 'accepted', v_award::text);
  PERFORM t_ok('Award: the indent is awarded and no trip exists yet',
    (SELECT status FROM public.indents WHERE id = 'e4000000-0000-0000-0000-0000000000a2') = 'awarded'
    AND (SELECT assigned_supplier_id FROM public.indents WHERE id = 'e4000000-0000-0000-0000-0000000000a2') = t_id('B1')
    AND (SELECT count(*) FROM public.trips WHERE indent_id = 'e4000000-0000-0000-0000-0000000000a2') = 0);

  SELECT id INTO v_accepted
  FROM public.market_bids WHERE indent_id = 'e4000000-0000-0000-0000-0000000000a2';
  UPDATE public.market_bids SET expires_at = now() - interval '2 hours' WHERE id = v_accepted;
  PERFORM t_ok('Bid clock: moving the clock does not withdraw an accepted bid',
    (SELECT status FROM public.market_bids WHERE id = v_accepted) = 'accepted');

  v_trip := t_exec_as(t_id('u_bid1'),
    $q$SELECT to_jsonb(t) FROM public.create_trip_from_assigned_indent('e4000000-0000-0000-0000-0000000000a2') t$q$);
  PERFORM t_ok('Trip: create_trip_from_assigned_indent writes the trip after the award',
    v_trip IS NOT NULL
    AND (SELECT count(*) FROM public.trips WHERE indent_id = 'e4000000-0000-0000-0000-0000000000a2') = 1
    AND (SELECT status FROM public.market_bids WHERE id = v_accepted) = 'accepted',
    v_trip::text);
END $$;

SELECT t_done();
