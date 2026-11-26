# Pulse Chat V2 — Preprod Delivery Report

**Date:** 2026-11-26  
**Branch (work):** `merge/driver-ui-polish-v101` (dirty mixed tree; chat work not isolated into a clean PR branch yet)  
**Target:** Preprod `xbisiveavvbifbzyfhgy` only  
**Production `nafxpivddesgsrthmosv`:** not modified  

Exploration: [Chat architecture matrix](fa88311b-a0e3-4567-9a81-5534660ea47b) · [Phase B security review](c7eff359-8874-41e3-a222-f46df5fbd93c)

---

## Architecture

### Before
| Scope | Store | Notes |
|---|---|---|
| DM | `network_*` via `IntegratedChatContext` | Separate engine |
| Trip lanes | `trip_*` (+ mirror → `chat_*`) | Primary trip messaging |
| Trip Room | `chat_*` type=`trip` | Trip-detail “Team” tab ≠ workspace Team |
| Team / Channels | `chat_*` UI present; **weak RLS** | Team flag was default **ON** |

### After (this session)
| Scope | Store | Status |
|---|---|---|
| DM | `network_*` (retained) | Working; not unified into `chat_*` yet |
| Trips / Trip Room | `trip_*` + `chat_*` trip | Retained; Phase B trip ACL + stale participant sync applied on preprod |
| Team DM | `chat_*` type=`direct` | Code present; **flag OFF** until behavioral security sign-off |
| Channels | `chat_*` type=`channel` + channel RPCs | RPCs + Phase B + follow-up ACL on preprod; UI gated by same flag |

**Authoritative services:** `chat.service` (trip), `networkConversation.service` (DM), `chatPlatform.service` (shared `chat_*`), `teamChat.service`, `teamChannel.service`.  
**Legacy retained:** `IntegratedChatContext`, trip mirrors, `ensure_chat_channel` (still exists; prefer team channel RPCs).

---

## Reconciliation matrix

| Feature | Main repo | Action taken |
|---|---|---|
| DM | Live on `network_*` | Reuse; no destructive unify |
| Trip chat | Live | Preserve + Phase B trip ACL |
| Trip Room | Live | Preserve; sidebar inbox stays off |
| Team DM | Uncommitted Team UI | Keep behind flag |
| Channels | Uncommitted + RPCs | Applied channel SQL on preprod earlier/re-applied; UI gated |
| Attachments | Trips/DM only | Team still text-only (gap) |
| Notifications / unread | Split models | Team badge still `0` (gap) |

---

## Security

### Applied on preprod (`xbisiveavvbifbzyfhgy`)

| Migration / change | Evidence |
|---|---|
| Phase B RLS hardening | MCP `apply_migration` name `chat_v2_phase_b_rls_hardening` → history `20261125200642` |
| Team channel management | Re-applied; history includes `20261125193246` / `20261125200648` |
| Follow-up ACL (immutable keys + insert deny) | `execute_sql` of `20271126224500_…sql`; row `20271126224500` recorded |
| Trip lane driver reassign sync | MCP `apply_migration` `sync_trip_conversation_driver_on_reassign` (`20271126221530`) — updates `trip_conversations` + ensures party lanes on `trips.driver_id` change |

### Verified live
- `fn_chat_can_access_conversation` type-aware (`direct` branch)
- `fn_chat_is_org_member` requires `status='active'`
- Triggers: `chat_participants_immutable_keys`, `chat_conversations_immutable_keys`
- Policy: `chat_conversations_insert_deny`

### Metadata security suite
`supabase/tests/chat_v2_phase_b_security.sql` executed on preprod without exception (PASS notices path). Extended with follow-up trigger/policy checks.

### Not yet done (blocks Team enablement)
- JWT behavioral permit/deny tests (cross-org, private channel, forged participant, driver reassignment under `auth.uid()`)
- Attachment / storage RLS for Team paths
- Netlify frontend deploy with explicit flag
- Production apply (requires separate GO)

### Flag
`PULSE_CHAT_TEAM_ENABLED` default restored to **false** (only `EXPO_PUBLIC_PULSE_CHAT_TEAM_ENABLED=true` enables).

---

## Product status

| Area | Status |
|---|---|
| DM | Operational (legacy) |
| Trips | Operational |
| Trip Room | Operational |
| Team 1:1 UI | Implemented, **disabled by default** |
| Channels UI | Create/browse/settings present, **disabled by default** |
| Team attachments | Missing |
| Team unread badge | Hardcoded `0` |
| Search / composer parity | Partial across scopes |

---

## Performance
No new timing harness in this session. WhatsApp-style trip history paging + idle hydrate remain from prior chat work. Measure on gx-pulse after Team enablement.

---

## Tests (this session)

| Suite | Result |
|---|---|
| `chatPlatform.flags.test.ts` | Expect default **false** |
| `chatSlackStreamTabs.test.ts` | Updated for default-off |
| `teamChat.service` / `teamChannel.service` / related | Prior run 6/7 then fix; re-run in flight |
| Phase B SQL metadata on preprod | Pass (no exception) |
| Behavioral JWT security | **Not run** |

---

## Merge / deploy

| Item | Status |
|---|---|
| Isolated chat PR branch | **Not created** — checkout mixes driver pay-run + chat WIP |
| Commits | **Not created** — avoid bundling unrelated dirty files; request dedicated branch |
| Netlify preprod app deploy | **Not performed** this session |
| Feature flag on preprod site | Must stay **unset/false** until JWT security + smoke |
| Production | **No** |

---

## Outstanding blockers (human)

1. Carve a clean `vasanth/chat-v2-preprod` (or similar) branch from the chat-only diff; exclude pay-run migrations.
2. Run JWT negative cases S1–S8 on preprod; fix any failures.
3. Deploy frontend to gx-pulse; set `EXPO_PUBLIC_PULSE_CHAT_TEAM_ENABLED=true` only after sign-off.
4. Smoke DM | Trips | Team | Channels; trip driver reassignment.
5. Separate owner GO for production migrations (map MCP stamps ↔ repo filenames carefully).

---

## Final verdict

### CONDITIONAL PASS

Preprod **backend** Phase B + channel ACL follow-up are applied and metadata-verified. Team remains correctly **gated off**. Full product acceptance (JWT security, Team unread/attachments, clean merge, Netlify deploy, four-scope smoke) is **not** complete — do not report PREPRODUCTION READY.
