#!/usr/bin/env bash
# Read-only: summarises prod Postgres errors from the Supabase logs API, grouped by who caused them.
# Usage: scripts/prod-error-report.sh [hours=3]
# Needs the Supabase CLI login (token in the macOS keychain). Never prints the token.
# "app" rows (authenticator/postgrest, supabase_admin realtime) are the ones that must reach zero after a fix.
# Rows from role "postgres" via Supavisor or application "supabase/dashboard" are people running SQL by hand.
set -euo pipefail
HOURS="${1:-3}"
[[ "$HOURS" =~ ^[0-9]+$ ]] || { echo "hours must be a whole number" >&2; exit 2; }
REF="nafxpivddesgsrthmosv"
RAW="$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null || true)"
case "$RAW" in go-keyring-base64:*) TOK="$(printf %s "${RAW#go-keyring-base64:}" | base64 -d)";; *) TOK="$RAW";; esac
[ -n "${TOK:-}" ] || { echo "No Supabase CLI token in keychain" >&2; exit 1; }
START="$(python3 -c "import datetime;print((datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(hours=$HOURS)).strftime('%Y-%m-%dT%H:%M:%SZ'))")"
END="$(python3 -c "import datetime;print(datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))")"
SQL="select event_message, log_attributes from logs where source='postgres_logs' and log_attributes['parsed.error_severity'] in ('ERROR','FATAL') order by timestamp desc limit 1000"
# The token goes in via a curl config on stdin so it never appears in the process list.
# A failed API call must be loud: an empty report must never be mistaken for "zero errors".
RESP="$(printf 'header = "Authorization: Bearer %s"\n' "$TOK" | curl -sS --fail-with-body -G -K - "https://api.supabase.com/v1/projects/$REF/analytics/endpoints/logs" \
  --data-urlencode "iso_timestamp_start=$START" --data-urlencode "iso_timestamp_end=$END" \
  --data-urlencode "sql=$SQL")" || { echo "ERROR: logs API call failed; this is NOT a clean report" >&2; exit 1; }
printf '%s' "$RESP" | python3 -c '
import sys, json, collections
rows = json.load(sys.stdin).get("result") or []
if rows and not any("parsed.error_severity" in (r.get("log_attributes") or {}) for r in rows):
    sys.exit("ERROR: unexpected log_attributes shape; this is NOT a clean report")
if len(rows) >= 1000:
    print("WARNING: 1000-row cap reached; older errors in this window are NOT counted. Use a shorter window.")
c = collections.Counter()
for r in rows:
    a = r["log_attributes"]
    who = "manual" if a.get("parsed.user_name") == "postgres" or "dashboard" in (a.get("parsed.application_name") or "") else "app"
    c[(who, a.get("parsed.user_name"), a.get("parsed.sql_state_code"), r["event_message"][:80].replace("\n", " "))] += 1
app_n = sum(v for k, v in c.items() if k[0] == "app")
manual_n = sum(v for k, v in c.items() if k[0] == "manual")
print("errors in window: %d  (app: %d, manual: %d)" % (app_n + manual_n, app_n, manual_n))
for (who, user, code, msg), n in sorted(c.items(), key=lambda kv: (kv[0][0] != "app", -kv[1])):
    print(f"{n:4d}  {who:6s} {str(user):15s} {code}  {msg}")
'
