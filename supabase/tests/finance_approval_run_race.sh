#!/bin/sh
# Two sessions approve the same cleared trip. mark_trip_finance_verified
# returns void; the caller checks live-row count after both finish.
set -eu
DB="${1:-finance_rehearsal}"
sql="select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false); select public.mark_trip_finance_verified('26000000-0000-0000-0000-000000000006'::uuid, null, 10);"
psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -tA -c "$sql" > /tmp/finance_rehearsal/race_a 2>/tmp/finance_rehearsal/race_a.err &
pid_a=$!
psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -tA -c "$sql" > /tmp/finance_rehearsal/race_b 2>/tmp/finance_rehearsal/race_b.err &
pid_b=$!
ec=0
wait "$pid_a" || ec=1
wait "$pid_b" || ec=1
if [ "$ec" -ne 0 ]; then
  cat /tmp/finance_rehearsal/race_a.err /tmp/finance_rehearsal/race_b.err >&2 || true
  exit 1
fi
echo race_ok
