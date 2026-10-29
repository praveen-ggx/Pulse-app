#!/usr/bin/env bash
# Department manager allow/deny suite (migration 20261029171316) against a
# throwaway local Postgres only — never a linked Supabase project. Stub tables
# carry just the columns the functions read; the migration file is applied
# unchanged, then 03_cases.sql prints PASS / FAIL per case.
# Usage: PGPORT=55432 bash supabase/tests/department_manager/run_local.sh
#   (expects a disposable server at 127.0.0.1:$PGPORT, user postgres, trust auth)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
PORT=${PGPORT:?set PGPORT to a disposable local Postgres}
PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS department_manager_test"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE department_manager_test"
"${PSQL[@]}" -d department_manager_test -f "$HERE/01_stub_schema.sql"
"${PSQL[@]}" -d department_manager_test -f "$HERE/02_seed.sql"
"${PSQL[@]}" -d department_manager_test -f "$REPO/supabase/migrations/20261029171316_department_manager_allowlist_and_scope.sql"
out="$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d department_manager_test -At -F ' | ' -f "$HERE/03_cases.sql" 2>&1)"
echo "$out" | grep -E "PASS|FAIL|audit rows"
if echo "$out" | grep -q "FAIL"; then exit 1; fi
