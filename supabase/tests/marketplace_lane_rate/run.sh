#!/usr/bin/env bash
# Marketplace lane rate suite (20271114201500) on a disposable local Postgres.
# No network (--network none), no Supabase project, no production access.
# Usage: bash supabase/tests/marketplace_lane_rate/run.sh   (KEEP=1 keeps the container)
set -euo pipefail
cd "$(dirname "$0")/../../.."
NAME=${NAME:-pulse-marketplace-lane-rate-$$}
IMAGE=${IMAGE:-postgres:17-alpine}
PM=supabase/tests/pooled_marketplace
M=supabase/migrations
cleanup() { if [ "${KEEP:-}" != "1" ]; then docker rm -f "$NAME" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT
docker run -d --name "$NAME" --network none -e POSTGRES_PASSWORD=harness "$IMAGE" >/dev/null
for _ in $(seq 1 30); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
sleep 1
run() {
  echo "== $1"
  docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -X < "$1"
}
run "$PM/00_stub_schema.sql"
run supabase/tests/marketplace_lane_rate/00_stub_extra.sql
run "$M/20271114173800_standing_lane_bids_follow_new_indents.sql"
run "$M/20271114174600_standing_lane_bids_inline_lane_key.sql"
run "$M/20271114201500_marketplace_lane_rate_opt_in.sql"
run "$PM/05_helpers.sql"
run "$PM/06_fixtures_stub.sql"
run supabase/tests/marketplace_lane_rate/10_cases.sql
