# Pulse Chat V2 — Release Readiness

**Date:** 2026-11-26  
**Environment under test:** Preprod `xbisiveavvbifbzyfhgy`  
**Production:** untouched — a preprod PASS is **not** production authorization.

## Executive verdict

### CONDITIONAL PASS

Core Team / Channel / Trip Room authorization gates pass on preprod with JWT-role behavioral tests. Confirmed gaps (channel metadata UPDATE, archive ACL, private-create fallback) were fixed and retested. Remaining non-critical limitations block a full “RELEASE READY FOR PRODUCTION REVIEW” until deploy + websocket harness + clean PR isolation are complete.

## Gate matrix

| Gate | Required result | Status | Evidence |
|---|---|---|---|
| A — Team 1:1 isolation | PASS | **PASS** | `MATRIX_ABF_PASS` (SET ROLE authenticated) |
| B — Channel authorization | PASS | **PASS** | private channel + non-admin UPDATE deny after `chat_v2_channel_update_acl_and_archive` |
| C — Trip Room reassignment | PASS | **PASS** | `MATRIX_PASS` + prior A–E report |
| D — Realtime auth/revocation | PASS | **PASS** | `ROOM_ACL_PASS` (SELECT RLS = Realtime filter); no separate WS client |
| E — Attachment authorization | PASS | **PASS** | private `trip-documents`; helper covers `trip_chat/`; Team N/A (text-only) |
| F — Message/participant integrity | PASS | **PASS** | immutable keys + insert deny + `MATRIX_ABF_PASS` F1 |
| G — DM regression | PASS | **PASS** | Legacy `network_*` path unchanged; no policy edits on DM store |
| H — Trips regression | PASS | **PASS** | Reassignment matrix preserves lanes/history |
| I — Team regression | PASS | **PASS** | Flag default ON; Jest tabs/services green |
| J — Workspace isolation | PASS | **PASS** | Cross-org deny in Gate B6 |
| K — Legacy access-path audit | PASS | **PASS** | Map in security acceptance doc |
| L — DB + client test suites | PASS | **PASS** | Extended SQL metadata suite (no exception); Jest 16 tests (after private-fallback case) |

## Tests executed

| Suite | Count / result |
|---|---|
| Preprod JWT Team+Channel matrix | `MATRIX_ABF_PASS` |
| Preprod driver reassignment A–E | `MATRIX_PASS` |
| Preprod trip room revocation | `ROOM_ACL_PASS` |
| `supabase/tests/chat_v2_phase_b_security.sql` | completed without exception (extended checks) |
| Jest chat flags/tabs/team services/slug | 5 suites / 15 tests, then +1 private-fallback (re-run) |
| App deploy smoke (Netlify) | **Not performed** |

## Migrations applied this closure (preprod)

- `chat_v2_channel_update_acl_and_archive` → history `20261125202715`

## Preprod deployment status

| Item | Status |
|---|---|
| Database migrations (Chat V2) | Applied on preprod via MCP |
| Application (gx-pulse / Netlify) | **Not deployed this session** |
| Team flag in source | Default **ON** (`PULSE_CHAT_TEAM_ENABLED`) |
| Production DB / flags / deploy | **No changes** |

## Remaining risks / owners

1. Deploy lag — source Team ON vs undeployed preprod web build → **owner: release engineer** to deploy after merge.
2. Signed URL 1h post-revocation window → **owner: security** to decide shorter TTL if required.
3. No websocket reconnect harness → **owner: QA** optional follow-up.
4. Dirty mixed branch → **owner: developer** isolate chat PR before merge to `V1`.
5. Local `supabase/.temp/project-ref` points at prod → **owner: every operator** must re-link or use MCP only.

## Exact next action

1. Isolate Chat V2 commits onto a clean branch from `upstream/V1`.
2. Deploy the app build to preprod Netlify and verify DM | Trips | Team with three independent sessions.
3. Optionally shorten attachment signed-URL TTL and add a Realtime WS harness.
4. Seek separate explicit GO before any production migration or deploy.
