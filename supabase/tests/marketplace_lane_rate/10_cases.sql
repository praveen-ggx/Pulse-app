-- Marketplace lane rate, opt-in (20271114201500). Disposable database only.
-- SHIP1 / SHIP2 ship; B1 (u_bid1) opts in; B2 (u_other) only bids per load.

INSERT INTO auth.users (id)
SELECT id FROM t_ids WHERE name LIKE 'u\_%' ON CONFLICT DO NOTHING;

INSERT INTO t_ids VALUES
  ('L_A', gen_random_uuid()), ('L_B', gen_random_uuid()), ('L_NET', gen_random_uuid()),
  ('L_OWN', gen_random_uuid()), ('L_OTHER', gen_random_uuid());

-- Loads that exist before anyone opts in.
INSERT INTO public.indents (id, organization_id, pickup_area, drop_location, vehicle_type, circulation_target, status)
VALUES
  (t_id('L_A'), t_id('SHIP1'), 'Pune', 'Mumbai', '32FT', 'marketplace', 'open'),
  (t_id('L_B'), t_id('SHIP2'), ' pune ', 'MUMBAI', '32ft', 'both', 'open'),
  (t_id('L_NET'), t_id('SHIP1'), 'Pune', 'Mumbai', '32FT', 'integrated_supplier', 'open'),
  (t_id('L_OWN'), t_id('B1'), 'Pune', 'Mumbai', '32FT', 'marketplace', 'open'),
  (t_id('L_OTHER'), t_id('SHIP1'), 'Pune', 'Nashik', '32FT', 'marketplace', 'open');

-- B2 bids on L_A only; B1 places its pooled bid on L_A.
INSERT INTO public.market_bids (indent_id, bidder_type, bidder_user_id, bidder_organization_id, amount)
VALUES
  (t_id('L_A'), 'organization', t_id('u_other'), t_id('B2'), 28000),
  (t_id('L_A'), 'organization', t_id('u_bid1'), t_id('B1'), 30000);

DO $$
DECLARE v_new uuid;
BEGIN
  -- A plain pending bid no longer follows the lane.
  v_new := t_indent(t_id('SHIP1'), 'Pune', 'Mumbai', '32FT');
  PERFORM t_ok('No opt-in: a new lane load gets no copied bids',
    NOT EXISTS (SELECT 1 FROM public.market_bids WHERE indent_id = v_new));
END $$;

