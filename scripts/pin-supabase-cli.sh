#!/usr/bin/env bash
# Print the absolute path of a pinned supabase CLI from the user npm cache.
# Usage: SUPABASE_CLI="$(bash scripts/pin-supabase-cli.sh 2.95.4)"
# Does not print tokens. Forces $HOME/.npm so the path matches `npx supabase@<ver> login`.

set -euo pipefail

ver="${1:-2.95.4}"
if [[ ! "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: invalid supabase CLI version: $ver" >&2
  exit 2
fi

# Prefer an already-extracted binary under the user npm cache. Agent/sandbox
# npx can unpack the same version to a different path whose keychain ACL
# does not include the `supabase login` token.
found=""
while IFS= read -r pkg; do
  [[ -f "$pkg" ]] || continue
  pkg_ver="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("version",""))' "$pkg")"
  if [[ "$pkg_ver" == "$ver" ]]; then
    cand="$(dirname "$pkg")/bin/supabase"
    if [[ -x "$cand" ]]; then
      found="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$cand")"
      break
    fi
  fi
done < <(find "${HOME}/.npm/_npx" -path '*/node_modules/supabase/package.json' 2>/dev/null | sort)

if [[ -z "$found" ]]; then
  export npm_config_cache="${HOME}/.npm"
  bin="$(npx --yes --package "supabase@${ver}" -c 'command -v supabase')"
  if [[ -z "$bin" || ! -x "$bin" ]]; then
    echo "ERROR: could not resolve supabase@${ver}" >&2
    exit 1
  fi
  found="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$bin")"
fi
printf '%s\n' "$found"
