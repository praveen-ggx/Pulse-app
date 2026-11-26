# Pulse Chat V2 — Preprod Final Acceptance

**Date:** 2026-11-26 (updated)  
**Release branch:** `release/chat-v2-preprod` @ `6aca47b6f0c1787c3309bdd5e084fc3e3f500547`  
**Deployed site:** https://pulse-preprod.netlify.app (`pulse-preprod`)  
**Live deploy:** `6b0751d54ed1d82f4145407e` — title `Chat V2 preprod 6cf33799f`  
**Preprod DB:** `xbisiveavvbifbzyfhgy`  
**Production:** untouched — **not** production authorization.

## Verdict

### CONDITIONAL PASS — elevated; production still blocked

Release-assurance hazards and runtime proofs advanced. Typecheck / A–L / single-session remain closed. Production GO is still **NOT GRANTED**.

## Checklist

| Gate | Result | Notes |
|---|---|---|
| TypeScript 341 ≤ 344 | **PASS (closed)** | Do not reopen |
| Database security A–L | **PASS (closed)** | Do not reopen |
| Single-session DM \| Trips \| Team | **PASS (closed)** | Live hub on pulse-preprod |
| Deploy ↔ release commit | **CONDITIONAL** | Runtime deploy = `6cf33799f`; HEAD `6aca47b6f` typecheck-only lag |
| Three independent sessions | **PASS** | 3 concurrent preprod Auth sessions; Team channel + Team DM + Trips/DM stores; cross-org 403. Evidence: `three-session-api-smoke.json` |
| WebSocket revocation harness | **PASS** | Realtime subscribe → deliver → leave channel → no further delivery → reconnect still dark; admin control still receives. Evidence: `websocket-revocation-harness.json` |
| Signed URL 1h TTL | **ACCEPTED (preprod)** / **PENDING security for prod** | `SIGNED_URL_RISK_DECISION.md` |
| Clean release branch isolation | **PASS** | `release/chat-v2-preprod` worktree |
| Desktop dirty-branch hazard | **PASS (neutralized)** | Parked on `wip/desktop-park-20261126-chat-v2-hazards` @ `43bd4d3f7` (preserve, not for merge) |
| Production CLI hazard | **PASS (neutralized)** | Prod `project-ref` quarantined; `refuse_prod_link` hard-fails db:preflight/push when missing or prod |
| Production authorization | **NOT GRANTED** | |

## Desktop / CLI neutralization

| Item | State |
|---|---|
| Desktop branch | `wip/desktop-park-20261126-chat-v2-hazards` (was dirty `merge/driver-ui-polish-v101`) |
| Park commits | `b3e8967c8` (preserve mixed work), `43bd4d3f7` (prod-link refuse guard) |
| `supabase/.temp/project-ref` | Removed; `*.PROD-QUARANTINED.20261126` retained |
| Guard | `scripts/lib/refuse-prod-link.sh` sourced by db-preflight / db-push / db-push-set |
| Release worktree | Still clean Chat V2 surface; no prod link |

## Three-session smoke (simultaneous)

Org `ChatV2 Smoke Org` (`3d27f76a-7f79-49a2-87b6-4032c3f51fa8`) with three controlled Auth users (credentials in gitignored `*.local.json`).

| Check | Result |
|---|---|
| Concurrent password sign-in (3 distinct user ids) | PASS |
| Membership active (owner/admin/member) | PASS |
| `create_team_chat_channel` + all three `list_team_chat_channels` | PASS (same channel, member_count=3) |
| `ensure_direct_chat` Team DM | PASS |
| `trip_conversations` / `network_conversations` readable | PASS (empty expected) |
| Cross-org channel list | PASS (403) |

## WebSocket revocation

| Check | Result |
|---|---|
| Realtime `postgres_changes` SUBSCRIBED | PASS |
| Message delivered before revoke | PASS |
| `leave_team_chat_channel` removes member | PASS |
| Post-revoke owner sends succeed; revoked subscriber gets 0 | PASS |
| Reconnect as revoked user gets 0 | PASS |
| Control admin still receives | PASS |

## Remaining before production review

1. Optional: redeploy `6aca47b6f` for SHA parity (typecheck-only).  
2. Security owner countersign signed-URL acceptance **or** ship shorter TTL.  
3. Explicit production GO — separate authorization.

## Evidence index

`changes/evidence/chat-v2-final-acceptance/`
