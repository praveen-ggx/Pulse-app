#!/usr/bin/env bash
# Lane offers suite (20271113091500) on a disposable local Postgres.
# No network (--network none), no Supabase project, no production access.
# Usage: bash supabase/tests/lane_offers/run.sh   (KEEP=1 keeps the container)
set -euo pipefail
cd "$(dirname "$0")/../../.."
NAME=${NAME:-pulse-lane-offers-contract-$$}
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
run supabase/tests/lane_offers/00_stub_extra.sql
run "$M/20270930114500_market_indents_for_org_index_paths.sql"
run "$M/20271006181500_pooled_marketplace_manifests_and_sponsored_classifier.sql"
run "$M/20271006182000_submit_market_bid_indent_checks.sql"
run "$M/20271006182500_submit_network_quote_rpc.sql"
run "$M/20271006183000_pooled_marketplace_pool_rows_inline_predicates.sql"
run "$M/20271007091500_network_pool_manifests.sql"
run "$M/20261113104714_network_pool_bid_commits_reissue.sql"
run "${LANE_SQL:-$M/20271113091500_lane_offers_for_indent.sql}"
run "$PM/05_helpers.sql"
run "$PM/06_fixtures_stub.sql"
run supabase/tests/lane_offers/10_cases.sql
