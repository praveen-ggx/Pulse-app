-- After 20271116100100: the unchanged contract and the rows-only walk.
CREATE TEMP TABLE hub_after_wrapper ON COMMIT DROP AS
SELECT c.case_id, w.* FROM hub_cases c, LATERAL pg_temp.hub_walk(c, 'list_org_hub_trips_keyset', 'list_org_hub_trips_keyset') w;
CREATE TEMP TABLE hub_after_rows ON COMMIT DROP AS
SELECT c.case_id, w.* FROM hub_cases c, LATERAL pg_temp.hub_walk(c, 'list_org_hub_trips_keyset', 'list_org_hub_trips_keyset_rows') w;

SELECT 'cases' AS check_name, count(*)::text AS n, string_agg(DISTINCT c.kind, ',') AS detail FROM hub_cases c
UNION ALL SELECT 'trips_walked', sum(cardinality(b.ids))::text, 'max_pages=' || max(b.pages) FROM hub_before b
UNION ALL SELECT 'wrapper_vs_before_every_page_identical', count(*) FILTER (WHERE a.pages_md5 IS DISTINCT FROM b.pages_md5)::text || ' mismatches', NULL
  FROM hub_before b JOIN hub_after_wrapper a USING (case_id)
UNION ALL SELECT 'rows_walk_vs_before_rows_identical', count(*) FILTER (WHERE r.rows_md5 IS DISTINCT FROM b.rows_md5 OR r.ids IS DISTINCT FROM b.ids)::text || ' mismatches', NULL
  FROM hub_before b JOIN hub_after_rows r USING (case_id)
UNION ALL SELECT 'first_page_counts_identical', count(*) FILTER (WHERE r.first_counts IS DISTINCT FROM b.first_counts)::text || ' mismatches', NULL
  FROM hub_before b JOIN hub_after_rows r USING (case_id)
UNION ALL SELECT 'counts_null_on_later_rows_pages', count(*) FILTER (WHERE NOT r.later_counts_null)::text || ' violations', NULL FROM hub_after_rows r
UNION ALL SELECT 'duplicate_ids_in_any_walk', count(*) FILTER (WHERE cardinality(r.ids) <> (SELECT count(DISTINCT x) FROM unnest(r.ids) x))::text, NULL FROM hub_after_rows r
UNION ALL SELECT 'walk_total_equals_count', count(*) FILTER (WHERE (r.first_counts ->> 'total')::bigint IS DISTINCT FROM cardinality(r.ids)::bigint AND c.bucket = 'all')::text || ' mismatches (bucket all)', NULL
  FROM hub_after_rows r JOIN hub_cases c USING (case_id)
UNION ALL SELECT 'ms_multi_page_walks', round(sum(b.ms) FILTER (WHERE b.pages > 2))::text || ' before',
  round(sum(r.ms) FILTER (WHERE b.pages > 2))::text || ' after (rows pages)'
  FROM hub_before b JOIN hub_after_rows r USING (case_id)
UNION ALL SELECT 'grants', has_function_privilege('authenticated', 'public._list_org_hub_trips_keyset_impl(uuid, integer, timestamptz, uuid, date, date, text, text, uuid, text, uuid, text, text, text, uuid, uuid, text, text, boolean, boolean)', 'EXECUTE')::text,
  'rows_fn_authenticated=' || has_function_privilege('authenticated', 'public.list_org_hub_trips_keyset_rows(uuid, integer, timestamptz, uuid, date, date, text, text, uuid, text, uuid, text, text, text, uuid, uuid, text, text, boolean)', 'EXECUTE')
  || ' anon=' || has_function_privilege('anon', 'public.list_org_hub_trips_keyset_rows(uuid, integer, timestamptz, uuid, date, date, text, text, uuid, text, uuid, text, text, text, uuid, uuid, text, text, boolean)', 'EXECUTE');
