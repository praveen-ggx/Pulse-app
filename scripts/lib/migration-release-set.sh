#!/usr/bin/env bash
# Release-set helpers for linked Supabase pushes.
# Bash 3.2 compatible (macOS). No network. No schema_migrations writes.

set -euo pipefail

# Print 14-digit versions from a release-set file, one per line.
read_version_file() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  awk '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
      if ($0 ~ /^[0-9]{14}$/) print $0
      else {
        print "invalid version line: " $0 > "/dev/stderr"
        exit 2
      }
    }
  ' "$file"
}

# Stdin: `supabase migration list` text.
# Args: remote_out local_only_out
# Accepts bare versions and the backticked cells emitted by CLI 2.121
# (`20261109144113`). Duplicate rows collapse to one version: history is
# keyed by the 14-digit prefix, not by filename.
parse_migration_list() {
  local remote_out="$1"
  local local_only_out="$2"
  local work
  work="$(mktemp -d "${TMPDIR:-/tmp}/pulse-migration-list.XXXXXX")"
  : >"$work/remote"
  : >"$work/local"
  awk -F'|' '
    {
      gsub(/`/, "", $1)
      gsub(/`/, "", $2)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2)
      local_ok = ($1 ~ /^[0-9]{14}$/)
      remote_ok = ($2 ~ /^[0-9]{14}$/)
      if (remote_ok) print $2
      if (local_ok && !remote_ok) print $1 > local_only
    }
  ' local_only="$work/local" >"$work/remote"
  sort -u "$work/remote" >"$remote_out"
  sort -u "$work/local" >"$local_only_out"
  rm -rf "$work"
}

# Remove a supplied database URL from stdin so command logs cannot echo it.
redact_db_url() {
  SUPABASE_DB_URL="${SUPABASE_DB_URL:-}" python3 -c '
import os, sys
url = os.environ.get("SUPABASE_DB_URL", "")
data = sys.stdin.read()
if url:
    data = data.replace(url, "[redacted-db-url]")
sys.stdout.write(data)
'
}

# Args: supabase-bin [extra args...]
# SUPABASE_DB_URL, when set, is an existing Postgres URL. It is passed only
# to this process. It is not written to supabase/.temp or config.toml.
run_migration_list() {
  local bin="$1"
  shift
  if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
    "$bin" migration list --db-url "$SUPABASE_DB_URL" --output-format text "$@"
  else
    "$bin" migration list --linked --output-format text "$@"
  fi
}

# Args: supabase-bin [db push args...]
run_db_push() {
  local bin="$1"
  shift
  if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
    "$bin" db push --db-url "$SUPABASE_DB_URL" "$@"
  else
    "$bin" db push --linked "$@"
  fi
}

version_in_file() {
  local ver="$1"
  local file="$2"
  [[ -f "$file" ]] || return 1
  read_version_file "$file" | grep -qx "$ver"
}

# Args: migrations_dir version
# Prints the single matching file path.
migration_file_for_version() {
  local dir="$1"
  local ver="$2"
  local matches
  matches="$(find "$dir" -maxdepth 1 -type f -name "${ver}_*.sql" | sort)"
  if [[ -z "$matches" ]]; then
    echo "ERROR: no migration file for $ver under $dir" >&2
    return 1
  fi
  local count
  count="$(printf '%s\n' "$matches" | grep -c .)"
  if [[ "$count" -ne 1 ]]; then
    echo "ERROR: $count migration files for $ver under $dir" >&2
    printf '%s\n' "$matches" >&2
    return 1
  fi
  printf '%s\n' "$matches"
}

