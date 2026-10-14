#!/bin/sh
# Apply 20271013101500 → 20271013120000 → 20271014183000 on a throwaway
# database in the local Supabase Postgres container. Refuses remote names.
# Takes a restorable dump, runs contract tests, restores, and re-checks.
set -eu
cd "$(dirname "$0")/../.."
CONTAINER="${FINANCE_PG_CONTAINER:-supabase_db_pulse}"
DB="${FINANCE_DISPOSABLE_DB:-finance_rehearsal}"
BACKUP_DB="${FINANCE_BACKUP_DB:-finance_rehearsal_backup}"
case "$CONTAINER" in
  *pooler*|*prod*|*nafxpivddesgsrthmosv*) echo "refusing non-local container" >&2; exit 2 ;;
esac
case "$DB$BACKUP_DB" in
  *pooler*|*prod*|*nafxpivddesgsrthmosv*) echo "refusing non-local database name" >&2; exit 2 ;;
esac

psql_postgres() {
  docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 "$@"
}

docker exec "$CONTAINER" rm -rf /tmp/finance_rehearsal
docker exec "$CONTAINER" mkdir -p /tmp/finance_rehearsal
docker cp supabase/migrations/20271013101500_payment_requests.sql "$CONTAINER:/tmp/finance_rehearsal/20271013101500.sql"
docker cp supabase/migrations/20271013120000_compliance_cleared_gate.sql "$CONTAINER:/tmp/finance_rehearsal/20271013120000.sql"
docker cp supabase/migrations/20271014183000_finance_approval_issues_payment_request.sql "$CONTAINER:/tmp/finance_rehearsal/20271014183000.sql"
docker cp supabase/tests/finance_approval_schema.sql "$CONTAINER:/tmp/finance_rehearsal/schema.sql"
docker cp supabase/tests/finance_approval_contract.sql "$CONTAINER:/tmp/finance_rehearsal/contract.sql"
docker cp supabase/tests/finance_approval_run_race.sh "$CONTAINER:/tmp/finance_rehearsal/run_race.sh"
docker exec "$CONTAINER" chmod +x /tmp/finance_rehearsal/run_race.sh

drop_db() {
  name="$1"
  docker exec "$CONTAINER" psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$name' AND pid <> pg_backend_pid();" >/dev/null || true
  docker exec "$CONTAINER" psql -U postgres -c "DROP DATABASE IF EXISTS \"$name\";" >/dev/null
}

cleanup() {
  drop_db "$DB"
  drop_db "$BACKUP_DB"
  docker exec "$CONTAINER" rm -rf /tmp/finance_rehearsal >/dev/null || true
}
trap cleanup EXIT

drop_db "$DB"
drop_db "$BACKUP_DB"
psql_postgres -c "CREATE DATABASE \"$DB\";"

psql_postgres -d "$DB" -f /tmp/finance_rehearsal/schema.sql
# Restorable copy of the pre-apply disposable baseline.
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$BACKUP_DB\" TEMPLATE \"$DB\";"

# Apply each file in one explicit transaction, matching supabase db push.
apply_file() {
  target="$1"
  file="$2"
  docker exec -i "$CONTAINER" psql -U postgres -d "$target" -v ON_ERROR_STOP=1 <<EOF
begin;
\\i $file
commit;
EOF
}

apply_file "$DB" /tmp/finance_rehearsal/20271013101500.sql
apply_file "$DB" /tmp/finance_rehearsal/20271013120000.sql
apply_file "$DB" /tmp/finance_rehearsal/20271014183000.sql

# Godrej file must not be in this apply.
if docker exec "$CONTAINER" test -f /tmp/finance_rehearsal/20271014184500.sql; then
  echo "Godrej classification file was copied into the rehearsal" >&2
  exit 1
fi

defn="$(docker exec "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -tA -c "select pg_get_functiondef('public.mark_trip_finance_verified(uuid,text,numeric)'::regprocedure);")"
case "$defn" in
  *compliance_cleared*) ;;
  *) echo "final mark_trip_finance_verified is missing compliance_cleared" >&2; exit 1 ;;
esac
issue_count="$(printf '%s' "$defn" | grep -c 'issue_payment_request' || true)"
if [ "$issue_count" -lt 2 ]; then
  echo "final verifier does not issue on both approve paths" >&2
  exit 1
fi
if printf '%s' "$defn" | grep -E 'unique_violation then[[:space:]]+return' >/dev/null; then
  echo "final verifier still returns on unique_violation before issue" >&2
  exit 1
fi
echo "final verifier on ${CONTAINER}/${DB} includes compliance_cleared and two issue_payment_request calls"

psql_postgres -d "$DB" -f /tmp/finance_rehearsal/contract.sql
echo "finance approval contract tests passed"

psql_postgres -d "$DB" -c "insert into public.trips (id, organization_id, compliance_verified_at) values ('26000000-0000-0000-0000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now());"
docker exec "$CONTAINER" sh /tmp/finance_rehearsal/run_race.sh "$DB"
live_count="$(docker exec "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -tA -c "select count(*) from public.payment_requests where trip_id = '26000000-0000-0000-0000-000000000006' and payment_type = 'advance' and status <> 'cancelled';")"
live_count="$(printf '%s' "$live_count" | tr -d '[:space:]')"
if [ "$live_count" != "1" ]; then
  echo "concurrent approvals left live count ${live_count}" >&2
  exit 1
fi
echo "concurrent approvals left 1 live request"

# Recovery: drop the applied database and recreate it from the pre-apply backup.
drop_db "$DB"
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DB\" TEMPLATE \"$BACKUP_DB\";"
restored="$(docker exec "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -tA -c "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'mark_trip_finance_verified';")"
restored="$(printf '%s' "$restored" | tr -d '[:space:]')"
if [ "$restored" != "0" ]; then
  echo "recovery left mark_trip_finance_verified on the restored baseline" >&2
  exit 1
fi
if docker exec "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -tA -c "select to_regclass('public.payment_requests');" | grep -q payment_requests; then
  echo "recovery left payment_requests on the restored baseline" >&2
  exit 1
fi
echo "recovery restored the pre-apply baseline (no payment_requests, no verifier)"

# Re-apply after recovery to show the dump is a usable starting point.
apply_file "$DB" /tmp/finance_rehearsal/20271013101500.sql
apply_file "$DB" /tmp/finance_rehearsal/20271013120000.sql
apply_file "$DB" /tmp/finance_rehearsal/20271014183000.sql
defn2="$(docker exec "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -tA -c "select pg_get_functiondef('public.mark_trip_finance_verified(uuid,text,numeric)'::regprocedure);")"
case "$defn2" in
  *compliance_cleared*) ;;
  *) echo "re-apply after recovery did not restore the gated verifier" >&2; exit 1 ;;
esac
echo "re-apply after recovery restored the gated verifier"

echo "disposable finance-approval rehearsal passed on ${CONTAINER}/${DB}"
