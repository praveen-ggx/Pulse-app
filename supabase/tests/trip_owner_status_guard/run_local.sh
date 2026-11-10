#!/usr/bin/env bash
# Throwaway Postgres only. Never a linked Supabase project.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
PORT=${PGPORT:?set PGPORT to a disposable local Postgres}
PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS trip_owner_status_guard"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE trip_owner_status_guard"
"${PSQL[@]}" -d trip_owner_status_guard -f "$HERE/00_stub.sql"
"${PSQL[@]}" -d trip_owner_status_guard -f "$REPO/supabase/migrations/20261110023000_trip_owner_status_action_guard.sql"
out="$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d trip_owner_status_guard -At -F ' | ' -f "$HERE/02_cases.sql" 2>&1)"
echo "$out" | grep -E "PASS|FAIL"
if echo "$out" | grep -q "FAIL"; then
  echo "$out"
  exit 1
fi

# Concurrent status change: Trip Ops revoke waits on a lock, then sees completed.
"${PSQL[@]}" -d trip_owner_status_guard -c "UPDATE public.trips SET status = 'in_transit' WHERE id = '30000000-0000-0000-0000-000000000005'"
psql -h 127.0.0.1 -p "$PORT" -U postgres -d trip_owner_status_guard -v ON_ERROR_STOP=1 -c \
  "BEGIN; SELECT id FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000005' FOR UPDATE; SELECT pg_sleep(2); UPDATE public.trips SET status = 'completed' WHERE id = '30000000-0000-0000-0000-000000000005'; COMMIT;" \
  >/tmp/trip-guard-locker.out 2>&1 &
locker=$!
sleep 0.4
set +e
psql -h 127.0.0.1 -p "$PORT" -U postgres -d trip_owner_status_guard -v ON_ERROR_STOP=1 -c \
  "SET ROLE authenticated; SET request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001'; UPDATE public.trips SET status = 'in_progress' WHERE id = '30000000-0000-0000-0000-000000000005';" \
  >/tmp/trip-guard-racer.out 2>&1
race_rc=$?
set -e
wait "$locker"
if [[ "$race_rc" -eq 0 ]]; then
  echo "FAIL concurrent revoke was allowed"
  cat /tmp/trip-guard-racer.out
  exit 1
fi
if ! grep -q "trip_revoke_delivered_owner_only" /tmp/trip-guard-racer.out; then
  echo "FAIL concurrent revoke failed for a different reason"
  cat /tmp/trip-guard-racer.out
  exit 1
fi
status="$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d trip_owner_status_guard -At -c "SELECT status FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000005'")"
if [[ "$status" != "completed" ]]; then
  echo "FAIL concurrent trip status is $status"
  exit 1
fi
echo "PASS concurrent revoke sees completed and does not write"
