-- 48-hour Marketplace lane commitment. Disposable Postgres only.
-- Runs after 20271114201500 and 20271117013000. Does not touch a shared database.

INSERT INTO auth.users (id)
SELECT id FROM t_ids WHERE name LIKE 'u\_%' ON CONFLICT DO NOTHING;

INSERT INTO t_ids VALUES
  ('L_A', gen_random_uuid()), ('L_B', gen_random_uuid()),
  ('L_OTHER', gen_random_uuid()), ('L_ACC', gen_random_uuid());

INSERT INTO public.indents (id, organization_id, pickup_area, drop_location, vehicle_type, circulation_target, status)
VALUES
  (t_id('L_A'), t_id('SHIP1'), 'Pune', 'Mumbai', '32FT', 'marketplace', 'open'),
  (t_id('L_B'), t_id('SHIP2'), ' pune ', 'MUMBAI', '32ft', 'both', 'open'),
  (t_id('L_OTHER'), t_id('SHIP1'), 'Pune', 'Nashik', '32FT', 'marketplace', 'open'),
  (t_id('L_ACC'), t_id('SHIP1'), 'Pune', 'Mumbai', '32FT', 'marketplace', 'open');

INSERT INTO public.market_bids (indent_id, bidder_type, bidder_user_id, bidder_organization_id, amount, status)
VALUES
  (t_id('L_A'), 'organization', t_id('u_other'), t_id('B2'), 28000, 'pending'),
  (t_id('L_A'), 'organization', t_id('u_bid1'), t_id('B1'), 30000, 'pending'),
  (t_id('L_ACC'), 'organization', t_id('u_bid1'), t_id('B1'), 30000, 'accepted');

CREATE TABLE IF NOT EXISTS public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indent_id uuid
);

-- A. Creation. A client timestamp must not set the window.
DO $$
DECLARE
  v jsonb;
  v_until timestamptz;
  v_delta double precision;
BEGIN
  v := t_exec_as(t_id('u_bid1'), format(
    $q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', 'Mumbai', '32FT', 30000, 2, now() + interval '90 days')$q$,
    t_id('B1')));
  INSERT INTO t_ids VALUES ('COMMIT1', (v ->> 'commit_id')::uuid);
  v_until := (v ->> 'valid_until')::timestamptz;
  v_delta := abs(extract(epoch FROM (v_until - (now() + interval '48 hours'))));
  PERFORM t_ok('A: one commitment is created',
    (SELECT count(*) FROM public.market_lane_bid_commits
      WHERE bidder_organization_id = t_id('B1') AND status = 'active') = 1, v::text);
  PERFORM t_ok('A: valid_until is about 48 hours from the database clock', v_delta < 2, v_until::text);
  PERFORM t_ok('A: the 90-day client timestamp was not stored',
    v_until < now() + interval '49 hours', v_until::text);
  PERFORM t_ok('A: the open matching load without a B1 offer receives one bid',
    (SELECT count(*) FROM public.market_bids
      WHERE indent_id = t_id('L_B') AND bidder_organization_id = t_id('B1')
        AND lane_commit_id = t_id('COMMIT1') AND amount = 30000 AND status = 'pending') = 1);
  PERFORM t_ok('A: the load that already had a B1 bid is not duplicated',
    (SELECT count(*) FROM public.market_bids
      WHERE indent_id = t_id('L_A') AND bidder_user_id = t_id('u_bid1')) = 1);
  PERFORM t_ok('A: a different lane is not bid',
    NOT EXISTS (SELECT 1 FROM public.market_bids
      WHERE indent_id = t_id('L_OTHER') AND bidder_organization_id = t_id('B1')));
  PERFORM t_ok('A: the accepted bid is unchanged',
    (SELECT amount FROM public.market_bids
      WHERE indent_id = t_id('L_ACC') AND bidder_organization_id = t_id('B1')) = 30000
    AND (SELECT status FROM public.market_bids
      WHERE indent_id = t_id('L_ACC') AND bidder_organization_id = t_id('B1')) = 'accepted');
