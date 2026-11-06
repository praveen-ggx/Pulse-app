SELECT
  now() AS observed_at,
  (SELECT count(*) FROM pg_stat_activity) AS sessions_total,
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') AS sessions_active,
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') AS sessions_idle,
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction') AS sessions_idle_in_xact,
  (SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock') AS sessions_lock_wait,
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction' AND now() - state_change > interval '5 seconds') AS idle_in_xact_over_5s;
