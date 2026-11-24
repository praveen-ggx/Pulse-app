-- Pause overlapping diagnostic crons that hold pool connections during
-- the 2026-09-21 unhealthy cascade. Reach / prune / catalog ANALYZE stay on.
-- Requires a role that can UPDATE cron.job (postgres). Login/API roles cannot.

UPDATE cron.job
SET active = false
WHERE jobname IN (
  'cron-health-alert',
  'monitor-watchdog',
  'ops_capture_slow_queries',
  'log-watcher-main',
  'log-watcher-health',
  'detect-cron-startup-timeout-incident'
)
-- Job names have drifted; also match by command so job 15/17/18 cannot keep firing.
OR command ILIKE '%dispatch_log_watcher%'
OR command ILIKE '%detect_cron_incident%'
OR command ILIKE '%run_db_health_monitor%'
OR command ILIKE '%run_monitor_watchdog%'
OR command ILIKE '%capture_db_health_snapshot%'
OR command ILIKE '%ops_capture_slow_queries%';
