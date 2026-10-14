#!/bin/sh
set -eu
DB="${1:-pr1_guard}"
race_sql="select public.issue_payment_request('14141414-1414-1414-1414-141414141414', 'advance', 10, null, now());"
psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -tA -c "$race_sql" > /tmp/pr1/race_a 2>/tmp/pr1/race_a.err &
psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -tA -c "$race_sql" > /tmp/pr1/race_b 2>/tmp/pr1/race_b.err &
wait || true
printf '%s' "$(tr -d '[:space:]' < /tmp/pr1/race_a)"
printf ' %s\n' "$(tr -d '[:space:]' < /tmp/pr1/race_b)"
cat /tmp/pr1/race_a.err /tmp/pr1/race_b.err >&2 || true
