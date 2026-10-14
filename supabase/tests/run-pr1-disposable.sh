#!/bin/sh
# Run PR #1 guard checks on a throwaway database inside the local Supabase
# Postgres container. Refuses any non-local target. Drops the database after.
set -eu
cd "$(dirname "$0")/../.."
CONTAINER="${PR1_PG_CONTAINER:-supabase_db_pulse}"
DB="${PR1_DISPOSABLE_DB:-pr1_guard}"
case "$CONTAINER" in
  *pooler*|*prod*|*nafxpivddesgsrthmosv*) echo "refusing non-local container" >&2; exit 2 ;;
esac

psql_exec() {
  docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 "$@"
}

docker exec "$CONTAINER" psql -U postgres -c "REVOKE pr1_caller FROM postgres; DROP ROLE IF EXISTS pr1_caller;" >/dev/null 2>&1 || true
docker exec "$CONTAINER" rm -rf /tmp/pr1
docker exec "$CONTAINER" mkdir -p /tmp/pr1
docker cp supabase/migrations "$CONTAINER:/tmp/pr1/migrations"
docker cp supabase/tests "$CONTAINER:/tmp/pr1/tests"

docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB' AND pid <> pg_backend_pid();" >/dev/null || true
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$DB\";"
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DB\";"

cleanup() {
  docker exec "$CONTAINER" psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB' AND pid <> pg_backend_pid();" >/dev/null || true
  docker exec "$CONTAINER" psql -U postgres -c "DROP DATABASE IF EXISTS \"$DB\";" >/dev/null || true
  docker exec "$CONTAINER" psql -U postgres -c "REVOKE pr1_caller FROM postgres; DROP ROLE IF EXISTS pr1_caller;" >/dev/null 2>&1 || true
  docker exec "$CONTAINER" rm -rf /tmp/pr1 >/dev/null || true
}
trap cleanup EXIT

docker exec "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -f /tmp/pr1/tests/pr1_disposable_guards.sql
awk '
  /create or replace function public.issue_payment_request\(/ { capture=1 }
  capture { print }
  capture && /^\$\$;/ { exit }
' supabase/migrations/20271013101500_payment_requests.sql | psql_exec -d "$DB"
docker exec "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -f /tmp/pr1/tests/pr1_payment_concurrency.sql
docker exec "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -f /tmp/pr1/tests/pr1_payment_race.sql

race_trip='14141414-1414-1414-1414-141414141414'
docker exec "$CONTAINER" sh /tmp/pr1/tests/pr1_run_race.sh "$DB" > /tmp/pr1-race-ids
id_a="$(awk '{print $1}' /tmp/pr1-race-ids)"
id_b="$(awk '{print $2}' /tmp/pr1-race-ids)"
rm -f /tmp/pr1-race-ids
if [ -z "$id_a" ] || [ "$id_a" != "$id_b" ]; then
  echo "concurrent issue_payment_request did not return one id" >&2
  echo "session A: ${id_a:-<empty>}" >&2
  echo "session B: ${id_b:-<empty>}" >&2
  exit 1
fi
live_count="$(docker exec "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -tA -c "select count(*) from public.payment_requests where trip_id = '${race_trip}' and payment_type = 'advance' and status <> 'cancelled' and id = '${id_a}'::uuid;")"
live_count="$(printf '%s' "$live_count" | tr -d '[:space:]')"
if [ "$live_count" != "1" ]; then
  echo "concurrent issuers left live count ${live_count}" >&2
  exit 1
fi
echo "concurrent issuers returned ${id_a} and left 1 live row"

echo "disposable PR #1 guard tests passed on ${CONTAINER}/${DB}"
