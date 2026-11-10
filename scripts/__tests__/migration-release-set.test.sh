#!/usr/bin/env bash
# Unit tests for release-set snapshot construction. No network. No db push.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=../lib/migration-release-set.sh
source "$ROOT/scripts/lib/migration-release-set.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_eq() {
  local got="$1"
  local want="$2"
  local label="$3"
  [[ "$got" == "$want" ]] || fail "$label: got [$got] want [$want]"
}

tmp="$(mktemp -d "${TMPDIR:-/tmp}/pulse-release-set-test.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

repo="$tmp/repo"
mkdir -p "$repo/supabase/migrations" "$repo/supabase/release-sets" "$repo/supabase/.temp"
printf '%s\n' 'project_id = "pulse"' >"$repo/supabase/config.toml"
printf '%s\n' 'test-ref' >"$repo/supabase/.temp/project-ref"

printf '%s\n' 'select 1;' >"$repo/supabase/migrations/20270101010101_already_remote.sql"
printf '%s\n' 'select 2;' >"$repo/supabase/migrations/20270913091000_driver_commerce_origin_read_boundary.sql"
printf '%s\n' 'select 3;' >"$repo/supabase/migrations/20260928122336_vendor_onboarding_pack.sql"
printf '%s\n' 'select 4;' >"$repo/supabase/migrations/20271005120000_dco_operating_model_boundary.sql"
printf '%s\n' 'select 5;' >"$repo/supabase/migrations/20271005130000_dco_single_owner_operator_concept.sql"

printf '%s\n' '20271005130000' >"$repo/supabase/release-sets/FROZEN.versions"
printf '%s\n' '20270913091000' >"$repo/supabase/release-sets/v1.0.1.versions"
printf '%s\n' '20271005120000' >"$repo/supabase/release-sets/dco-operating-mode.versions"

cat >"$tmp/list.txt" <<'EOF'
Connecting to remote database...

Local          | Remote         | Time (UTC)
----------------|----------------|---------------------
20270101010101 | 20270101010101 | 2027-01-01 01:01:01
20260928122336 |                | 2026-09-28 12:23:36
20270913091000 |                | 2027-09-13 09:10:00
20271005120000 |                | 2027-10-05 12:00:00
20271005130000 |                | 2027-10-05 13:00:00
EOF

dest="$tmp/snap"
build_release_snapshot "$repo" "$tmp/list.txt" \
  "$repo/supabase/release-sets/v1.0.1.versions" \
  "$repo/supabase/release-sets/FROZEN.versions" \
  "$dest"

local_only="$(cat "$dest/snapshot-local-only.txt")"
assert_eq "$local_only" "20270913091000_driver_commerce_origin_read_boundary.sql" "snapshot local-only"

[[ -f "$dest/supabase/migrations/20270101010101_already_remote.sql" ]] || fail "remote file missing from snapshot"
[[ -f "$dest/supabase/migrations/20270913091000_driver_commerce_origin_read_boundary.sql" ]] || fail "commerce file missing"
[[ ! -f "$dest/supabase/migrations/20260928122336_vendor_onboarding_pack.sql" ]] || fail "deferred file was copied"
[[ ! -f "$dest/supabase/migrations/20271005120000_dco_operating_model_boundary.sql" ]] || fail "DCO boundary leaked into commerce snapshot"
[[ ! -f "$dest/supabase/migrations/20271005130000_dco_single_owner_operator_concept.sql" ]] || fail "frozen DCO concept was copied"
[[ -f "$dest/supabase/config.toml" ]] || fail "config missing"
[[ "$(cat "$dest/supabase/.temp/project-ref")" == "test-ref" ]] || fail "link metadata missing"

count="$(find "$dest/supabase/migrations" -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')"
assert_eq "$count" "2" "snapshot migration count"

# Remote history with no local file gets a snapshot-only comment stand-in.
# It must not become a Local-only migration and must not be written into the repo.
cat >"$tmp/list-with-remote-gap.txt" <<'EOF'
Local          | Remote         | Time (UTC)
----------------|----------------|---------------------
20270101010101 | 20270101010101 | 2027-01-01 01:01:01
               | 20260929141531 | 2026-09-29 14:15:31
20260928122336 |                | 2026-09-28 12:23:36
20270913091000 |                | 2027-09-13 09:10:00
20271005120000 |                | 2027-10-05 12:00:00
20271005130000 |                | 2027-10-05 13:00:00
EOF
gap="$tmp/snap-gap"
build_release_snapshot "$repo" "$tmp/list-with-remote-gap.txt" \
  "$repo/supabase/release-sets/v1.0.1.versions" \
  "$repo/supabase/release-sets/FROZEN.versions" \
  "$gap"