END $$;

-- A past client timestamp is also ignored.
DO $$
DECLARE v jsonb; v_until timestamptz;
BEGIN
  v := t_exec_as(t_id('u_bid1'), format(
    $q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', 'Mumbai', '32FT', 30000, 2, now() - interval '1 day')$q$,
    t_id('B1')));
  v_until := (v ->> 'valid_until')::timestamptz;
  PERFORM t_ok('A: a past client timestamp does not shorten or replace the commitment',
    (v ->> 'reused')::boolean
    AND (v ->> 'commit_id')::uuid = t_id('COMMIT1')
    AND v_until > now() + interval '47 hours', v::text);
END $$;

-- B. Same rate again.
DO $$
DECLARE v jsonb; v_before timestamptz; v_bids int;
BEGIN
  SELECT valid_until INTO v_before FROM public.market_lane_bid_commits WHERE id = t_id('COMMIT1');
  SELECT count(*) INTO v_bids FROM public.market_bids WHERE bidder_organization_id = t_id('B1');
  v := t_exec_as(t_id('u_bid1'), format(
    $q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', 'Mumbai', '32FT', 30000, 9, now() + interval '10 days', false)$q$,
    t_id('B1')));
  PERFORM t_ok('B: the same rate reuses the row',
    (v ->> 'reused')::boolean AND (v ->> 'commit_id')::uuid = t_id('COMMIT1') AND NOT (v ->> 'renewed')::boolean);
  PERFORM t_ok('B: valid_until does not move',
    (SELECT valid_until FROM public.market_lane_bid_commits WHERE id = t_id('COMMIT1')) = v_before);
  PERFORM t_ok('B: still one active commitment and no extra bids',
    (SELECT count(*) FROM public.market_lane_bid_commits
      WHERE bidder_organization_id = t_id('B1') AND status = 'active') = 1
    AND (SELECT count(*) FROM public.market_bids WHERE bidder_organization_id = t_id('B1')) = v_bids);
END $$;

-- C. Different rate. Accepted and the other carrier stay.
DO $$
DECLARE v jsonb; v_before timestamptz;
BEGIN
  SELECT valid_until INTO v_before FROM public.market_lane_bid_commits WHERE id = t_id('COMMIT1');
  v := t_exec_as(t_id('u_bid1'), format(
    $q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', 'Mumbai', '32FT', 27500, 2, now() + interval '30 days', false)$q$,
    t_id('B1')));
  PERFORM t_ok('C: the active row is updated in place',
    (v ->> 'rate_changed')::boolean
    AND NOT (v ->> 'renewed')::boolean
    AND (v ->> 'commit_id')::uuid = t_id('COMMIT1'));
  PERFORM t_ok('C: valid_until does not move',
    (SELECT valid_until FROM public.market_lane_bid_commits WHERE id = t_id('COMMIT1')) = v_before);
  PERFORM t_ok('C: pending bids take the new amount',
    (SELECT amount FROM public.market_bids
      WHERE indent_id = t_id('L_B') AND bidder_organization_id = t_id('B1')) = 27500
    AND (SELECT status FROM public.market_bids
      WHERE indent_id = t_id('L_B') AND bidder_organization_id = t_id('B1')) = 'pending');
  PERFORM t_ok('C: the accepted bid amount and status stay',
    (SELECT amount FROM public.market_bids WHERE indent_id = t_id('L_ACC')) = 30000
    AND (SELECT status FROM public.market_bids WHERE indent_id = t_id('L_ACC')) = 'accepted');
  PERFORM t_ok('C: the other carrier bid is untouched',
    (SELECT amount FROM public.market_bids
      WHERE indent_id = t_id('L_A') AND bidder_organization_id = t_id('B2')) = 28000
    AND (SELECT status FROM public.market_bids
      WHERE indent_id = t_id('L_A') AND bidder_organization_id = t_id('B2')) = 'pending');
