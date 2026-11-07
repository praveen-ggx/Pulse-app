#!/usr/bin/env bash
# Disposable local Postgres; no network, no production access.
set -euo pipefail
cd "$(dirname "$0")/../../.."
NAME=px_harness
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --network none -e POSTGRES_PASSWORD=harness postgres:17-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
run() {
  echo "== $1"
  docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -X < "$1"
}
run scripts/sql/_tmp_px_harness/00_stub_schema.sql
run supabase/migrations/20270925194500_marketplace_convert_skip_network_supplier_gate.sql
run supabase/migrations/20271006142659_omnichannel_award_channel_classification.sql
run supabase/migrations/20271006144616_pulse_exchange_default_party_and_two_gate_payments.sql
run scripts/sql/_tmp_px_harness/20_scenarios.sql
if [ "${KEEP:-}" != "1" ]; then docker rm -f "$NAME" >/dev/null; fi
