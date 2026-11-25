# Pulse Chat V2 — Phase B Security Audit & Migration Plan

**Status:** Audit complete — implementation in repo (migrations + tests). **No production apply. Team flag stays OFF.**  
**Date:** 2026-11-26  
**Environments inspected:** Preprod `xbisiveavvbifbzyfhgy` (live `pg_policies` + function defs). Local migration history.  
**Constraint:** Preserve Phase A UI. No message mirroring changes. No production deploy without explicit approval.

Companion: `docs/PULSE_CHAT_V2_THREE_SCOPE_AUDIT.md` §4.2, `docs/PULSE_CHAT_V2_PHASE_A_DELIVERY.md`.

---

## 1. Executive findings

| # | Severity | Finding | Impact |
|---|---|---|---|
| B1 | **Critical** | `fn_chat_can_access_conversation` = participant **OR any org member** (no `status` filter) | Every workspace member can read **all** `chat_messages` / Team 1:1 / trip rooms for that org |
| B2 | **Critical** | `chat_conversations_select` same org-wide OR | Team discovery / inbox leak across members |
| B3 | **High** | `chat_participants_insert` allows any accessor to insert **any** `user_id` | Privilege expansion / fake membership |
| B4 | **High** | `chat_messages_update_own` has no `WITH CHECK` on `conversation_id` | Sender can move message into another conversation |
| B5 | **High** | `fn_sync_trip_room_participants` only **INSERT**s — never removes prior drivers/clients | Reassigned drivers retain `chat_participants` rows; access also via B1 org OR |
| B6 | **High** | `fn_chat_is_org_member` ignores `status = 'active'` | Inactive / removed members may still pass helpers |
| B7 | **Medium** | `ensure_direct_chat` peer check ignores `status` and `role` | Inactive users and drivers can be opened as Team peers via RPC |
| B8 | **Medium** | `chat_reactions_write_own` / read-receipts insert only check `user_id = auth.uid()` | Can attach reactions/receipts to messages in inaccessible threads if message id guessed |
| B9 | **Medium** | `chat_participants_delete` allows any conversation accessor to delete **others** | Org member can eject peers |
| B10 | **Low** | `send_chat_message` auto-inserts sender as participant when org access passes | Amplifies B1 into durable participant rows |
| B11 | Info | Network `network_*` + trip `trip_*` lanes use separate RLS (function-based trip SELECT cleaned in 20270131) | Phase B hardens `chat_*` first; network/trip lane regression tests only |
| B12 | Info | Realtime uses table SELECT RLS | Fixing SELECT closes unauthorized `chat_messages` subscriptions |

**Team production enablement is blocked** until B1–B7 are applied and negative tests pass on preprod.

---

## 2. Before inventory (preprod, 2026-11-26)

### 2.1 Helpers

| Function | Definer | Current rule |
|---|---|---|
| `fn_chat_is_org_member(org)` | DEFINER | `organization_members` match on `user_id` — **no status** |
| `fn_chat_is_participant(conv)` | DEFINER | Row in `chat_participants` |
| `fn_chat_can_access_conversation(conv)` | DEFINER | Participant **OR** any org member of `cc.organization_id` |
| `fn_can_access_trip_for_chat(trip)` | DEFINER | Host org member **OR** current driver **OR** linked client/supplier org member |
| `ensure_direct_chat` | DEFINER | Self + peer in org (peer status/role unchecked) |
| `send_chat_message` | DEFINER | `fn_chat_can_access_conversation` then insert + upsert self participant |
| `fn_sync_trip_room_participants` | DEFINER | Fan-in INSERT only (active members for sync paths) |

### 2.2 RLS policies (`chat_*`)

| Table | Policy | Gap |
|---|---|---|
| `chat_conversations` | SELECT org OR participant | Org-wide leak |
| `chat_conversations` | INSERT/UPDATE org member | OK if member helper tightened |
| `chat_participants` | INSERT if can_access | Arbitrary `user_id` |
| `chat_participants` | DELETE self OR can_access | Others deletable |
| `chat_messages` | SELECT can_access | Inherits B1 |
| `chat_messages` | INSERT own + can_access | OK once can_access fixed |
| `chat_messages` | UPDATE own sender only | **No immutable conversation_id** |
| `chat_attachments` | SELECT via message access | Inherits B1 |
| `chat_reactions` | INSERT own uid only | Missing message ACL |
| `chat_read_receipts` | INSERT own uid only | Missing message ACL |
| `chat_audit_log` | SELECT org member | Broad; acceptable for ops after active filter |