END $$;

-- D. Explicit renewal.
DO $$
DECLARE v jsonb; v_before timestamptz; v_until timestamptz; v_bids int;
BEGIN
  SELECT valid_until INTO v_before FROM public.market_lane_bid_commits WHERE id = t_id('COMMIT1');
  UPDATE public.market_lane_bid_commits
  SET valid_until = now() + interval '2 hours'
  WHERE id = t_id('COMMIT1');
  v_before := now() + interval '2 hours';
  SELECT count(*) INTO v_bids FROM public.market_bids WHERE bidder_user_id = t_id('u_bid1');

  v := t_exec_as(t_id('u_bid1'), format(
    $q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', 'Mumbai', '32FT', 27500, 2, now() + interval '1 hour', false)$q$,
    t_id('B1')));
  PERFORM t_ok('D: p_renew false keeps the shortened window',
    NOT (v ->> 'renewed')::boolean
    AND (SELECT valid_until FROM public.market_lane_bid_commits WHERE id = t_id('COMMIT1')) = v_before);

  v := t_exec_as(t_id('u_bid1'), format(
    $q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', 'Mumbai', '32FT', 27500, 2, now() + interval '1 hour', true)$q$,
    t_id('B1')));
  v_until := (v ->> 'valid_until')::timestamptz;
  PERFORM t_ok('D: the same rate with p_renew starts a new 48-hour window',
    (v ->> 'renewed')::boolean
    AND (v ->> 'commit_id')::uuid = t_id('COMMIT1')
    AND abs(extract(epoch FROM (v_until - (now() + interval '48 hours')))) < 2,
    v_until::text);

  v := t_exec_as(t_id('u_bid1'), format(
    $q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', 'Mumbai', '32FT', 26000, 2, now(), true)$q$,
    t_id('B1')));
  PERFORM t_ok('D: a changed rate with p_renew updates pending bids and the window',
    (v ->> 'renewed')::boolean AND (v ->> 'rate_changed')::boolean
    AND (SELECT amount FROM public.market_bids WHERE indent_id = t_id('L_B')) = 26000
    AND (SELECT valid_until FROM public.market_lane_bid_commits WHERE id = t_id('COMMIT1'))
        > now() + interval '47 hours');
  PERFORM t_ok('D: renewal does not duplicate bids or change the accepted bid',
    (SELECT count(*) FROM public.market_bids WHERE bidder_user_id = t_id('u_bid1')) = v_bids
    AND (SELECT amount FROM public.market_bids WHERE indent_id = t_id('L_ACC')) = 30000
    AND (SELECT status FROM public.market_bids WHERE indent_id = t_id('L_ACC')) = 'accepted');
END $$;

-- Put the pending rate back to a known amount without extending, for later cases.
SELECT t_exec_as(t_id('u_bid1'), format(
  $q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', 'Mumbai', '32FT', 30000, 2, now(), false)$q$,
  t_id('B1')));

