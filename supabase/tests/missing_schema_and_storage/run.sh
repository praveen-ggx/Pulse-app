#!/usr/bin/env bash
# Disposable local Postgres. No network. No production access.
# Usage: bash supabase/tests/missing_schema_and_storage/run.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
NAME=missing_schema_and_storage_harness
IMAGE=${IMAGE:-postgres:17-alpine}
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --network none -e POSTGRES_PASSWORD=harness "$IMAGE" >/dev/null
cleanup() {
  if [ "${KEEP:-}" != "1" ]; then docker rm -f "$NAME" >/dev/null; fi
}
trap cleanup EXIT
for _ in $(seq 1 30); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
sleep 1
run() {
  echo "== $1"
  docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -X < "$1"
}
run supabase/tests/missing_schema_and_storage/00_stub_schema.sql
run supabase/tests/missing_schema_and_storage/10_before.sql
run supabase/migrations/20271014184500_entity_bank_accounts_beneficiary_branch.sql
run supabase/migrations/20271014184600_suppliers_primary_region.sql
run supabase/migrations/20271012203000_trip_documents_storage_party_access.sql
run supabase/tests/missing_schema_and_storage/90_after.sql
echo "OK missing_schema_and_storage"
