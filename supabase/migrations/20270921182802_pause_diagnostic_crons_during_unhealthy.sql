-- Pause overlapping diagnostic crons that hold pool connections during
-- the 2026-09-21 unhealthy cascade. Reach / prune / catalog ANALYZE stay on.
-- Requires a role that can UPDATE cron.job. Local replay roles often cannot;
-- the pause is a no-op there. Production applied this while the role could.

DO $pause_diagnostic_crons$
BEGIN
  IF to_regclass('cron.job') IS NULL
     OR NOT has_table_privilege(current_user, 'cron.job', 'UPDATE') THEN
    RAISE NOTICE 'pause diagnostic crons skipped: cron.job is not updatable by %', current_user;
    RETURN;
  END IF;

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
  OR command ILIKE '%dispatch_log_watcher%'
  OR command ILIKE '%detect_cron_incident%'
  OR command ILIKE '%run_db_health_monitor%'
  OR command ILIKE '%run_monitor_watchdog%'
  OR command ILIKE '%capture_db_health_snapshot%'
  OR command ILIKE '%ops_capture_slow_queries%';
END
$pause_diagnostic_crons$;
