#!/usr/bin/env bash
# 48-hour Marketplace lane commitment on a disposable local Postgres.
# No Supabase project and no production or preproduction access.
# Usage: bash supabase/tests/marketplace_lane_rate/run_48h.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
NAME=${NAME:-pulse-lane-48h-$$}
IMAGE=${IMAGE:-postgres:17-alpine}
PM=supabase/tests/pooled_marketplace
M=supabase/migrations
LOG=${LOG:-/tmp/pulse-lane-48h.log}
cleanup() { if [ "${KEEP:-}" != "1" ]; then docker rm -f "$NAME" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT
docker run -d --name "$NAME" --network none -e POSTGRES_PASSWORD=harness "$IMAGE" >/dev/null
for _ in $(seq 1 40); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
sleep 1
: > "$LOG"
run() {
  echo "== $1"
  {
    echo "BEGIN;"
    cat "$1"
    echo "COMMIT;"
  } | docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -X 2>&1 | tee -a "$LOG"
}
run "$PM/00_stub_schema.sql"
run supabase/tests/marketplace_lane_rate/00_stub_extra.sql
run "$M/20271114173800_standing_lane_bids_follow_new_indents.sql"
run "$M/20271114174600_standing_lane_bids_inline_lane_key.sql"
run "$M/20271114201500_marketplace_lane_rate_opt_in.sql"
run "$M/20271117013000_marketplace_lane_commitment_on_pool_rate.sql"
run "$M/20271117021500_marketplace_bid_individual_expiry.sql"
run "$PM/05_helpers.sql"
run "$PM/06_fixtures_stub.sql"
run supabase/tests/marketplace_lane_rate/20_cases_48h.sql
if ! grep -q "marketplace lane rate attach skipped" "$LOG"; then
  echo "FAIL: indent trigger did not log the forced attach failure" >&2
  exit 1
fi
if ! grep -q "forced_attach_failure" "$LOG"; then
  echo "FAIL: attach failure log did not include the error" >&2
  exit 1
fi
run supabase/tests/marketplace_lane_rate/22_concurrency.sql
echo "== production award_market_bid"
sed -n '14,182p' "$M/20271005200741_gate1a_award_lock_order_and_commercial_integrity_guards.sql" \
  | docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -X 2>&1 | tee -a "$LOG"
echo "== production create_trip_from_assigned_indent"
sed -n '668,881p' "$M/20271006184500_pulse_exchange_canonical_counterparty_accounts.sql" \
  | docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -X 2>&1 | tee -a "$LOG"
run supabase/tests/marketplace_lane_rate/23_bid_expiry.sql
echo "48h harness log: $LOG"