-- E. Exact boundary. now() is stable inside the transaction.
DO $$
DECLARE v_new uuid; v_status text; v jsonb; v_old uuid;
BEGIN
  UPDATE public.market_lane_bid_commits
  SET valid_until = now() + interval '1 microsecond', status = 'active'
  WHERE id = t_id('COMMIT1');
  PERFORM t_ok('E: just before valid_until the commitment is live',
    public.market_lane_commit_is_live('active', 99, 1, now() + interval '1 microsecond'));

  UPDATE public.market_lane_bid_commits
  SET valid_until = now(), status = 'active'
  WHERE id = t_id('COMMIT1');
  PERFORM t_ok('E: exactly at valid_until it is not live',
    NOT public.market_lane_commit_is_live('active', 0, 200, now()));

  v_new := t_indent(t_id('SHIP1'), 'Pune', 'Mumbai', '32FT');
  SELECT status INTO v_status FROM public.market_lane_bid_commits WHERE id = t_id('COMMIT1');
  PERFORM t_ok('E: a load created at the boundary does not get the bid',
    NOT EXISTS (SELECT 1 FROM public.market_bids
      WHERE indent_id = v_new AND bidder_organization_id = t_id('B1')));
  PERFORM t_ok('E: the load does not turn the commitment active again',
    v_status = 'expired', v_status);

  UPDATE public.market_lane_bid_commits
  SET valid_until = now() - interval '1 microsecond', status = 'active'
  WHERE id = t_id('COMMIT1');
  v_new := t_indent(t_id('SHIP2'), 'Pune', 'Mumbai', '32FT');
  PERFORM t_ok('E: just after valid_until a new load gets no bid and the row stays expired',
    NOT EXISTS (SELECT 1 FROM public.market_bids WHERE indent_id = v_new AND bidder_organization_id = t_id('B1'))
    AND (SELECT status FROM public.market_lane_bid_commits WHERE id = t_id('COMMIT1')) = 'expired');

  v_old := t_id('COMMIT1');
  v := t_exec_as(t_id('u_bid1'), format(
    $q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', 'Mumbai', '32FT', 30000, 2, now() - interval '5 days')$q$,
    t_id('B1')));
  PERFORM t_ok('E: the next submission inserts a new 48-hour row',
    NOT (v ->> 'reused')::boolean
    AND (v ->> 'commit_id')::uuid <> v_old
    AND (SELECT status FROM public.market_lane_bid_commits WHERE id = v_old) = 'expired'
    AND (SELECT count(*) FROM public.market_lane_bid_commits
          WHERE bidder_organization_id = t_id('B1') AND status = 'active') = 1
    AND abs(extract(epoch FROM (((v ->> 'valid_until')::timestamptz) - (now() + interval '48 hours')))) < 2);
  UPDATE t_ids SET id = (v ->> 'commit_id')::uuid WHERE name = 'COMMIT1';
END $$;

-- J. Accept one bid the live commitment placed. The trigger must not consume capacity or write a trip.
DO $$
DECLARE v_indent uuid; v_before uuid; v_awarded int; v_status text; v_trips int;
BEGIN
  SELECT mb.indent_id, mb.lane_commit_id INTO v_indent, v_before
  FROM public.market_bids mb
  WHERE mb.lane_commit_id = t_id('COMMIT1') AND mb.status = 'pending'
  ORDER BY mb.created_at
  LIMIT 1;
  PERFORM t_ok('J: the live commitment has a pending individual bid to accept', v_indent IS NOT NULL);
  SELECT count(*) INTO v_trips FROM public.trips;
  UPDATE public.market_bids
  SET status = 'accepted'
  WHERE indent_id = v_indent AND bidder_organization_id = t_id('B1') AND status = 'pending';
  SELECT awarded_count, status INTO v_awarded, v_status
  FROM public.market_lane_bid_commits WHERE id = t_id('COMMIT1');
  PERFORM t_ok('J: the bid is accepted and still linked to the commitment',
    (SELECT status FROM public.market_bids
      WHERE indent_id = v_indent AND bidder_organization_id = t_id('B1')) = 'accepted'
    AND (SELECT lane_commit_id FROM public.market_bids
      WHERE indent_id = v_indent AND bidder_organization_id = t_id('B1')) = v_before);
  PERFORM t_ok('J: acceptance does not consume awarded_count or change commitment status',
    v_awarded = 0 AND v_status = 'active', v_awarded::text || ' ' || v_status);
  PERFORM t_ok('J: acceptance inserts no trip', (SELECT count(*) FROM public.trips) = v_trips);
END $$;

