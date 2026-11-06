SELECT now() AS checked_at;

SELECT
  count(*) AS sessions,
  count(*) FILTER (WHERE state = 'active') AS active,
  count(*) FILTER (WHERE state = 'idle') AS idle,
  count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_tx,
  count(*) FILTER (WHERE wait_event_type = 'Lock') AS waiting_lock,
  count(*) FILTER (WHERE state = 'active' AND query_start < now() - interval '5 seconds') AS active_gt_5s
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid();

SHOW max_connections;

SELECT current_setting('max_connections')::int AS max_conn,
       (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS used,
       round(
         100.0 * (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database())
         / current_setting('max_connections')::int
       , 1) AS used_pct;

SELECT jobid, jobname, active, schedule
FROM cron.job
ORDER BY jobid;

SELECT
  count(*) FILTER (WHERE status = 'failed' AND start_time > now() - interval '15 minutes') AS failed_15m,
  count(*) FILTER (WHERE start_time > now() - interval '15 minutes') AS ran_15m
FROM cron.job_run_details;