gap_only="$(cat "$gap/snapshot-local-only.txt")"
assert_eq "$gap_only" "20270913091000_driver_commerce_origin_read_boundary.sql" "gap snapshot local-only"
[[ -f "$gap/supabase/migrations/20260929141531_remote_history_placeholder.sql" ]] || fail "remote placeholder missing"
grep -q "Already recorded" "$gap/supabase/migrations/20260929141531_remote_history_placeholder.sql" || fail "placeholder is empty or unmarked"
[[ ! -f "$repo/supabase/migrations/20260929141531_remote_history_placeholder.sql" ]] || fail "placeholder leaked into the repo"
[[ ! -f "$gap/supabase/migrations/20260928122336_vendor_onboarding_pack.sql" ]] || fail "deferred copied in gap snapshot"
[[ ! -f "$gap/supabase/migrations/20271005120000_dco_operating_model_boundary.sql" ]] || fail "DCO boundary leaked into commerce gap snapshot"

# Frozen version named by a set is rejected.
printf '%s\n' '20271005130000' >"$tmp/bad.versions"
if build_release_snapshot "$repo" "$tmp/list.txt" "$tmp/bad.versions" \
  "$repo/supabase/release-sets/FROZEN.versions" "$tmp/bad-snap" 2>"$tmp/bad.err"; then
  fail "frozen allowlist was accepted"
fi
grep -q "frozen version" "$tmp/bad.err" || fail "missing frozen rejection message"

# Approved DCO set copies only 20271005120000.
dco="$tmp/snap-dco"
build_release_snapshot "$repo" "$tmp/list.txt" \
  "$repo/supabase/release-sets/dco-operating-mode.versions" \
  "$repo/supabase/release-sets/FROZEN.versions" \
  "$dco"
dco_only="$(cat "$dco/snapshot-local-only.txt")"
assert_eq "$dco_only" "20271005120000_dco_operating_model_boundary.sql" "dco snapshot local-only"
[[ -f "$dco/supabase/migrations/20271005120000_dco_operating_model_boundary.sql" ]] || fail "DCO boundary missing from dco snapshot"
[[ ! -f "$dco/supabase/migrations/20271005130000_dco_single_owner_operator_concept.sql" ]] || fail "frozen concept leaked into dco snapshot"
[[ ! -f "$dco/supabase/migrations/20260928122336_vendor_onboarding_pack.sql" ]] || fail "deferred leaked into dco snapshot"

# Already-remote version is not a Local-only introduction.
printf '%s\n' '20270101010101' >"$tmp/applied.versions"
if build_release_snapshot "$repo" "$tmp/list.txt" "$tmp/applied.versions" \
  "$repo/supabase/release-sets/FROZEN.versions" "$tmp/applied-snap" 2>"$tmp/applied.err"; then
  fail "already-remote allowlist was accepted"
fi
grep -q "not Local-only" "$tmp/applied.err" || fail "missing not-local-only message"

# Default push gate: frozen + deferred + one approved version.
printf '%s\n' \
  '20260928122336' \
  '20270913091000' \
  '20271005120000' \
  '20271005130000' >"$tmp/pending.txt"
if reason="$(default_push_block_reason "$tmp/pending.txt" "$repo/supabase/release-sets" 2>"$tmp/gate.err")"; then
  fail "default push was allowed for a mixed queue: $reason"
fi
printf '%s\n' "$reason" | grep -q "frozen pending version 20271005130000" || fail "gate missed frozen concept"
printf '%s\n' "$reason" | grep -q "frozen pending version 20271005120000" && fail "gate still froze approved DCO boundary"
printf '%s\n' "$reason" | grep -q "unapproved pending version 20260928122336" || fail "gate missed deferred vendor"
printf '%s\n' "$reason" | grep -q "20270913091000" && fail "gate treated commerce as blocked"

# Commerce alone is in the release set, so the default gate allows it.
printf '%s\n' '20270913091000' >"$tmp/commerce-only.txt"
if ! reason="$(default_push_block_reason "$tmp/commerce-only.txt" "$repo/supabase/release-sets")"; then
  fail "commerce-only pending was blocked: $reason"
fi

# Real repository release files.
repo_allow="$(read_version_file "$ROOT/supabase/release-sets/v1.0.1.versions")"
assert_eq "$repo_allow" "20270913091000" "repo v1.0.1 set"
repo_frozen="$(read_version_file "$ROOT/supabase/release-sets/FROZEN.versions" | sort | tr '\n' ' ' | sed 's/ $//')"
assert_eq "$repo_frozen" "20271005130000" "repo frozen set"
repo_dco="$(read_version_file "$ROOT/supabase/release-sets/dco-operating-mode.versions")"
assert_eq "$repo_dco" "20271005120000" "repo dco set"
[[ -f "$ROOT/supabase/migrations/20270913091000_driver_commerce_origin_read_boundary.sql" ]] || fail "commerce migration missing"
[[ -f "$ROOT/supabase/migrations/20271005120000_dco_operating_model_boundary.sql" ]] || fail "DCO boundary file missing from tree"
[[ -f "$ROOT/supabase/migrations/20271005130000_dco_single_owner_operator_concept.sql" ]] || fail "frozen concept file missing from tree"

