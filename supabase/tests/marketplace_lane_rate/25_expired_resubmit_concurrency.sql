-- Disposable full-schema DB. Commits one fixture, races two submissions, then deletes it.
\set ON_ERROR_STOP 1
CREATE EXTENSION IF NOT EXISTS dblink;
BEGIN;
SELECT t.mk_indent('RS_RACE', 'SHIP', 'U_SHIP', 'Pune', 'Kolhapur');
SELECT t.as_user(t.id('U_CAR'), format(
  'SELECT public.submit_market_bid(%L, 30000, NULL, %L, NULL)', t.id('RS_RACE'), t.id('CAR')));
UPDATE public.market_bids
SET created_at = now() - interval '50 hours', expires_at = now() - interval '1 hour'
WHERE indent_id = t.id('RS_RACE');
COMMIT;

SELECT dblink_connect('a', 'host=127.0.0.1 dbname=postgres user=postgres');
SELECT dblink_connect('b', 'host=127.0.0.1 dbname=postgres user=postgres');
SELECT dblink_send_query('a', format($q$
  SELECT public.submit_market_bid(%L, 28100, NULL, %L, NULL)::text
  FROM (SELECT set_config('request.jwt.claims', json_build_object('sub', %L, 'role', 'authenticated')::text, false),
               set_config('request.jwt.claim.sub', %L, false)) s;
$q$, t.id('RS_RACE'), t.id('CAR'), t.id('U_CAR')::text, t.id('U_CAR')::text));
SELECT dblink_send_query('b', format($q$
  SELECT public.submit_market_bid(%L, 28200, NULL, %L, NULL)::text
  FROM (SELECT set_config('request.jwt.claims', json_build_object('sub', %L, 'role', 'authenticated')::text, false),
               set_config('request.jwt.claim.sub', %L, false)) s;
$q$, t.id('RS_RACE'), t.id('CAR'), t.id('U_CAR')::text, t.id('U_CAR')::text));
SELECT * FROM dblink_get_result('a') AS t(result text);
SELECT * FROM dblink_get_result('a') AS t(result text);
SELECT * FROM dblink_get_result('b') AS t(result text);
SELECT * FROM dblink_get_result('b') AS t(result text);

SELECT status, amount, count(*) FROM public.market_bids
WHERE indent_id = t.id('RS_RACE') GROUP BY status, amount ORDER BY status, amount;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.market_bids WHERE indent_id = t.id('RS_RACE') AND status = 'pending') <> 1 THEN
    RAISE EXCEPTION 'FAIL concurrent resubmit created more than one pending bid';
  END IF;
  IF (SELECT count(*) FROM public.market_bids WHERE indent_id = t.id('RS_RACE') AND status = 'expired') <> 1 THEN
    RAISE EXCEPTION 'FAIL concurrent resubmit did not keep the expired history';
  END IF;
  RAISE NOTICE 'PASS concurrent resubmit: one pending bid and the expired history';
END $$;

DELETE FROM public.market_bids WHERE indent_id = t.id('RS_RACE');
DELETE FROM public.indents WHERE id = t.id('RS_RACE');
SELECT dblink_disconnect('a');
SELECT dblink_disconnect('b');
