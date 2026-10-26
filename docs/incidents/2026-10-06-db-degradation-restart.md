# 2026-10-06: production database degradation and manual restart

Status: root cause identified; remedy needs an operator compute decision. Evidence is
read-only (Postgres, PostgREST and edge logs, `pg_stat_statements`, project status). No
production changes were made during the investigation.

## Root cause

The production database runs on the **Nano** compute size (shared, burstable CPU,
0.5 GB RAM; recorded in `docs/CHAT_ROOT_CAUSE.md` / `CHAT_ROOT_CAUSE_DISPROVE.md` as the
"60-connection nano pool"; current size to be confirmed in the dashboard). Normal daytime
load (5–8k API requests/hour) saturates its CPU. Once the instance's burst capacity is
spent it runs at a throttled baseline and every statement slows down, including trivial
catalog calls. A restart does not restore burst capacity, so the problem returned
minutes after the 11:17 UTC restart.

### Evidence

1. **CPU-bound, not disk or query volume.** Since the restart, statements read almost
   nothing from disk (worst: 900 blocks ≈ 7 MB) yet averaged 5–18 s; at the time of
   sampling zero client queries were active. Total statement time was 2,166 s in
   1,199 s wall-clock.
2. **Trivial calls ran 1,000× slower:** `SELECT name FROM pg_timezone_names` 90 s,
   `pg_database_size` 24 s, `pgbouncer.get_auth` 39 s, `pg_ls_archive_statusdir()` 19 s.
3. **Chronic daily pattern, tracking load:** REST average 120–380 ms at night versus
   1.2–2 s (p95 6–10 s) during daytime on both Oct 5 and Oct 6. Today at 11:00 UTC the
   average was 4.6 s (p95 18 s) on only 1,321 requests, i.e. slower with less traffic,
   which is throttling rather than load.
4. **No other resource limit:** no connection-slot exhaustion, no out-of-memory, no
   disk-full messages.

### Amplifiers (make the throttle worse, do not start it)

- **PostgREST restart loop.** When PostgREST cannot load its schema cache (PGRST002,
  146–479/hour at daytime peaks) it reconnects and rebuilds the pool ("Connection Pool
  initialized" 4–16/hour), and each rebuild reloads the schema cache: 199 relations,
  538 functions, 1,194 timezones, costing 30–90 s of throttled CPU each time. The
  PostgREST pool is 10 connections, so slow requests also produce PGRST003 (pool
  timeouts), 504s and idle-in-transaction kills.
- **Explicit `NOTIFY pgrst` reloads** (106 between Oct 5 19:11 and Oct 6 08:58, none after
  06:00 UTC) came from migration/DDL work overnight. Not a daytime driver, but each one
  costs a full schema reload on a small instance.
- **Operator tooling.** `supabase db query --linked` / `migration list` run a
  migration-history check and create a temporary login role on every call: about 14% of
  all statement time after the restart came from these CLI checks.
- **Expensive RLS planning** on hot tables (see `docs/CHAT_ROOT_CAUSE.md`) is CPU work
  that a Nano instance has little headroom for.

### User impact (log export 11:23–11:33 UTC)

Five distinct signed-in users on the production web app (`gogopulse.com`, Chrome on
Windows) received 500s, mostly from `get_connection_partner_display_batch` (12 of 17), plus
`get_global_app_bootstrap`, `get_network_feed` and `market_indents_for_org`. That
function is a set-based `SECURITY DEFINER` lookup over a ≤24-id array on small tables
(`20270920124500`): a victim of the CPU throttle hitting the statement timeout, not a
cause. The ~30 s repeat per user is the page's normal refetch, which adds little load.

### Not the cause

- Driver Execution Authority release: no `driver_execute_command` traffic in or after the
  window (one real command since release, 01:02 UTC).
- Request storms: the busiest endpoints were about 300 requests per two hours.

## Timeline (UTC)

| Time | Event |
|---|---|
| 09:00–11:06 | Idle-in-transaction terminations of PostgREST sessions: 59 (09:00 h), 124 (10:00 h) vs Oct 5: 4, 45 |
| 10:00–11:00 | Daytime authority window: 3,610 requests, 59 5xx, 5 Auth 5xx (Oct 5: 6,008 / 73 / 0); 0 driver commands |
| 11:11–11:12 | Trivial internal calls stall (24–39 s); statement timeouts, broken pipes |
| ~11:13 | Manual restart from the dashboard |
| 11:17:09 | Postmaster start; project `ACTIVE_HEALTHY` |
| 11:25–11:35 | Degraded again: 36 + 34 statement timeouts per 5 min; CLI and management API connection timeouts |

## Fix

1. **Remedy (operator, dashboard, billing):** Project Settings → Compute and Disk, move
   off Nano to at least Small (dedicated baseline CPU, 2 GB RAM); Medium if budget allows.
   This is an instance resize, not a migration or code change, and causes a short
   restart. Confirm the current size and CPU graph in Reports → Database first.
2. **Immediate load relief while deciding:** stop local dev servers pointed at
   production when not in use; avoid repeated `supabase db query --linked` /
   `migration list` runs; do not push migrations (each ends in `NOTIFY pgrst`) until
   resized.
3. **Follow-ups after resize (separate, reviewed changes):** RLS planning cost on hot
   tables, PostgREST schema size, and the daytime query budget in
   `docs/DB_LOAD_ARCHITECTURE_REVIEW.md`.

## Release impact

- Step A + Step B acceptance: **held** (no real driver-command traffic in the window and
  the database was unhealthy).
- No push, migration, or production mutation until the database is resized or stable and a
  window with real driver traffic is observed clean.