-- F. Cancellation.
DO $$
DECLARE v_new uuid; v_pending int; v_accepted int;
BEGIN
  SELECT count(*) INTO v_pending FROM public.market_bids
  WHERE lane_commit_id = t_id('COMMIT1') AND status = 'pending';
  SELECT count(*) INTO v_accepted FROM public.market_bids
  WHERE lane_commit_id = t_id('COMMIT1') AND status = 'accepted';
  PERFORM t_exec_as(t_id('u_bid1'), format(
    'SELECT public.withdraw_marketplace_lane_rate(%L)', t_id('COMMIT1')));
  v_new := t_indent(t_id('SHIP1'), 'Pune', 'Mumbai', '32FT');
  PERFORM t_ok('F: cancellation marks the commitment withdrawn',
    (SELECT status FROM public.market_lane_bid_commits WHERE id = t_id('COMMIT1')) = 'withdrawn');
  PERFORM t_ok('F: a new matching load receives no bid from it',
    NOT EXISTS (SELECT 1 FROM public.market_bids
      WHERE indent_id = v_new AND bidder_organization_id = t_id('B1')));
  PERFORM t_ok('F: pending and accepted bids already placed remain',
    (SELECT count(*) FROM public.market_bids
      WHERE lane_commit_id = t_id('COMMIT1') AND status = 'pending') = v_pending
    AND (SELECT count(*) FROM public.market_bids
      WHERE lane_commit_id = t_id('COMMIT1') AND status = 'accepted') = v_accepted
    AND v_accepted >= 1);
  PERFORM t_ok('F: the other carrier bid remains',
    (SELECT status FROM public.market_bids
      WHERE indent_id = t_id('L_A') AND bidder_organization_id = t_id('B2')) = 'pending');
END $$;

-- Fresh commitment for lane change. Nashik is the new lane.
SELECT t_exec_as(t_id('u_bid1'), format(
  $q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', 'Mumbai', '32FT', 30000, 2, now(), false)$q$,
  t_id('B1')));
SELECT t_exec_as(t_id('u_bid1'), format(
  $q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', 'Nashik', '32FT', 31000, 2, now(), false)$q$,
  t_id('B1')));

-- G. Lane change.
DO $$
DECLARE v_mumbai uuid; v_nashik uuid; v_load uuid; v_b2 int;
BEGIN
  SELECT id INTO v_mumbai FROM public.market_lane_bid_commits
  WHERE bidder_organization_id = t_id('B1') AND status = 'active'
    AND pickup_area = 'Pune' AND drop_location = 'Mumbai';
  SELECT id INTO v_nashik FROM public.market_lane_bid_commits
  WHERE bidder_organization_id = t_id('B1') AND status = 'active'
    AND drop_location = 'Nashik';
  v_load := t_indent(t_id('SHIP2'), 'Pune', 'Mumbai', '32FT');
  INSERT INTO t_ids VALUES ('L_MOVE', v_load);
  PERFORM t_ok('G: the Mumbai commitment placed one pending bid',
    (SELECT count(*) FROM public.market_bids
      WHERE indent_id = v_load AND bidder_organization_id = t_id('B1')
        AND lane_commit_id = v_mumbai AND status = 'pending') = 1);

  UPDATE public.indents
  SET drop_location = 'Nashik'
  WHERE id = v_load;
  PERFORM t_ok('G: the pending offer moves to the Nashik commitment',
    (SELECT count(*) FROM public.market_bids
      WHERE indent_id = v_load AND bidder_organization_id = t_id('B1')) = 1
    AND (SELECT status FROM public.market_bids
      WHERE indent_id = v_load AND lane_commit_id = v_nashik) = 'pending'
    AND (SELECT amount FROM public.market_bids
      WHERE indent_id = v_load AND lane_commit_id = v_nashik) = 31000);
  PERFORM t_ok('G: no pending bid remains on the Mumbai commitment',
    NOT EXISTS (SELECT 1 FROM public.market_bids
      WHERE indent_id = v_load AND lane_commit_id = v_mumbai AND status = 'pending'));
  PERFORM t_ok('G: accepted bids on the old lane stay accepted',
    (SELECT status FROM public.market_bids WHERE indent_id = t_id('L_ACC')) = 'accepted'
    AND (SELECT amount FROM public.market_bids WHERE indent_id = t_id('L_ACC')) = 30000);

  SELECT count(*) INTO v_b2 FROM public.market_bids WHERE bidder_organization_id = t_id('B2');
  UPDATE public.indents SET drop_location = 'Nashik' WHERE id = v_load;
  PERFORM t_ok('G: repeating the lane update does not add another bid',
    (SELECT count(*) FROM public.market_bids
      WHERE indent_id = v_load AND bidder_organization_id = t_id('B1') AND status = 'pending') = 1
    AND (SELECT count(*) FROM public.market_bids WHERE bidder_organization_id = t_id('B2')) = v_b2);
