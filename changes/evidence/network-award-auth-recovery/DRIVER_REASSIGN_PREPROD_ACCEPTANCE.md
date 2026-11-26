# Driver Reassignment Security — Preprod Acceptance

**Date:** 2026-11-26  
**Target:** `xbisiveavvbifbzyfhgy` only  
**Production:** not modified  

## Team UI

`PULSE_CHAT_TEAM_ENABLED` default restored to **ON** so the hub shows **DM | Trips | Team**. Reload the app to see Team.

## Migration verification

| Item | Result |
|---|---|
| Local `20271126221530` | Present |
| Live `fn_sync_trip_room_on_trip_update` | Matched intended body (then superseded by fix below) |
| Trigger `trg_sync_trip_room_on_trip_update` | `AFTER UPDATE OF driver_id, client_id, supplier_id, organization_id ON trips` |
| App path | `useReassignTrip` → `updateTripAssignment` → `trips.driver_id` UPDATE → trigger |

## Defects found & fixed

1. **Null assign crashed** — setting `trip_conversations.driver_id = NULL` violated `party_ref_consistent`.  
   Fix: `20271126231500_trip_driver_reassign_null_and_live_acl.sql` — keep historical lane row; do not null `driver_id`.

2. **Stale driver ACL** — helpers granted access from conversation `driver_id` alone.  
   Fix: same migration — `private.user_can_read_trip_conversation` / `user_can_read_trip_message` require **live** `trips.driver_id` match.

3. **Immutable trigger blocked FK cleanup** — `legacy_*` locked, breaking `ON DELETE SET NULL`.  
   Fix: `20271126232000_chat_conversations_immutable_allow_legacy_fk.sql`.

All three applied on preprod via MCP.

## Test matrix (disposable trip, cleaned up)

| Scenario | Result |
|---|---|
| A Initial assign — lane + Driver A only | PASS |
| B Reassign A→B — lane rewrite, A denied, B allowed, no dup lanes | PASS |
| C Null assign — lane kept, B denied, org owner retained | PASS |
| D Reassign back to A | PASS |
| E Idempotent same-driver update | PASS |

SQL returned `MATRIX_PASS`.

## Lifecycle

```
Trip Detail reassign UI
→ useReassignTrip / updateTripAssignment
→ UPDATE trips.driver_id
→ trg_sync_trip_room_on_trip_update
→ fn_sync_trip_room_on_trip_update
   → chat room + fn_sync_trip_room_participants
   → trip_conversations driver lane rewrite (non-null) / keep history (null)
→ private.user_can_read_trip_* (live trips.driver_id)
```

## Verdict

**PASS — PREPRODUCTION READY** for driver reassignment sync + live ACL on preprod.

Team tab is re-enabled in the client; backend Phase B + reassignment fixes are live on preprod. Reload Metro/web to pick up the Team flag.
