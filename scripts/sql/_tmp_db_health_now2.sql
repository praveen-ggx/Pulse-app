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
