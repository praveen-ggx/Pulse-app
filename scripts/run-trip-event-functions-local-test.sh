#!/usr/bin/env bash
# Runs supabase/tests/trip_event_functions.local.sql on a throwaway local Postgres (stub tables, no Supabase,
# no network). Applies the three event-function migrations in order, then the assertions.
# Usage: bash scripts/run-trip-event-functions-local-test.sh      (needs Homebrew postgresql@15)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@15/bin}"
D="$(mktemp -d)"; PORT=55433
cleanup() { "$PGBIN/pg_ctl" -D "$D" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$D"; }
trap cleanup EXIT
"$PGBIN/initdb" -D "$D" -A trust >/dev/null
"$PGBIN/pg_ctl" -D "$D" -o "-p $PORT -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
P=("$PGBIN/psql" -h "$D" -p "$PORT" -d postgres -X -q -v ON_ERROR_STOP=1)
"${P[@]}" -f "$ROOT/supabase/tests/trip_event_functions.stub.sql"
MIGS="20261125124952_record_trip_workflow_event 20261125132909_record_trip_operational_timeline_event 20261125142041_harden_trip_event_functions"
# SKIP_HARDENING=1 applies only the first two migrations: the assertions that cover the review findings must then FAIL.
[ "${SKIP_HARDENING:-0}" = "1" ] && MIGS="20261125124952_record_trip_workflow_event 20261125132909_record_trip_operational_timeline_event"
for f in $MIGS; do
  "${P[@]}" -f "$ROOT/supabase/migrations/$f.sql"
done
"${P[@]}" -A -t -F ' | ' -f "$ROOT/supabase/tests/trip_event_functions.local.sql" 2>&1 | grep -E "PASS|FAIL|CHECKS|ERROR"