END $$;

-- Security.
SELECT t_err_as('Security: another org cannot commit for B1', t_id('u_other'),
  format($q$SELECT public.commit_marketplace_lane_rate(%L, 'Pune', 'Mumbai', '32FT', 30000, 2, now() + interval '1 day', true)$q$, t_id('B1')),
  'unauthorized');
SELECT t_err_as('Security: another org cannot withdraw B1', t_id('u_other'),
  format('SELECT public.withdraw_marketplace_lane_rate(%L)', t_id('COMMIT1')),
  'unauthorized');
SELECT t_ok('Security: another org cannot read B1 commitments',
  (t_exec_as(t_id('u_other'), 'SELECT to_jsonb(count(*)) FROM public.market_lane_bid_commits'))::text = '0');
SELECT t_err_as('Security: authenticated cannot call apply directly', t_id('u_ship'),
  format('SELECT public.apply_standing_lane_bids(%L)', t_id('L_A')),
  'permission denied');

-- I. A forced failure inside attach is logged and does not roll back the indent.
DO $$
DECLARE v_def text; v_load uuid; v_warn text;
BEGIN
  SELECT pg_get_functiondef('public._attach_market_lane_commit(uuid,uuid)'::regprocedure) INTO v_def;

  CREATE OR REPLACE FUNCTION public._attach_market_lane_commit(p_commit_id uuid, p_indent_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $fn$
  BEGIN
    INSERT INTO public.market_bids (
      indent_id, bidder_type, bidder_user_id, bidder_organization_id, amount, status
    ) VALUES (
      p_indent_id, 'organization', 'e2000000-0000-0000-0000-000000000002',
      'e1000000-0000-0000-0000-000000000003', 1, 'pending'
    );
    RAISE EXCEPTION 'forced_attach_failure';
  END;
  $fn$;

  BEGIN
    INSERT INTO public.indents (
      organization_id, indent_number, pickup_area, drop_location, vehicle_type,
      circulation_target, status, supplier_target, client_name, load_type, pickup_date, weight
    ) VALUES (
      t_id('SHIP1'), 'T-fail', 'Pune', 'Mumbai', '32FT',
      'marketplace', 'open', 20000, 'Client', 'FTL', DATE '2026-10-10', 9000
    ) RETURNING id INTO v_load;
  EXCEPTION WHEN OTHERS THEN
    v_warn := SQLERRM;
  END;

  PERFORM t_ok('I: the indent insert still commits when attach raises',
    v_load IS NOT NULL AND v_warn IS NULL, coalesce(v_warn, 'no indent'));
  PERFORM t_ok('I: the partial bid written before the failure is not kept',
    NOT EXISTS (SELECT 1 FROM public.market_bids WHERE indent_id = v_load));

  EXECUTE v_def;

  UPDATE public.indents SET circulation_target = 'both' WHERE id = v_load;
  PERFORM t_ok('I: a later update applies the live commitment',
    EXISTS (SELECT 1 FROM public.market_bids
      WHERE indent_id = v_load AND bidder_organization_id = t_id('B1')
        AND status = 'pending' AND amount = 30000));
END $$;

SELECT t_done();
