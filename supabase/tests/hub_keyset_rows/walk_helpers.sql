-- Session-temporary helpers for the hub keyset equivalence check. No ids printed.
CREATE TEMP TABLE hub_cases ON COMMIT DROP AS
WITH big AS (
  SELECT t.organization_id AS org FROM public.trips t GROUP BY 1 ORDER BY count(*) DESC LIMIT 2
), gops AS (
  SELECT om.organization_id AS org, om.user_id AS uid FROM public.organization_members om
  WHERE om.status = 'active' AND coalesce(om.permissions ->> 'platformRole', '') = 'ground_ops'
  ORDER BY om.organization_id, om.user_id LIMIT 2
), admins AS (
  SELECT b.org, (SELECT om.user_id FROM public.organization_members om
                 WHERE om.organization_id = b.org AND om.status = 'active' AND om.role IN ('owner', 'admin')
                   AND coalesce(om.permissions ->> 'platformRole', '') <> 'ground_ops'
                 ORDER BY om.role DESC, om.user_id LIMIT 1) AS uid
  FROM big b
), who AS (
  SELECT org, uid, 'admin' AS kind FROM admins WHERE uid IS NOT NULL
  UNION ALL SELECT org, uid, 'ground_ops' FROM gops
), params AS (
  SELECT * FROM (VALUES
    ('all', 'either', 'all', 'all', false, 'all', NULL::int, 100),
    ('active', 'either', 'all', 'all', false, 'all', NULL, 100),
    ('history', 'either', 'all', 'all', false, 'all', NULL, 100),
    ('cancelled', 'either', 'all', 'all', false, 'all', NULL, 100),
    ('closed', 'either', 'all', 'all', false, 'all', NULL, 100),
    ('all', 'either', 'all', 'all', false, 'all', 30, 100),
    ('all', 'either', 'all', 'all', false, 'all', 7, 7),
    ('all', 'owner', 'all', 'all', false, 'all', NULL, 100),
    ('all', 'supplier', 'all', 'all', false, 'all', NULL, 100),
    ('all', 'either', 'asset', 'all', false, 'all', NULL, 100),
    ('active', 'either', 'all', 'pending', false, 'all', NULL, 100),
    ('all', 'either', 'all', 'all', true, 'all', NULL, 100),
    ('all', 'either', 'all', 'all', false, 'attributed', NULL, 100),
    ('history', 'either', 'all', 'all', false, 'all', 90, 7)
  ) v(bucket, side, supply, payment, compliance, attributed, days, page_size)
)
SELECT row_number() OVER () AS case_id, w.org, w.uid, w.kind, p.*
FROM who w CROSS JOIN params p;

CREATE FUNCTION pg_temp.hub_page(fn text, c hub_cases, cur_at timestamptz, cur_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  EXECUTE format(
    'SELECT public.%I(p_org_id => $1, p_limit => $2, p_before_created_at => $3, p_before_id => $4,
       p_from => $5, p_to => $6, p_bucket => $7, p_side => $8, p_supply => $9, p_payment => $10,
       p_compliance => $11, p_attributed => $12)', fn)
  INTO r
  USING c.org, c.page_size, cur_at, cur_id,
    CASE WHEN c.days IS NULL THEN NULL ELSE (current_date - c.days) END,
    CASE WHEN c.days IS NULL THEN NULL ELSE current_date END,
    c.bucket, c.side, c.supply, c.payment, c.compliance, c.attributed;
  RETURN r;
END $f$;

-- Walk every page. first_fn serves page 1, next_fn every later page.
CREATE FUNCTION pg_temp.hub_walk(c hub_cases, first_fn text, next_fn text)
RETURNS TABLE (ids uuid[], rows_md5 text, pages_md5 text, first_counts jsonb, later_counts_null boolean, pages int, ms numeric)
LANGUAGE plpgsql AS $f$
DECLARE
  p jsonb; rs jsonb; cur_at timestamptz; cur_id uuid; t0 timestamptz := clock_timestamp();
  all_rows text := ''; all_pages text := ''; n int := 0;
BEGIN
  ids := '{}'; later_counts_null := true;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c.uid, 'role', 'authenticated')::text, true);
  LOOP
    p := pg_temp.hub_page(CASE WHEN n = 0 THEN first_fn ELSE next_fn END, c, cur_at, cur_id);
    n := n + 1;
    IF p IS NULL THEN EXIT; END IF;
    rs := coalesce(p -> 'rows', '[]'::jsonb);
    IF n = 1 THEN
      first_counts := p - 'rows';
    ELSIF next_fn = 'list_org_hub_trips_keyset_rows' THEN
      later_counts_null := later_counts_null AND (p - 'rows') = jsonb_build_object(
        'total', NULL, 'active_count', NULL, 'history_count', NULL, 'cancelled_count', NULL,
        'bucket_count', NULL, 'attributed_count', NULL);
    END IF;
    all_rows := all_rows || rs::text;
    all_pages := all_pages || CASE WHEN next_fn = 'list_org_hub_trips_keyset_rows' AND n > 1 THEN rs::text ELSE p::text END;
    ids := ids || ARRAY(SELECT (e ->> 'id')::uuid FROM jsonb_array_elements(rs) e);
    EXIT WHEN jsonb_array_length(rs) < c.page_size OR n > 400;
    cur_at := (rs -> (jsonb_array_length(rs) - 1) ->> 'created_at')::timestamptz;
    cur_id := (rs -> (jsonb_array_length(rs) - 1) ->> 'id')::uuid;
  END LOOP;
  rows_md5 := md5(all_rows); pages_md5 := md5(all_pages); pages := n;
  ms := extract(epoch FROM clock_timestamp() - t0) * 1000;
  RETURN NEXT;
END $f$;
