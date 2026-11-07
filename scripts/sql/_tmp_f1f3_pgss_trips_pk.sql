-- READ ONLY: pg_stat_statements for trips PK vs driver view.

SELECT
  left(query, 180) AS query,
  calls,
  round(mean_exec_time::numeric, 1) AS mean_ms,
  round(max_exec_time::numeric, 1) AS max_ms,
  round(min_exec_time::numeric, 1) AS min_ms
FROM pg_stat_statements
WHERE query ILIKE '%from%trips%'
  AND (
    query ILIKE '%id = %'
    OR query ILIKE '%id=%'
    OR query ILIKE '%trips_driver_view%'
  )
  AND query NOT ILIKE '%pg_stat_statements%'
ORDER BY mean_exec_time DESC
LIMIT 25;
