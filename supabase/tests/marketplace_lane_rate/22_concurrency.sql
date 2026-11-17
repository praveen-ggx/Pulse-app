-- Concurrent commits and indent inserts. Disposable Postgres only.
-- Requires the 48-hour functions and the fixture orgs from 20_cases_48h.sql.
CREATE EXTENSION IF NOT EXISTS dblink;

DO $$
BEGIN
  PERFORM dblink_connect('c1', 'host=127.0.0.1 dbname=postgres user=postgres password=harness');
  PERFORM dblink_connect('c2', 'host=127.0.0.1 dbname=postgres user=postgres password=harness');
END $$;

-- Two identical submissions. One active row, one bid per load.
SELECT dblink_send_query('c1', $q$
  SELECT public.commit_marketplace_lane_rate(
    'e1000000-0000-0000-0000-000000000003', 'Pune', 'Mumbai', '32FT', 30000, 2, now() + interval '9 days', false)::text
  FROM (SELECT set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000002', false)) cfg;
$q$);
SELECT dblink_send_query('c2', $q$
  SELECT public.commit_marketplace_lane_rate(
    'e1000000-0000-0000-0000-000000000003', 'Pune', 'Mumbai', '32FT', 30000, 2, now() - interval '2 days', false)::text
  FROM (SELECT set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000002', false)) cfg;
$q$);

SELECT * FROM dblink_get_result('c1') AS t(result text);
SELECT * FROM dblink_get_result('c1') AS t(result text);
SELECT * FROM dblink_get_result('c2') AS t(result text);
SELECT * FROM dblink_get_result('c2') AS t(result text);

SELECT t_ok('H: two identical submissions leave one active Mumbai commitment',
  (SELECT count(*) FROM public.market_lane_bid_commits
    WHERE bidder_organization_id = t_id('B1') AND status = 'active' AND drop_location = 'Mumbai') = 1);

-- Two different rates at once.
SELECT dblink_send_query('c1', $q$
  SELECT public.commit_marketplace_lane_rate(
    'e1000000-0000-0000-0000-000000000003', 'Pune', 'Mumbai', '32FT', 30100, 2, now(), false)::text
  FROM (SELECT set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000002', false)) cfg;
$q$);
SELECT dblink_send_query('c2', $q$
  SELECT public.commit_marketplace_lane_rate(
    'e1000000-0000-0000-0000-000000000003', 'Pune', 'Mumbai', '32FT', 30200, 2, now(), false)::text
  FROM (SELECT set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000002', false)) cfg;
$q$);
SELECT * FROM dblink_get_result('c1') AS t(result text);
SELECT * FROM dblink_get_result('c1') AS t(result text);
SELECT * FROM dblink_get_result('c2') AS t(result text);
SELECT * FROM dblink_get_result('c2') AS t(result text);

SELECT t_ok('H: two rate changes leave one active amount and matching pending bids',
  (SELECT amount FROM public.market_lane_bid_commits
    WHERE bidder_organization_id = t_id('B1') AND status = 'active' AND drop_location = 'Mumbai')
    IN (30100, 30200)
  AND (SELECT count(DISTINCT amount) FROM public.market_bids
        WHERE bidder_organization_id = t_id('B1') AND status = 'pending'
          AND lane_commit_id = (
            SELECT id FROM public.market_lane_bid_commits
            WHERE bidder_organization_id = t_id('B1') AND status = 'active' AND drop_location = 'Mumbai'
          )) = 1);
SELECT t_ok('H: the accepted bid survived the concurrent rate changes',
  (SELECT amount FROM public.market_bids WHERE indent_id = t_id('L_ACC')) = 30000
  AND (SELECT status FROM public.market_bids WHERE indent_id = t_id('L_ACC')) = 'accepted');

-- Two new loads at once, then again after the commitment is expired.
SELECT dblink_send_query('c1', $q$
  INSERT INTO public.indents (
    organization_id, indent_number, pickup_area, drop_location, vehicle_type,
    circulation_target, status
  ) VALUES (
    'e1000000-0000-0000-0000-000000000001', 'T-par-1', 'Pune', 'Mumbai', '32FT', 'marketplace', 'open'
  ) RETURNING id::text;
$q$);
SELECT dblink_send_query('c2', $q$
  INSERT INTO public.indents (
    organization_id, indent_number, pickup_area, drop_location, vehicle_type,
    circulation_target, status
  ) VALUES (
    'e1000000-0000-0000-0000-000000000002', 'T-par-2', 'Pune', 'Mumbai', '32FT', 'marketplace', 'open'
  ) RETURNING id::text;
$q$);
SELECT * FROM dblink_get_result('c1') AS t(id text);
SELECT * FROM dblink_get_result('c1') AS t(id text);
SELECT * FROM dblink_get_result('c2') AS t(id text);
SELECT * FROM dblink_get_result('c2') AS t(id text);

SELECT t_ok('H: each concurrent load has one B1 bid',
  (SELECT count(*) FROM public.indents WHERE indent_number IN ('T-par-1', 'T-par-2')) = 2
  AND (SELECT count(*) FROM public.market_bids mb
        JOIN public.indents i ON i.id = mb.indent_id
        WHERE i.indent_number IN ('T-par-1', 'T-par-2')
          AND mb.bidder_organization_id = t_id('B1')) = 2
  AND NOT EXISTS (
    SELECT 1 FROM public.market_bids mb
    JOIN public.indents i ON i.id = mb.indent_id
    WHERE i.indent_number IN ('T-par-1', 'T-par-2') AND mb.bidder_organization_id = t_id('B1')
    GROUP BY mb.indent_id, mb.bidder_user_id
    HAVING count(*) > 1
  ));

SELECT dblink_exec('c1', $q$
  UPDATE public.market_lane_bid_commits
  SET valid_until = now() - interval '1 second'
  WHERE bidder_organization_id = 'e1000000-0000-0000-0000-000000000003'
    AND status = 'active' AND drop_location = 'Mumbai';
$q$);

SELECT dblink_send_query('c2', $q$
  INSERT INTO public.indents (
    organization_id, indent_number, pickup_area, drop_location, vehicle_type,
    circulation_target, status
  ) VALUES (
    'e1000000-0000-0000-0000-000000000001', 'T-exp-1', 'Pune', 'Mumbai', '32FT', 'marketplace', 'open'
  ) RETURNING id::text;
$q$);
SELECT * FROM dblink_get_result('c2') AS t(id text);
SELECT * FROM dblink_get_result('c2') AS t(id text);

SELECT t_ok('H: a load created after expiry gets no bid and does not revive the row',
  EXISTS (SELECT 1 FROM public.indents WHERE indent_number = 'T-exp-1')
  AND NOT EXISTS (
    SELECT 1 FROM public.market_bids mb
    JOIN public.indents i ON i.id = mb.indent_id
    WHERE i.indent_number = 'T-exp-1' AND mb.bidder_organization_id = t_id('B1')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.market_lane_bid_commits
    WHERE bidder_organization_id = t_id('B1') AND drop_location = 'Mumbai' AND status = 'active'
  ));

SELECT dblink_disconnect('c1');
SELECT dblink_disconnect('c2');
SELECT t_done();