-- Opt-in guards.
SELECT t_err_as('Commit: another org cannot opt in for B1', t_id('u_other'),
  format($q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', 'Mumbai', '32FT', 30000, 2, now() + interval '10 days')$q$, t_id('B1')),
  'unauthorized');
SELECT t_err_as('Commit: more than 90 days is refused', t_id('u_bid1'),
  format($q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', 'Mumbai', '32FT', 30000, 2, now() + interval '120 days')$q$, t_id('B1')),
  'invalid_valid_until');
SELECT t_err_as('Commit: blank lane is refused', t_id('u_bid1'),
  format($q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', '', '32FT', 30000, 2, now() + interval '10 days')$q$, t_id('B1')),
  'no_lane');
SELECT t_err_as('Internal apply is not callable by app users', t_id('u_ship'),
  format('SELECT public.apply_standing_lane_bids(%L)', t_id('L_A')),
  'permission denied');

DO $$
DECLARE
  v jsonb;
  v_commit uuid;
BEGIN
  v := t_exec_as(t_id('u_bid1'), format(
    $q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', 'Mumbai', '32FT', 30000, 2, now() + interval '10 days')$q$,
    t_id('B1')));
  v_commit := (v ->> 'commit_id')::uuid;
  INSERT INTO t_ids VALUES ('COMMIT1', v_commit);

  PERFORM t_ok('Past: the pooled bid at the same rate is linked', (v ->> 'linked')::int = 1, v::text);
  PERFORM t_ok('Past: open Marketplace loads without a B1 offer receive the rate',
    EXISTS (SELECT 1 FROM public.market_bids WHERE indent_id = t_id('L_B')
            AND bidder_organization_id = t_id('B1') AND lane_commit_id = v_commit AND amount = 30000),
    v::text);
  PERFORM t_ok('Past: Network-only, own and other-lane loads are skipped',
    NOT EXISTS (SELECT 1 FROM public.market_bids WHERE bidder_organization_id = t_id('B1')
                AND indent_id IN (t_id('L_NET'), t_id('L_OWN'), t_id('L_OTHER'))));
  PERFORM t_ok('Past: B2 per-load bid is not spread anywhere',
    (SELECT count(*) FROM public.market_bids WHERE bidder_organization_id = t_id('B2')) = 1);
END $$;

DO $$
DECLARE v_future uuid; v_bid uuid; v_draft uuid;
BEGIN
  -- Future load created by a shipper as authenticated (trigger + index run as that role).
  PERFORM t_as(t_id('u_ship'));
  INSERT INTO public.indents (organization_id, pickup_area, drop_location, vehicle_type, circulation_target, status)
  VALUES (t_id('SHIP1'), 'PUNE', 'mumbai ', '32FT', 'marketplace', 'open')
  RETURNING id INTO v_future;
  PERFORM t_admin();
  INSERT INTO t_ids VALUES ('L_FUT', v_future);
  PERFORM t_ok('Future: a new load on the lane receives the opt-in rate as authenticated insert',
    EXISTS (SELECT 1 FROM public.market_bids WHERE indent_id = v_future
            AND bidder_organization_id = t_id('B1') AND lane_commit_id = t_id('COMMIT1')));

  -- Draft then opened.
  v_draft := t_indent(t_id('SHIP2'), 'Pune', 'Mumbai', '32FT', 'marketplace', 'draft');
  PERFORM t_ok('Future: drafts receive nothing',
    NOT EXISTS (SELECT 1 FROM public.market_bids WHERE indent_id = v_draft));
  UPDATE public.indents SET status = 'open' WHERE id = v_draft;
  PERFORM t_ok('Future: the rate attaches when the draft opens',
    EXISTS (SELECT 1 FROM public.market_bids WHERE indent_id = v_draft AND bidder_organization_id = t_id('B1')));

  -- Shared to Marketplace later.
  UPDATE public.indents SET circulation_target = 'both' WHERE id = t_id('L_NET');
  PERFORM t_ok('Future: posting a Network load to Marketplace attaches the rate',
    EXISTS (SELECT 1 FROM public.market_bids WHERE indent_id = t_id('L_NET') AND bidder_organization_id = t_id('B1')));

  -- A rejected bid is not re-placed.
  SELECT id INTO v_bid FROM public.market_bids WHERE indent_id = v_future AND bidder_organization_id = t_id('B1');
  UPDATE public.market_bids SET status = 'rejected' WHERE id = v_bid;
  UPDATE public.indents SET circulation_target = 'both' WHERE id = v_future;
  PERFORM t_ok('Rejected bids are never re-placed',
    (SELECT count(*) FROM public.market_bids WHERE indent_id = v_future AND bidder_organization_id = t_id('B1')) = 1
    AND (SELECT status FROM public.market_bids WHERE id = v_bid) = 'rejected');
END $$;

SELECT t_ok('Preview: the shipper sees the live opt-in rate',
  (t_exec_as(t_id('u_ship'),
    $q$SELECT coalesce(jsonb_agg(p), '[]') FROM public.preview_standing_lane_bids('Pune', 'Mumbai', '32FT') p$q$)
   -> 0 ->> 'bidder_organization_id')::uuid = t_id('B1'));
SELECT t_ok('Preview: plain pending bids (B2) are not offered as auto rates',
  jsonb_array_length(t_exec_as(t_id('u_ship'),
    $q$SELECT coalesce(jsonb_agg(p), '[]') FROM public.preview_standing_lane_bids('Pune', 'Mumbai', '32FT') p$q$)) = 1);

DO $$
DECLARE v_after uuid;
BEGIN
  -- Two awards exhaust a two-vehicle rate.
  UPDATE public.market_bids SET status = 'accepted'
  WHERE indent_id = t_id('L_A') AND bidder_organization_id = t_id('B1');
  PERFORM t_ok('Award: one vehicle consumed',
    (SELECT awarded_count FROM public.market_lane_bid_commits WHERE id = t_id('COMMIT1')) = 1);
  UPDATE public.market_bids SET status = 'accepted'
  WHERE indent_id = t_id('L_B') AND bidder_organization_id = t_id('B1');
  PERFORM t_ok('Award: limit reached marks the rate exhausted',
    (SELECT status FROM public.market_lane_bid_commits WHERE id = t_id('COMMIT1')) = 'exhausted');

  v_after := t_indent(t_id('SHIP1'), 'Pune', 'Mumbai', '32FT');
  PERFORM t_ok('Exhausted: new loads stop receiving the rate',
    NOT EXISTS (SELECT 1 FROM public.market_bids WHERE indent_id = v_after));

  -- A pending lane bid on an exhausted rate is still awardable as an ordinary bid.
  UPDATE public.market_bids SET status = 'accepted'
  WHERE indent_id = t_id('L_NET') AND bidder_organization_id = t_id('B1');
  PERFORM t_ok('Exhausted: remaining pending lane bids stay awardable and uncounted',
    (SELECT lane_commit_id IS NULL FROM public.market_bids
      WHERE indent_id = t_id('L_NET') AND bidder_organization_id = t_id('B1'))
    AND (SELECT awarded_count FROM public.market_lane_bid_commits WHERE id = t_id('COMMIT1')) = 2);
END $$;

SELECT t_ok('Preview: an exhausted rate is no longer offered',
  jsonb_array_length(t_exec_as(t_id('u_ship'),
    $q$SELECT coalesce(jsonb_agg(p), '[]') FROM public.preview_standing_lane_bids('Pune', 'Mumbai', '32FT') p$q$)) = 0);

DO $$
DECLARE v jsonb; v2 jsonb; v_pending uuid;
BEGIN
  -- New rate supersedes the old one and moves pending lane bids to it.
  v := t_exec_as(t_id('u_bid1'), format(
    $q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', 'Mumbai', '32FT', 31000, 5, now() + interval '20 days')$q$,
    t_id('B1')));
  v2 := t_exec_as(t_id('u_bid1'), format(
    $q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', 'Mumbai', '32FT', 29500, 5, now() + interval '20 days')$q$,
    t_id('B1')));
  PERFORM t_ok('Re-commit: one active rate per org and lane',
    (SELECT count(*) FROM public.market_lane_bid_commits
      WHERE bidder_organization_id = t_id('B1') AND status = 'active') = 1);
  PERFORM t_ok('Re-commit: pending lane bids move to the new rate and amount',
    NOT EXISTS (SELECT 1 FROM public.market_bids
      WHERE lane_commit_id = (v ->> 'commit_id')::uuid AND status = 'pending')
    AND EXISTS (SELECT 1 FROM public.market_bids
      WHERE lane_commit_id = (v2 ->> 'commit_id')::uuid AND status = 'pending' AND amount = 29500),
    v2::text);

  -- Withdraw stops future loads.
  PERFORM t_exec_as(t_id('u_bid1'), format('SELECT public.withdraw_marketplace_lane_rate(%L)', v2 ->> 'commit_id'));
  v_pending := t_indent(t_id('SHIP2'), 'Pune', 'Mumbai', '32FT');
  PERFORM t_ok('Withdraw: new loads stop receiving the rate',
    NOT EXISTS (SELECT 1 FROM public.market_bids WHERE indent_id = v_pending));
END $$;

SELECT t_err_as('Withdraw: another org cannot withdraw B1''s rate', t_id('u_other'),
  format('SELECT public.withdraw_marketplace_lane_rate(%L)', t_id('COMMIT1')),
  'unauthorized');

SELECT t_ok('RLS: another org cannot read B1''s lane rates',
  (t_exec_as(t_id('u_other'), 'SELECT to_jsonb(count(*)) FROM public.market_lane_bid_commits'))::text = '0');
SELECT t_ok('RLS: B1 reads its own lane rates',
  (t_exec_as(t_id('u_bid1'), 'SELECT to_jsonb(count(*)) FROM public.market_lane_bid_commits'))::int >= 3);

SELECT t_done();
