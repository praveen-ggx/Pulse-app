#!/bin/sh
# Apply the server-calculation migration on a throwaway database, then run
# the SQL matrix and two concurrent approval sessions. Refuses remote names.
set -eu
cd "$(dirname "$0")/../.."
CONTAINER="${ADVANCE_PG_CONTAINER:-supabase_db_pulse}"
DB="${ADVANCE_DISPOSABLE_DB:-advance_calc_rehearsal}"
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

drop_db() {
  docker exec "$CONTAINER" psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB' AND pid <> pg_backend_pid();" >/dev/null || true
  docker exec "$CONTAINER" psql -U postgres -c "DROP DATABASE IF EXISTS \"$DB\";" >/dev/null
}

cleanup() {
  drop_db
  docker exec "$CONTAINER" rm -rf /tmp/advance_calc >/dev/null || true
}
trap cleanup EXIT

drop_db
docker exec "$CONTAINER" psql -U postgres -c "CREATE DATABASE \"$DB\";"
docker exec "$CONTAINER" mkdir -p /tmp/advance_calc
docker cp supabase/tests/finance_approval_schema.sql "$CONTAINER:/tmp/advance_calc/schema.sql"
docker cp supabase/migrations/20271013101500_payment_requests.sql "$CONTAINER:/tmp/advance_calc/101500.sql"
docker cp supabase/migrations/20271013120000_compliance_cleared_gate.sql "$CONTAINER:/tmp/advance_calc/120000.sql"
docker cp supabase/migrations/20271014183000_finance_approval_issues_payment_request.sql "$CONTAINER:/tmp/advance_calc/183000.sql"
docker cp supabase/migrations/20271117194500_advance_approval_terms_guard.sql "$CONTAINER:/tmp/advance_calc/194500.sql"
docker cp supabase/migrations/20271118094500_compliance_advance_server_calculation.sql "$CONTAINER:/tmp/advance_calc/094500.sql"
docker cp supabase/tests/advance_calculation_matrix.sql "$CONTAINER:/tmp/advance_calc/matrix.sql"

apply_file() {
  docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<EOF
begin;
\\i $1
commit;
EOF
}

apply_file /tmp/advance_calc/schema.sql
apply_file /tmp/advance_calc/101500.sql
apply_file /tmp/advance_calc/120000.sql
apply_file /tmp/advance_calc/183000.sql
apply_file /tmp/advance_calc/194500.sql
apply_file /tmp/advance_calc/094500.sql
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -f /tmp/advance_calc/matrix.sql

docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<'EOF'
insert into public.trips (id, organization_id, compliance_verified_at, supplier_rate, supplier_rate_basis)
values ('c1000000-0000-4000-8000-0000000000c1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 4000, 'per_trip');
update public.org_document_charge_settings set enabled = false
where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
EOF

mkdir -p /tmp/advance_calc_race
A_SQL="begin; set lock_timeout = '15s'; select id from public.trips where id = 'c1000000-0000-4000-8000-0000000000c1' for update; select pg_sleep(2); select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true); select public.mark_trip_finance_verified('c1000000-0000-4000-8000-0000000000c1', 'race-a', 90, 1); commit;"
B_SQL="set lock_timeout = '15s'; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false); select public.mark_trip_finance_verified('c1000000-0000-4000-8000-0000000000c1', 'race-b', 50, 1);"
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "$A_SQL" >/tmp/advance_calc_race/a.out 2>/tmp/advance_calc_race/a.err &
pid_a=$!
sleep 0.4
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "$B_SQL" >/tmp/advance_calc_race/b.out 2>/tmp/advance_calc_race/b.err &
pid_b=$!
wait "$pid_a"
wait "$pid_b"
echo "--- approval session A ---"
cat /tmp/advance_calc_race/a.out /tmp/advance_calc_race/a.err
echo "--- approval session B ---"
cat /tmp/advance_calc_race/b.out /tmp/advance_calc_race/b.err
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "select count(*) as live_requests, min(approved_amount) as amount from public.payment_requests where trip_id = 'c1000000-0000-4000-8000-0000000000c1' and status <> 'cancelled';"

C_SQL="begin; set lock_timeout = '15s'; insert into public.transactions (id, organization_id, trip_id, ledger_category, amount_out) values ('e1000000-0000-4000-8000-0000000000c1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1000000-0000-4000-8000-0000000000c1', 'compliance_advance', 3600); select pg_sleep(2); commit;"
D_SQL="set lock_timeout = '15s'; insert into public.transactions (id, organization_id, trip_id, ledger_category, amount_out) values ('e1000000-0000-4000-8000-0000000000c2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1000000-0000-4000-8000-0000000000c1', 'compliance_advance', 3600);"
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "$C_SQL" >/tmp/advance_calc_race/c.out 2>/tmp/advance_calc_race/c.err &
pid_c=$!
sleep 0.4
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "$D_SQL" >/tmp/advance_calc_race/d.out 2>/tmp/advance_calc_race/d.err &
pid_d=$!
set +e
wait "$pid_c"
code_c=$?
wait "$pid_d"
code_d=$?
set -e
echo "--- payment sessions $code_c $code_d ---"
cat /tmp/advance_calc_race/c.out /tmp/advance_calc_race/c.err /tmp/advance_calc_race/d.out /tmp/advance_calc_race/d.err
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "select count(*) as payments from public.transactions where trip_id = 'c1000000-0000-4000-8000-0000000000c1' and ledger_category = 'compliance_advance';"
if [ "$code_c" -eq 0 ] && [ "$code_d" -ne 0 ]; then
  echo CALC_MATRIX_OK
else
  echo "payment race did not keep a single winner" >&2
  exit 1
fi
