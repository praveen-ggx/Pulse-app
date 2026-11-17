#!/usr/bin/env bash
# Selects the hosted Supabase project without deleting the local .env.local.
# Usage: bash scripts/use-cloud-supabase.sh [production|preprod]
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-production}"
if [ "$TARGET" != "production" ] && [ "$TARGET" != "preprod" ]; then
  echo "Usage: bash scripts/use-cloud-supabase.sh [production|preprod]"
  exit 1
fi

printf '%s\n' "$TARGET" > .pulse-supabase-target
echo "Set .pulse-supabase-target -> $TARGET"
echo ".env.local is unchanged and is used only when the target is local."
echo "Restart your dev server: npm run web"
