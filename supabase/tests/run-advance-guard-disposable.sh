#!/bin/sh
# Apply the advance-approval migration on a throwaway database inside the
# local Supabase Postgres container, then run the SQL matrix. Refuses any
# container or database name that looks remote.
set -eu
cd "$(dirname "$0")/../.."
CONTAINER="${ADVANCE_PG_CONTAINER:-supabase_db_pulse}"
DB="${ADVANCE_DISPOSABLE_DB:-advance_guard_rehearsal}"
case "$CONTAINER" in
  *pooler*|*prod*|*nafxpivddesgsrthmosv*|*xbisiveavvbifbzyfhgy*)
    echo "refusing non-local container: $CONTAINER" >&2
    exit 2
    ;;
esac
case "$DB" in
  *pooler*|*prod*|*postgres*|*nafxpivddesgsrthmosv*|*xbisiveavvbifbzyfhgy*)
    echo "refusing database name: $DB" >&2
    exit 2
    ;;
esac

psql_db() {
  docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"
}

drop_db() {
  docker exec "$CONTAINER" psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB' AND pid <> pg_backend_pid();" >/dev/null || true
  docker exec "$CONTAINER" psql -U postgres -c "DROP DATABASE IF EXISTS \"$DB\";" >/dev/null
}

cleanup() {
  drop_db
  docker exec "$CONTAINER" rm -rf /tmp/advance_guard >/dev/null || true
}
trap cleanup EXIT

drop_db
docker exec "$CONTAINER" psql -U postgres -c "CREATE DATABASE \"$DB\";"
docker exec "$CONTAINER" mkdir -p /tmp/advance_guard
docker cp supabase/tests/finance_approval_schema.sql "$CONTAINER:/tmp/advance_guard/schema.sql"
docker cp supabase/migrations/20271013101500_payment_requests.sql "$CONTAINER:/tmp/advance_guard/101500.sql"
docker cp supabase/migrations/20271013120000_compliance_cleared_gate.sql "$CONTAINER:/tmp/advance_guard/120000.sql"
docker cp supabase/migrations/20271014183000_finance_approval_issues_payment_request.sql "$CONTAINER:/tmp/advance_guard/183000.sql"
docker cp supabase/migrations/20271117194500_advance_approval_terms_guard.sql "$CONTAINER:/tmp/advance_guard/194500.sql"
docker cp supabase/tests/advance_guard_matrix.sql "$CONTAINER:/tmp/advance_guard/matrix.sql"

apply_file() {
  docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<EOF
begin;
\\i $1
commit;
EOF
}

apply_file /tmp/advance_guard/schema.sql
apply_file /tmp/advance_guard/101500.sql
apply_file /tmp/advance_guard/120000.sql
apply_file /tmp/advance_guard/183000.sql
apply_file /tmp/advance_guard/194500.sql
psql_db -f /tmp/advance_guard/matrix.sql

mkdir -p /tmp/advance_guard_race
A_SQL="begin; set lock_timeout = '15s'; select id from public.trips where id = '01000000-0000-0000-0000-000000000019' for update; select pg_sleep(2); select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true); select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000019', 'race-a', 4000); commit;"
B_SQL="set lock_timeout = '15s'; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false); select clock_timestamp() as started; select public.mark_trip_finance_verified('01000000-0000-0000-0000-000000000019', 'race-b', 4000); select clock_timestamp() as finished;"
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "$A_SQL" >/tmp/advance_guard_race/a.out 2>/tmp/advance_guard_race/a.err &
pid_a=$!
sleep 0.4
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "$B_SQL" >/tmp/advance_guard_race/b.out 2>/tmp/advance_guard_race/b.err &
pid_b=$!
sleep 0.5
echo "--- approval lock snapshot ---"
docker exec "$CONTAINER" psql -U postgres -d "$DB" -c "select pid, wait_event_type, wait_event, state, left(query, 80) as query from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and state <> 'idle';"
wait "$pid_a"
wait "$pid_b"
echo "--- approval session A ---"
cat /tmp/advance_guard_race/a.out /tmp/advance_guard_race/a.err
echo "--- approval session B ---"
cat /tmp/advance_guard_race/b.out /tmp/advance_guard_race/b.err

C_SQL="begin; set lock_timeout = '15s'; insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by) values ('71000000-0000-0000-0000-000000000020', '01000000-0000-0000-0000-000000000020', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 100, '11111111-1111-1111-1111-111111111111'); select pg_sleep(2); commit;"
D_SQL="set lock_timeout = '15s'; select clock_timestamp() as started; insert into public.transactions (id, trip_id, organization_id, ledger_category, amount_out, created_by) values ('71000000-0000-0000-0000-000000000220', '01000000-0000-0000-0000-000000000020', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 100, '11111111-1111-1111-1111-111111111111'); select clock_timestamp() as finished;"
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "$C_SQL" >/tmp/advance_guard_race/c.out 2>/tmp/advance_guard_race/c.err &
pid_c=$!
sleep 0.4
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "$D_SQL" >/tmp/advance_guard_race/d.out 2>/tmp/advance_guard_race/d.err &
pid_d=$!
sleep 0.5
echo "--- payment lock snapshot ---"
docker exec "$CONTAINER" psql -U postgres -d "$DB" -c "select pid, wait_event_type, wait_event, state, left(query, 90) as query from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and state <> 'idle';"
set +e
wait "$pid_c"
c_ec=$?
wait "$pid_d"
d_ec=$?
set -e
echo "payment session exit codes: holder=$c_ec contender=$d_ec"
echo "--- payment session holder ---"
cat /tmp/advance_guard_race/c.out /tmp/advance_guard_race/c.err
echo "--- payment session contender ---"
cat /tmp/advance_guard_race/d.out /tmp/advance_guard_race/d.err

echo "--- after races ---"
docker exec "$CONTAINER" psql -U postgres -d "$DB" -c "select 'approval' as kind, count(*) as live_requests, max(approved_amount) as amount from public.payment_requests where trip_id = '01000000-0000-0000-0000-000000000019' and status <> 'cancelled';"
docker exec "$CONTAINER" psql -U postgres -d "$DB" -c "select 'payment' as kind, count(*) as tx_count, (select status from public.payment_requests where trip_id = '01000000-0000-0000-0000-000000000020' and payment_type = 'advance') as request_status from public.transactions where trip_id = '01000000-0000-0000-0000-000000000020';"
if [ "$d_ec" -eq 0 ]; then
  echo "concurrent payment contender was not rejected" >&2
  exit 1
fi
echo "MATRIX_OK"