# Args: pending_versions_file release_sets_dir
# Prints "FROZEN <ver>" | "THIS-SET <name> <ver>" | "DEFERRED <ver>"
# A version in FROZEN.versions is always FROZEN, even if a release set also names it.
classify_pending_versions() {
  local pending_file="$1"
  local sets_dir="$2"
  local frozen="$sets_dir/FROZEN.versions"
  local ver set_file base name found
  while IFS= read -r ver; do
    [[ -n "$ver" ]] || continue
    if [[ -f "$frozen" ]] && version_in_file "$ver" "$frozen"; then
      echo "FROZEN $ver"
      continue
    fi
    found=0
    if [[ -d "$sets_dir" ]]; then
      for set_file in "$sets_dir"/*.versions; do
        [[ -f "$set_file" ]] || continue
        base="$(basename "$set_file")"
        [[ "$base" == "FROZEN.versions" ]] && continue
        name="${base%.versions}"
        if version_in_file "$ver" "$set_file"; then
          echo "THIS-SET $name $ver"
          found=1
        fi
      done
    fi
    if [[ "$found" -eq 0 ]]; then
      echo "DEFERRED $ver"
    fi
  done <"$pending_file"
}

# Args: pending_versions_file release_sets_dir
# Exit 0 when a default linked push is allowed (no pending, or every pending
# version is in a non-frozen release set and none are frozen).
# Prints the block reason on stdout and returns 1 when blocked.
default_push_block_reason() {
  local pending_file="$1"
  local sets_dir="$2"
  local line ver
  local blocked=0
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    case "$line" in
      FROZEN\ *)
        ver="${line#FROZEN }"
        echo "frozen pending version $ver"
        blocked=1
        ;;
      DEFERRED\ *)
        ver="${line#DEFERRED }"
        echo "unapproved pending version $ver"
        blocked=1
        ;;
      THIS-SET\ *)
        ;;
      *)
        echo "unclassified pending row: $line"
        blocked=1
        ;;
    esac
  done < <(classify_pending_versions "$pending_file" "$sets_dir")
  [[ "$blocked" -eq 0 ]]
}

# Build an ephemeral Supabase project root whose migrations are:
#   every local file whose version is already on Remote
#   plus the allowlisted Local-only files
# Deferred and frozen files are not copied.
# Args: repo_root list_file allowlist_file frozen_file dest_root
build_release_snapshot() {
  local repo_root="$1"
  local list_file="$2"
  local allowlist_file="$3"
  local frozen_file="$4"
  local dest_root="$5"

  local mig_dir="$repo_root/supabase/migrations"
  local work
  work="$(mktemp -d "${TMPDIR:-/tmp}/pulse-release-parse.XXXXXX")"
  local remote_file="$work/remote"
  local local_only_file="$work/local_only"
  parse_migration_list "$remote_file" "$local_only_file" <"$list_file"

  local ver allow_file frozen_hit
  local allow_versions="$work/allow"
  read_version_file "$allowlist_file" >"$allow_versions"
  if [[ ! -s "$allow_versions" ]]; then
    echo "ERROR: release set is empty" >&2
    rm -rf "$work"
    return 1
  fi

  while IFS= read -r ver; do
    [[ -n "$ver" ]] || continue
    if version_in_file "$ver" "$frozen_file"; then
      echo "ERROR: release set names frozen version $ver" >&2
      rm -rf "$work"
      return 1
    fi
  done <"$allow_versions"

  while IFS= read -r ver; do
    [[ -n "$ver" ]] || continue
    if ! grep -qx "$ver" "$local_only_file"; then
      echo "ERROR: allowlisted version $ver is not Local-only on the linked list" >&2
      rm -rf "$work"
      return 1
    fi
    migration_file_for_version "$mig_dir" "$ver" >/dev/null || { rm -rf "$work"; return 1; }
  done <"$allow_versions"

  mkdir -p "$dest_root/supabase/migrations" "$dest_root/supabase/.temp"
  if [[ ! -f "$repo_root/supabase/config.toml" ]]; then
    echo "ERROR: missing $repo_root/supabase/config.toml" >&2
    rm -rf "$work"
    return 1
  fi
  cp "$repo_root/supabase/config.toml" "$dest_root/supabase/config.toml"
  if [[ -d "$repo_root/supabase/.temp" ]]; then
    cp -R "$repo_root/supabase/.temp/." "$dest_root/supabase/.temp/"
  fi

  while IFS= read -r ver; do
    [[ -n "$ver" ]] || continue
    if [[ -n "$(find "$mig_dir" -maxdepth 1 -type f -name "${ver}_*.sql" -print -quit)" ]]; then
      allow_file="$(migration_file_for_version "$mig_dir" "$ver")" || { rm -rf "$work"; return 1; }
      cp "$allow_file" "$dest_root/supabase/migrations/"
    else
      # Sibling-repo history is already on Remote and has no file in this checkout.
      # The CLI refuses db push unless every remote version exists locally.
      # The stand-in lives only in the ephemeral snapshot. The version is already
      # recorded, so the CLI does not execute it and does not insert a new history row.
      cat >"$dest_root/supabase/migrations/${ver}_remote_history_placeholder.sql" <<EOF
-- Remote history placeholder for version ${ver}.
-- Already recorded on the linked database. Not a canonical migration.
-- Present only so this ephemeral snapshot matches remote history.
-- The CLI must not execute this file.
EOF
    fi
  done <"$remote_file"

  while IFS= read -r ver; do
    [[ -n "$ver" ]] || continue
    allow_file="$(migration_file_for_version "$mig_dir" "$ver")" || { rm -rf "$work"; return 1; }
    cp "$allow_file" "$dest_root/supabase/migrations/"
  done <"$allow_versions"

  while IFS= read -r ver; do
    [[ -n "$ver" ]] || continue
    # Skip frozen versions already on Remote — they are read-only history placeholders,
    # not pending applies. Only flag a frozen file that would be newly applied.
    if grep -qx "$ver" "$remote_file"; then
      continue
    fi
    frozen_hit="$(find "$dest_root/supabase/migrations" -maxdepth 1 -type f -name "${ver}_*.sql" -print -quit || true)"
    if [[ -n "$frozen_hit" ]]; then
      echo "ERROR: frozen migration copied into snapshot: $frozen_hit" >&2
      rm -rf "$work"
      return 1
    fi
  done < <(read_version_file "$frozen_file")

  local snap_local="$dest_root/snapshot-local-only.txt"
  : >"$snap_local"
  local base snap_ver
  while IFS= read -r allow_file; do
    [[ -n "$allow_file" ]] || continue
    base="$(basename "$allow_file")"
    snap_ver="${base%%_*}"
    if ! grep -qx "$snap_ver" "$remote_file"; then
      printf '%s\n' "$base" >>"$snap_local"
    fi
  done < <(find "$dest_root/supabase/migrations" -maxdepth 1 -type f -name '*.sql' | sort)

  sort -o "$snap_local" "$snap_local"

  local expected="$work/expected"
  : >"$expected"
  while IFS= read -r ver; do
    [[ -n "$ver" ]] || continue
    allow_file="$(migration_file_for_version "$mig_dir" "$ver")" || { rm -rf "$work"; return 1; }
    basename "$allow_file" >>"$expected"
  done <"$allow_versions"
  sort -o "$expected" "$expected"

  if ! cmp -s "$expected" "$snap_local"; then
    echo "ERROR: snapshot Local-only files do not match the release set" >&2
    echo "expected:" >&2
    cat "$expected" >&2
    echo "snapshot:" >&2
    cat "$snap_local" >&2
    rm -rf "$work"
    return 1
  fi

  rm -rf "$work"
}
