#!/usr/bin/env bash
# Disposable Postgres only. Does not use the linked Supabase project.
set -euo pipefail
cd "$(dirname "$0")/../../.."
NAME=bulk_op_harness
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --network none -e POSTGRES_PASSWORD=harness postgres:17-alpine >/dev/null
cleanup() {
  if [[ "${KEEP:-}" != "1" ]]; then
    docker rm -f "$NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
for _ in $(seq 1 30); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

run() {
  echo "== $1"
  docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -X < "$1"
}

run scripts/sql/bulk_operation_harness/00_fixture.sql
{
  echo "BEGIN;"
  cat supabase/migrations/20271118161500_bulk_operation_audit.sql
  echo "COMMIT;"
} | docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -X
run scripts/sql/bulk_operation_harness/10_seed.sql
run scripts/sql/bulk_operation_harness/20_cases.sql
run scripts/sql/bulk_operation_harness/30_crash.sql
run scripts/sql/bulk_operation_harness/31_commit_prepare.sql
echo "== commit injection"
set +e
docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -X < scripts/sql/bulk_operation_harness/32_commit_fire.sql > /tmp/bulk-commit-fire.out 2>&1
fire_status=$?
set -e
if [[ "$fire_status" -eq 0 ]] || ! grep -q "injected during commit" /tmp/bulk-commit-fire.out; then
  echo "commit injection did not abort the transaction"
  cat /tmp/bulk-commit-fire.out
  exit 1
fi
run scripts/sql/bulk_operation_harness/33_commit_assert.sql
run scripts/sql/bulk_operation_harness/40_concurrency.sql

docker exec -d "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -c "SELECT pg_advisory_lock(7); SELECT pg_advisory_lock(8); SELECT pg_sleep(3); SELECT pg_advisory_unlock(8); SELECT pg_advisory_unlock(7);"
sleep 1

apply_worker() {
  docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -X <<'SQL'
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
SET ROLE authenticated;
SELECT pg_advisory_lock(7);
SELECT pg_advisory_unlock(7);
INSERT INTO public.bulk_test_log (who, result)
SELECT 'apply', public.bulk_payment_field_apply_next((SELECT v FROM public.bulk_test_state WHERE k = 'race_batch')::uuid);
SQL
}

submit_worker() {
  local uid="$1"
  docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -X <<SQL
UPDATE public.transactions
   SET payment_reference = 'OLD123456',
       description = 'Advance | Mode: UPI | UTR: OLD123456 | Request ID: REQ-1001',
       amount_out = 1000,
       transaction_date = '2026-09-01'
 WHERE id = '77777777-7777-7777-7777-777777777772';
SELECT set_config('request.jwt.claim.sub', '${uid}', false);
SET ROLE authenticated;
SELECT pg_advisory_lock(8);
SELECT pg_advisory_unlock(8);
INSERT INTO public.bulk_test_log (who, result)
SELECT 'submit', public.bulk_payment_field_submit(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'race-submit.csv', 'race-submit',
  '{}'::jsonb, '["utr"]'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'rowIndex', 2, 'recordId', '77777777-7777-7777-7777-777777777772',
    'proposed', jsonb_build_object('utr', 'SUBMIT123')
  ))
);
SQL
}

echo "== concurrent apply"
apply_worker &
apply_pid_1=$!
apply_worker &
apply_pid_2=$!
echo "== concurrent submit"
submit_worker 11111111-1111-1111-1111-111111111111 &
submit_pid_1=$!
submit_worker 44444444-4444-4444-4444-444444444444 &
submit_pid_2=$!
wait "$apply_pid_1" "$apply_pid_2" "$submit_pid_1" "$submit_pid_2"

run scripts/sql/bulk_operation_harness/41_concurrency_assert.sql
echo "bulk operation database gate passed"