# CLI 2.121 wraps every cell in backticks. A blank remote cell is "` `".
parse_migration_list "$tmp/bt-remote" "$tmp/bt-local" <<'EOF'
   Local            | Remote           | Time (UTC)
  ------------------|------------------|-----------------------
   `20261106121132` | `20261106121132` | `2026-11-06 12:11:32`
   `20261109144113` | ` `              | `2026-11-09 14:41:13`
   `20271014184500` | ` `              | `2027-10-14 18:45:00`
   `20271014184500` | ` `              | `2027-10-14 18:45:00`
EOF
assert_eq "$(cat "$tmp/bt-remote")" "20261106121132" "backtick remote"
assert_eq "$(cat "$tmp/bt-local")" "$(printf '%s\n' 20261109144113 20271014184500)" "backtick local-only, duplicate collapsed"

# A local-only duplicate prefix is not copied and does not stop another set.
dup="$tmp/dup-repo"
mkdir -p "$dup/supabase/migrations" "$dup/supabase/release-sets"
printf '%s\n' 'project_id = "pulse"' >"$dup/supabase/config.toml"
printf '%s\n' 'select 1;' >"$dup/supabase/migrations/20271107190000_already_remote.sql"
printf '%s\n' 'godrej' >"$dup/supabase/migrations/20271014184500_godrej.sql"
printf '%s\n' 'bank' >"$dup/supabase/migrations/20271014184500_bank.sql"
printf '%s\n' 'select 4;' >"$dup/supabase/migrations/20261109144113_one.sql"
printf '%s\n' 'select 5;' >"$dup/supabase/migrations/20261110023000_two.sql"
printf '%s\n' 'select 6;' >"$dup/supabase/migrations/20261110083407_three.sql"
printf '%s\n' 'select 7;' >"$dup/supabase/migrations/20271108094500_four.sql"
printf '%s\n' '20271005130000' >"$dup/supabase/release-sets/FROZEN.versions"
cat >"$tmp/dup.versions" <<'EOF'
20261109144113
20261110023000
20261110083407
20271108094500
EOF
cat >"$tmp/dup-list.txt" <<'EOF'
   `20271107190000` | `20271107190000` | `2027-11-07 19:00:00`
   `20271014184500` | ` `              | `2027-10-14 18:45:00`
   `20271014184500` | ` `              | `2027-10-14 18:45:00`
   `20261109144113` | ` `              | `2026-11-09 14:41:13`
   `20261110023000` | ` `              | `2026-11-10 02:30:00`
   `20261110083407` | ` `              | `2026-11-10 08:34:07`
   `20271108094500` | ` `              | `2027-11-08 09:45:00`
   `20271005130000` | ` `              | `2027-10-05 13:00:00`
EOF
dup_snap="$tmp/dup-snap"
build_release_snapshot "$dup" "$tmp/dup-list.txt" "$tmp/dup.versions" \
  "$dup/supabase/release-sets/FROZEN.versions" "$dup_snap"
assert_eq "$(cat "$dup_snap/snapshot-local-only.txt")" "$(printf '%s\n' \
  20261109144113_one.sql \
  20261110023000_two.sql \
  20261110083407_three.sql \
  20271108094500_four.sql)" "duplicate prefix stays out of the four-file snapshot"
[[ ! -e "$dup_snap/supabase/migrations/20271014184500_godrej.sql" ]] || fail "godrej duplicate copied"
[[ ! -e "$dup_snap/supabase/migrations/20271014184500_bank.sql" ]] || fail "bank duplicate copied"
count="$(find "$dup_snap/supabase/migrations" -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')"
assert_eq "$count" "5" "remote history plus four local-only files"

# The same prefix on Remote cannot be copied: the builder refuses to choose a file.
cat >"$tmp/dup-remote-list.txt" <<'EOF'
   `20271014184500` | `20271014184500` | `2027-10-14 18:45:00`
   `20261109144113` | ` `              | `2026-11-09 14:41:13`
   `20261110023000` | ` `              | `2026-11-10 02:30:00`
   `20261110083407` | ` `              | `2026-11-10 08:34:07`
   `20271108094500` | ` `              | `2027-11-08 09:45:00`
EOF
if build_release_snapshot "$dup" "$tmp/dup-remote-list.txt" "$tmp/dup.versions" \
  "$dup/supabase/release-sets/FROZEN.versions" "$tmp/dup-remote-snap" 2>"$tmp/dup-remote.err"; then
  fail "remote duplicate prefix was accepted"
fi
grep -q "2 migration files for 20271014184500" "$tmp/dup-remote.err" || fail "missing duplicate-file rejection"

echo "migration-release-set tests passed"
