#!/usr/bin/env bash
# Points the app at local Docker Supabase by writing .env.local, auto-filled
# from `supabase status`. Run from repo root, then restart your dev server.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! supabase status >/dev/null 2>&1; then
  echo "Local Supabase isn't running. Start it first with: supabase start"
  exit 1
fi

ANON_KEY=$(supabase status -o env 2>/dev/null | grep '^ANON_KEY=' | cut -d'"' -f2)
if [ -z "$ANON_KEY" ]; then
  echo "Could not read ANON_KEY from 'supabase status -o env'. Is the local stack healthy?"
  exit 1
fi

# For web / iOS simulator, 127.0.0.1 works. Device/Android emulator need a
# reachable IP instead — swap the URL below if you hit "Network request failed".
URL="http://127.0.0.1:54321"

cat > .env.local <<EOF
EXPO_PUBLIC_SUPABASE_URL=$URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
EOF

echo "Created .env.local -> local Supabase ($URL)"
printf 'local\n' > .pulse-supabase-target
echo "Set .pulse-supabase-target -> local"
echo "Restart your dev server: npm run web"
echo ""
echo "Device / Android emulator? Edit .env.local's URL instead:"
echo "  Android emulator: http://10.0.2.2:54321"
echo "  Physical device:  http://\$(ipconfig getifaddr en0):54321"
