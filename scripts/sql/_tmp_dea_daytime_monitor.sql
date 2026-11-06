-- Driver Execution Authority: read-only daytime health check (release 2026-10-06 00:59:41Z).
-- Run: supabase db query --linked -f scripts/sql/_tmp_dea_daytime_monitor.sql -o table
-- Rejected commands (ok:false) are not persisted; compare successes here with gateway
-- POST /rest/v1/rpc/driver_execute_command counts from edge_logs.
SELECT section, item, value FROM (
  SELECT 1 o, 'commands ok (stored keys)' section,
         coalesce(response_payload->>'command', '?') item,
         count(*)::text || ' ok, ' || count(*) FILTER (WHERE (response_payload->>'applied')::boolean IS FALSE) || ' no-op, '
           || count(DISTINCT user_id) || ' drivers, last ' || max(created_at)::timestamp(0) value
  FROM public.idempotency_keys
  WHERE key LIKE 'driver_command:%' AND created_at > '2026-10-06 00:59:41+00'
  GROUP BY 3
  UNION ALL
  SELECT 2, 'trips moved by driver_command', status, count(*)::text
  FROM public.trips
  WHERE status_change_origin = 'driver_command' AND updated_at > '2026-10-06 00:59:41+00'
  GROUP BY status
  UNION ALL
  SELECT 3, 'trips status writes since release by origin', coalesce(status_change_origin, 'NULL'), count(*)::text
  FROM public.trips WHERE updated_at > '2026-10-06 00:59:41+00'
  GROUP BY status_change_origin
  UNION ALL
  SELECT 4, 'driver_execute_command timing (pg_stat_statements)', 'calls / mean ms / max ms',
         coalesce(sum(calls)::text || ' / ' || round((sum(total_exec_time) / nullif(sum(calls), 0))::numeric, 1)
           || ' / ' || round(max(max_exec_time)::numeric, 1), 'no entries')
  FROM pg_stat_statements WHERE query ILIKE '%driver_execute_command%' AND query NOT ILIKE '%pg_stat_statements%'
  UNION ALL
  SELECT 5, 'db health', 'waiting locks', count(*)::text FROM pg_locks WHERE NOT granted
  UNION ALL
  SELECT 6, 'db health', 'idle in transaction', count(*)::text || coalesce(' (oldest ' || max(now() - state_change)::text || ')', '')
  FROM pg_stat_activity WHERE state LIKE 'idle in transaction%'
  UNION ALL
  SELECT 7, 'db health', 'active > 10s', count(*)::text
  FROM pg_stat_activity WHERE state = 'active' AND backend_type = 'client backend'
    AND now() - query_start > interval '10 seconds' AND pid <> pg_backend_pid()
  UNION ALL
  SELECT 8, 'db health', 'connections (total / active)', count(*)::text || ' / ' || count(*) FILTER (WHERE state = 'active')
  FROM pg_stat_activity
  UNION ALL
  SELECT 9, 'release objects', 'guard triggers enabled',
         string_agg(tgname || '=' || tgenabled::text, ', ')
  FROM pg_trigger WHERE tgname IN ('a_trips_guard_driver_direct_write', 'a_ses_guard_driver_direct_write')
) x ORDER BY o, item;
