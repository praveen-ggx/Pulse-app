#!/usr/bin/env bash
# Apply the Finance Pro QA fixture to LOCAL Supabase only.
# Never use --linked. Never touch Nvidia / remote data.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ " $* " == *" --linked "* ]]; then
  echo "REFUSED: this fixture must never run with --linked."
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1 && ! command -v npx >/dev/null 2>&1; then
  echo "Need supabase CLI or npx."
  exit 1
fi

STATUS_JSON="$(npx supabase status -o env 2>/dev/null || true)"
API_URL="$(printf '%s\n' "$STATUS_JSON" | grep '^API_URL=' | cut -d'"' -f2)"
if [[ -z "$API_URL" ]]; then
  echo "Local Supabase is not running. Start it with: npx supabase start"
  exit 1
fi
if [[ "$API_URL" != http://127.0.0.1:* && "$API_URL" != http://localhost:* ]]; then
  echo "REFUSED: supabase status API_URL is not localhost ($API_URL)."
  echo "This fixture is local-only."
  exit 1
fi

# Multi-statement SQL cannot go through `supabase db query` (prepared statement).
# Use the local Docker Postgres URL only.
DB_URL="$(printf '%s\n' "$STATUS_JSON" | grep '^DB_URL=' | cut -d'"' -f2)"
if [[ -z "$DB_URL" ]]; then
  DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
fi
if [[ "$DB_URL" != *127.0.0.1* && "$DB_URL" != *localhost* ]]; then
  echo "REFUSED: DB_URL is not localhost ($DB_URL)."
  exit 1
fi

echo "Applying Finance QA fixture to $API_URL via local Docker postgres (no --linked)"
if command -v psql >/dev/null 2>&1; then
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/sql/finance_qa_local_fixture.sql
else
  docker exec -i supabase_db_pulse psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    < scripts/sql/finance_qa_local_fixture.sql
fi
echo "Done. Sign in on local web and open Finance Pro → Invoice."
