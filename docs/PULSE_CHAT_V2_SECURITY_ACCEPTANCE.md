# Pulse Chat V2 — Security Acceptance (Preprod)

**Date:** 2026-11-26  
**Target:** `xbisiveavvbifbzyfhgy` (preprod) only  
**Production `nafxpivddesgsrthmosv`:** not modified  
**Branch worktree:** `merge/driver-ui-polish-v101` @ `24e1dc65c` (dirty mixed tree)  
**Local CLI project-ref:** was `nafxpivddesgsrthmosv` — **not used**. All DB ops via MCP with explicit preprod project id.

Evidence: `changes/evidence/chat-v2-security-closure/`  
Prior reassignment acceptance: `changes/evidence/network-award-auth-recovery/DRIVER_REASSIGN_PREPROD_ACCEPTANCE.md`

---

## Architecture map

```
DM | Trips / Trip Room | Team / Channels
        │
        ▼
 shared identity (auth.uid + organization_members)
        │
        ├── network_*  (IntegratedChatContext — DM legacy store, still active)
        ├── trip_*     (party lanes + private.user_can_read_trip_*)
        └── chat_*     (fn_chat_can_access_conversation + Phase B RLS)
              ├── type=direct   → Team 1:1 (ensure_direct_chat)
              ├── type=channel  → Team channels (team_* RPCs)
              ├── type=trip     → Trip Room
              └── type=trip_lane→ mirrored lanes (trip ACL)
        │
        ├── Realtime: Postgres changes filtered by SELECT RLS
        └── Attachments: private trip-documents bucket (trip_chat/*); Team text-only
```

### Legacy path classification

| Path | Class |
|---|---|
| `IntegratedChatContext` + `network_*` | Active and required (DM) |
| `trip_*` party lanes | Active and required (Trips) |
| `chat_*` trip / trip_lane mirrors | Active and required (Trip Room + mirror) |
| `ensure_chat_channel` | Deprecated but still referenced (public-only fallback) |
| Team UI + channel RPCs | Active; flag default ON in client |

---

## Threat / authorization matrix (executed)

| Gate | Attempt | Expected | Actual |
|---|---|---|---|
| A | Org member C reads A↔B Team DM | Deny | Deny (`MATRIX_ABF_PASS`) |
| A | C inserts message / self-joins participants | Deny | Deny |
| A | B reads A↔B DM | Allow | Allow |
| B | C reads private channel meta/messages | Deny | Deny |
| B | C joins private channel RPC | Deny | Deny |
| B | C or non-admin B flips `metadata.visibility` | Deny | Deny (after fix) |
| B | Other-org user reads private channel | Deny | Deny |
| C | Driver reassign A→B→null→A + idempotent | Access follows live `trips.driver_id` | `MATRIX_PASS` |
| D | Previous driver SELECT trip room messages after reassign | Deny | `ROOM_ACL_PASS` |
| D | New driver reads history | Allow | Allow |
| F | Mutate `chat_messages.conversation_id` | Deny (immutable trigger) | Deny |

---

## Confirmed defects fixed this session

1. **Channel UPDATE bypass** — any accessor could rewrite `metadata.visibility` via PostgREST.  
   Fix: `20271126235045_chat_v2_channel_update_acl_and_archive.sql` (preprod stamp `20261125202715` / name `chat_v2_channel_update_acl_and_archive`). Channel UPDATE requires `fn_chat_channel_is_admin`; admin helper requires active org membership; archive/audit SELECT uses conversation ACL.

2. **Private create fallback downgrade** — missing RPC fell through to `ensure_chat_channel` (always public).  
   Fix: `teamChannel.service.ts` refuses private create when RPC missing + Jest coverage.

Preserved (already accepted): driver reassignment null-safe sync + live ACL (`20271126221530` / `31500` / `32000` family on preprod).

---

## Preprod migrations (Chat V2 relevant)

| History version | Name |
|---|---|
| `20261125200642` | `chat_v2_phase_b_rls_hardening` |
| `20261125200648` | `team_chat_channel_management` |
| `20261125201048` | `sync_trip_conversation_driver_on_reassign` |
| `20261125201721` | `trip_driver_reassign_null_and_live_acl` |
| `20261125201829` | `chat_conversations_immutable_allow_legacy_fk` |
| `20271126224500` | `chat_v2_phase_b_conversation_acl_followup` |
| `20261125202715` | `chat_v2_channel_update_acl_and_archive` |

Local filenames use `20271126*` prefixes; MCP apply stamps may differ — map before any prod apply.

---

## Remaining known limitations

1. **Signed URLs** for trip attachments remain valid until expiry (~3600s). Not immediately revoked on driver reassignment. Documented product limitation.
2. **Team attachments** not implemented (storage path is `trip_conversations`-keyed).
3. **Websocket Realtime delivery** not instrumented with independent clients; authorization proven via the same SELECT RLS Realtime applies (`ROOM_ACL_PASS`).
4. **`trip_lane` cross-party read** via `fn_can_access_trip_for_chat` remains product behavior (any trip party can read mirrored lanes).
5. **No Netlify/app deploy** in this session — Team flag is ON in source; deployed site may lag until rebuild.
6. **Dirty branch** — chat security work is not isolated into a clean PR branch.
7. **Local CLI linked to prod** — operators must use MCP/preprod link; never `db push` from this checkout without re-link.
