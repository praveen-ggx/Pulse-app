#!/usr/bin/env bash
# Throwaway Postgres only. Never a linked Supabase project.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
PORT=${PGPORT:?set PGPORT to a disposable local Postgres}
PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS trip_chat_status_rpc"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE trip_chat_status_rpc"
"${PSQL[@]}" -d trip_chat_status_rpc -f "$HERE/00_stub.sql"
"${PSQL[@]}" -d trip_chat_status_rpc -f "$REPO/supabase/migrations/20261110023000_trip_owner_status_action_guard.sql"
"${PSQL[@]}" -d trip_chat_status_rpc -f "$REPO/supabase/migrations/20261110083407_trip_chat_status_rpc_owner_guard.sql"
out="$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d trip_chat_status_rpc -At -F ' | ' -f "$HERE/02_cases.sql" 2>&1)"
echo "$out" | grep -E "PASS|FAIL"
if echo "$out" | grep -q "FAIL"; then
  echo "$out"
  exit 1
fi

# The RPC locks the row, so a status committed while it waits is the status it authorizes.
"${PSQL[@]}" -d trip_chat_status_rpc -c "UPDATE public.trips SET status = 'in_transit' WHERE id = '30000000-0000-0000-0000-000000000005'"
psql -h 127.0.0.1 -p "$PORT" -U postgres -d trip_chat_status_rpc -v ON_ERROR_STOP=1 -c \
  "BEGIN; SELECT id FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000005' FOR UPDATE; SELECT pg_sleep(2); UPDATE public.trips SET status = 'completed' WHERE id = '30000000-0000-0000-0000-000000000005'; COMMIT;" \
  >/tmp/trip-chat-locker.out 2>&1 &
locker=$!
sleep 0.4
set +e
psql -h 127.0.0.1 -p "$PORT" -U postgres -d trip_chat_status_rpc -v ON_ERROR_STOP=1 -c \
  "SET ROLE authenticated; SET request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001'; SELECT public.change_trip_status_with_notification('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-00000000000a', 'in_progress', NULL, 'Dispatcher');" \
  >/tmp/trip-chat-racer.out 2>&1
race_rc=$?
set -e
wait "$locker"
if [[ "$race_rc" -eq 0 ]]; then
  echo "FAIL concurrent rpc revoke was allowed"
  cat /tmp/trip-chat-racer.out
  exit 1
fi
if ! grep -q "trip_revoke_delivered_owner_only" /tmp/trip-chat-racer.out; then
  echo "FAIL concurrent rpc revoke failed for a different reason"
  cat /tmp/trip-chat-racer.out
  exit 1
fi
status="$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d trip_chat_status_rpc -At -c "SELECT status FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000005'")"
messages="$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d trip_chat_status_rpc -At -c "SELECT count(*) FROM public.trip_messages m JOIN public.trip_conversations c ON c.id = m.conversation_id WHERE c.trip_id = '30000000-0000-0000-0000-000000000005' AND m.content LIKE '%completed → in_progress%'")"
if [[ "$status" != "completed" || "$messages" != "0" ]]; then
  echo "FAIL concurrent rpc status=$status messages=$messages"
  exit 1
fi
echo "PASS concurrent rpc revoke sees completed and does not notify"

# The RPC check stands without the trigger. Dropping the trigger lets the
# direct update through and must still reject the same change through the RPC.
psql -h 127.0.0.1 -p "$PORT" -U postgres -d trip_chat_status_rpc -v ON_ERROR_STOP=1 -c \
  "DROP TRIGGER b_trips_guard_owner_status_actions ON public.trips;"
psql -h 127.0.0.1 -p "$PORT" -U postgres -d trip_chat_status_rpc -v ON_ERROR_STOP=1 -c \
  "SET ROLE authenticated; SET request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001'; UPDATE public.trips SET status = 'at_drop' WHERE id = '30000000-0000-0000-0000-000000000009';"
set +e
psql -h 127.0.0.1 -p "$PORT" -U postgres -d trip_chat_status_rpc -v ON_ERROR_STOP=1 -c \
  "SET ROLE authenticated; SET request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001'; SELECT public.change_trip_status_with_notification('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000a', 'at_drop', '20000000-0000-0000-0000-000000000002', 'Owner');" \
  >/tmp/trip-chat-no-trigger.out 2>&1
no_trigger_rc=$?
set -e
if [[ "$no_trigger_rc" -eq 0 ]]; then
  echo "FAIL rpc revoke succeeded after the trigger was removed"
  cat /tmp/trip-chat-no-trigger.out
  exit 1
fi
if ! grep -q "trip_revoke_delivered_owner_only" /tmp/trip-chat-no-trigger.out; then
  echo "FAIL rpc revoke without trigger failed for a different reason"
  cat /tmp/trip-chat-no-trigger.out
  exit 1
fi
direct="$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d trip_chat_status_rpc -At -c "SELECT status FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000009'")"
rpc_status="$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d trip_chat_status_rpc -At -c "SELECT status FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000003'")"
if [[ "$direct" != "at_drop" || "$rpc_status" != "done" ]]; then
  echo "FAIL independence direct=$direct rpc=$rpc_status"
  exit 1
fi
echo "PASS rpc rejects delivered revoke after the trigger is removed"
