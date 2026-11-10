#!/usr/bin/env bash
# Fail-closed linked push.
#
# Refuses when any Local-only version is frozen or is not named by a release set.
# Does not apply a subset. Approved subset applies go through scripts/db-push-set.sh.
#
# Usage: npm run db:push

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=lib/migration-release-set.sh
source "$ROOT/scripts/lib/migration-release-set.sh"

SETS="$ROOT/supabase/release-sets"
if [[ ! -f "$SETS/FROZEN.versions" ]]; then
  echo "ERROR: missing $SETS/FROZEN.versions" >&2
  exit 1
fi

echo "── Migration list ──"
if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  echo "connection: explicit database URL (project linkage unchanged)"
else
  echo "connection: linked project"
fi
list_out="$(run_migration_list "$(command -v supabase)" 2>&1)" || {
  printf '%s\n' "$list_out" | redact_db_url >&2
  echo "ERROR: could not list migrations." >&2
  exit 1
}
printf '%s\n' "$list_out" | redact_db_url
echo

work="$(mktemp -d "${TMPDIR:-/tmp}/pulse-db-push.XXXXXX")"
trap 'rm -rf "$work"' EXIT
parse_migration_list "$work/remote" "$work/local_only" <<<"$list_out"

if [[ -s "$work/local_only" ]]; then
  echo "── Default push gate ──"
  if ! reason="$(default_push_block_reason "$work/local_only" "$SETS")"; then
    printf '%s\n' "$reason" >&2
    echo >&2
    echo "ERROR: refusing npm run db:push." >&2
    echo "Default push applies every Local-only file. Frozen or unapproved versions are pending." >&2
    echo "Dry-run an approved set: npm run db:push-set -- <set> --dry-run" >&2
    exit 1
  fi
fi

echo "No frozen or unapproved Local-only versions. Running supabase db push."
run_db_push "$(command -v supabase)"