### 2.3 Trip participation revoke

`trg_sync_trip_room_on_trip_update` → `fn_sync_trip_room_participants`: adds current roster, **does not delete** prior `participant_role = 'driver'` (or stale client/supplier). Even after revoke-from-table, B1 still grants host-org members full message read.

### 2.4 DM (network_*) / trip lanes

Separate from Team. Trip lane SELECT consolidated to single function policies. Network policies require org membership of party A/B. Phase B does not rewrite network schema; adds regression assertions only.

### 2.5 Storage

`trip-documents` party policies (`20271012203000`) gate `trip_chat/{conversationId}/…` via conversation→trip access. Hardening `chat_*` SELECT reduces forged conversation id usefulness; storage path still must resolve to an authorized trip.

---

## 3. Target authorization model

### Team (`conversation_type = 'direct'` | `'channel'`)

- Active workspace members only (`organization_members.status = 'active'`).
- Drivers (`role = 'driver'`) are **not** Team peers via `ensure_direct_chat`.
- Read/write/discover: **must be a `chat_participants` row** for that conversation **and** still an active member of the conversation’s org.
- Removed members lose access immediately (membership check), even if participant row remains (cleanup optional).

### Trips (`conversation_type = 'trip'`, and trip-scoped lanes where applicable)

- Access = **live** `fn_can_access_trip_for_chat(trip_id)` (assigned driver, host org active members, linked client/supplier orgs).
- Reassigned drivers: fail trip ACL; sync **deletes** stale driver participant rows.
- History rows remain in DB; unauthorized users cannot SELECT/send/subscribe.

### DM (network_* Phase B)

- No schema change. Confirm existing org-party policies still deny cross-org forge.

---

## 4. Migration plan (additive, controlled)

| Step | File | Change |
|---|---|---|
| 1 | `…_chat_v2_phase_b_access_helpers.sql` | Active membership; type-aware `fn_chat_can_access_conversation`; trip helper uses active membership |
| 2 | same / follow-on | Participant insert = self only; delete = self only; message immutable keys trigger; reaction/receipt ACL |
| 3 | same | `fn_sync_trip_room_participants` revoke stale drivers/clients/suppliers/inactive |
| 4 | same | `ensure_direct_chat` peer: active + non-driver |
| 5 | Tests | `supabase/tests/chat_v2_phase_b_security/` negative cases |
| 6 | Apply | **Preprod only** after dry-run + owner GO. **Not prod.** Team flag remains false until acceptance. |

No new mirrors. No table drops. Rollback = restore prior function/policy definitions from this audit’s “before” inventory.

---

## 5. Acceptance criteria (security)

- [ ] Workspace A JWT cannot SELECT Team/direct messages of workspace B
- [ ] Org member who is **not** a participant cannot SELECT another member’s `direct` thread
- [ ] Inactive member cannot pass `fn_chat_is_org_member`
- [ ] Cannot INSERT `chat_participants` for another `user_id` as authenticated
- [ ] Cannot UPDATE `chat_messages.conversation_id` to a foreign conversation
- [ ] After driver reassignment, previous driver fails `fn_can_access_trip_for_chat` and SELECT on trip room messages
- [ ] `ensure_direct_chat` rejects drivers and inactive peers
- [ ] Realtime: unauthorized SELECT ⇒ no event delivery (RLS)
- [ ] Existing trip lane + network DM happy paths still work
- [ ] `PULSE_CHAT_TEAM_ENABLED` remains default false until sign-off

---

## 6. Performance notes

- Prefer single SECURITY DEFINER helpers (already pattern) to avoid RLS recursion.
- Type-aware access adds one `conversation_type` branch — indexed PK lookup on `chat_conversations.id`.
- Participant revoke is set-based DELETE per sync — bounded by conversation size.
- Avoid adding per-row recursive subqueries in policies beyond existing helper calls.

---

## 7. Team production enablement recommendation

**Do not enable** `EXPO_PUBLIC_PULSE_CHAT_TEAM_ENABLED` / `PULSE_CHAT_TEAM_ENABLED` until:

1. Phase B migrations applied on **preprod** and negative SQL suite green.
2. Manual S1–S8 from three-scope audit exercised on gx-pulse.
3. Explicit product/security sign-off.
4. Separate approval to apply the same release set to **prod**, then flip the flag in a controlled deploy.

---

## 8. Explicit non-actions

- No production `db push` / release-set apply from this Phase B work without written GO.
- No mirror trigger changes.
- No deletion of `IntegratedChatContext` or `trip_*` / `network_*` stores.
- No org-wide Team channel.
