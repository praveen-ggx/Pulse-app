# Pulse Chat V2 — Three-Scope Architecture & Dependency Audit

**Status:** Draft audit — **awaiting product/engineering approval**  
**Date:** 2026-11-25  
**Constraint:** No production data changes, no destructive migrations, no deploy, and no chat implementation edits until this document is explicitly approved.

**Decision under review:** One messaging engine, three conversation scopes (**DM · Trips · Team**), one authorization system (existing Pulse identity + workspace RBAC + trip participation + network relationships + Supabase RLS). Completely remove the **Integrated Chat** product experience.

---

## 0. Executive summary

| Finding | Detail |
|---|---|
| Product ask | Replace bottom nav `DMs / Trips / Integrated` with `DM / Trips / Team`. Delete Integrated navigation, classification, and related empty-state UX. |
| Architecture ask | Shared conversation service; scopes `DM`, `TRIP`, `TEAM`; no parallel permission system. |
| Current reality | **Three parallel stores** still live: `trip_*` (per-lane ops), `network_*` (org DMs), `chat_*` (trip “Team room” + unused DM/channel RPCs). |
| Canonical claim vs code | ADR-008 / MCD say `chat_*` is canonical, but **most human messaging still reads/writes `trip_*` and `network_*`**. `chat_messages` is primary only for Trip Room. |
| Write cost | Lane send ≈ **5 DB writes** via forward mirror (`trip_messages` → `chat_messages` + conversation + audit). Operational/status paths can be higher. |
| Naming trap | UI tab **“Integrated”** ≠ context **`IntegratedChatContext`**. The context backs **Network DMs**. The tab filters **trips that have an `indent_id`**. |
| Team naming trap | Today’s trip-detail **“Team”** tab = multi-party **trip room** (`conversation_type = 'trip'`). Product **Team** in this redesign = **workspace-member** chat — a different scope. Do not conflate them. |
| First gate | Approve this audit (matrix + migration shape + security plan) before any UI cutover or schema work. |

---

## 1. Proposed product structure (target)

```
Pulse Business Chat
├── DM      → business contacts (clients / suppliers with eligible network relationship)
├── Trips   → one conversation (or structured trip thread model) per eligible trip
└── Team    → workspace members only (1:1 + groups)
```

**Remove completely**

- Bottom / sidebar option **Integrated** (`SlackStreamTabId = "indent"`).
- Integrated trip stream partition (`indentStreamConversations`, hub “integrated” empty copy, compose rules keyed on indent).
- Any UX that classifies conversations as “Integrated” as a third top-level channel.
- Do **not** delete trip messaging tables or trip-lane mechanics in the first slice — only the **product channel** named Integrated.

**Non-goals for v1 cutover**

- Drivers do **not** become Team members by trip assignment.
- Clients/suppliers do **not** gain workspace membership by joining a trip conversation.
- No new `chat.permission.*` parallel ACL.

---

## 2. Current state — dependency map

### 2.1 Data stores

| Store | Tables | Primary product use today | Writers | Readers |
|---|---|---|---|---|
| Legacy trip lanes | `trip_conversations`, `trip_messages` | Dispatcher/client/supplier/driver **per-party lanes**; bootstrap; feedback; ledger/assignment bridges | `send_trip_chat_message`, direct upserts, bridges | `chat.service.ts`, Driver + Trip contexts, `get_initial_chat_state` / multi-lane bootstrap |
| Network DM | `network_conversations`, `network_messages` | **DMs tab** (misnamed provider `IntegratedChatContext`) | `networkConversation.service.ts`, `sendNetworkMessage` | `IntegratedChatContext`, Network desktop panel |
| Platform / Trip Room | `chat_conversations`, `chat_messages`, `chat_participants`, `chat_audit_log`, `chat_attachments`, `chat_push_outbox`, … | **Trip Team room** sheet + disabled sidebar inbox | `send_chat_message`, room ensure RPCs; **plus mirror from `trip_messages`** | `chatPlatform.service.ts`, `useTripChatRoom`, `useChatThreadRealtime` |

Foundation migration: `supabase/migrations/20260917000000_pulse_chat_platform_foundation.sql`  
Trip room phase: `20260918000000_trip_chat_room_phase2.sql` (+ later ranking/guard migrations).

`chat_conversations.conversation_type` already includes:  
`direct | direct_org | trip | trip_lane | customer | supplier | channel | system` — usable as a starting point for scope mapping (see §4).

### 2.2 Mirror / amplification (do not reproduce)

Forward-only triggers (trip → chat), still present:

- `trg_chat_mirror_trip_message_insert` / `_update`
- `trg_mirror_operational_to_trip_room` (operational → trip room action cards)
- Conversation sync + `chat_audit_log` + push outbox enqueue on `chat_messages`

Approximate cost for a plain lane text send: **~5 row writes** (`trip_messages`, `trip_conversations`, `chat_messages`, `chat_conversations`, `chat_audit_log`). First message in a lane may add conversation ensure. Status broadcast / integrated-indent clone paths multiply further.

Gaps already documented in-repo (`docs/CHAT_MIGRATION_DISCOVERIES_2026.md`, `docs/MESSAGING_MIGRATION_EXECUTION_PLAN.md`):

- Mirror UPDATE omits reactions / reply_to / delivery ticks.
- Mirror failures can roll back primary send (no EXCEPTION swallow — called out as live risk).
- Unread models differ: denormalized `unread_dispatcher_count` vs `chat_participants.last_read_at` — **never reconciled**.

### 2.3 UI navigation today

Source of truth for bottom tabs: `features/chat/components/shared/chatSlackStreamTabs.ts`

| Tab id | Label | Backing data |
|---|---|---|
| `network` | DMs | `network_*` via `IntegratedChatContext` |
| `trips` | Trips | `trip_*` lanes where trip has assigned driver (manual hub rules) |
| `indent` | **Integrated** | `trip_*` lanes where trip has `indent_id` |

Related: people strip (`ChatSlackPeopleStrip`), filter chrome (`constants/ChatFilterChrome.ts`), deep links `?tab=trips|network|indent`.

**Trip-detail “Team” tab** (`tripTeamRoomTab.util.ts` + `TripChatRoomSheet`) is **trip-scoped platform room**, not workspace Team chat.

### 2.4 Entry points (inventory)

| Surface | Path / component | Store |
|---|---|---|
| Dispatcher chat route | `app/chat.tsx` → `ChatRouteContent` → `ChatScreen` | trip + network + optional trip room |
| Floating / Dynamic Island | `FloatingChatButton`, `DynamicIsland` | deep-link into ChatScreen |
| Driver chat | `app/(driver)/chat.tsx` → `DriverChatScreen` | `trip_*` |
| Trip detail room | `TripDetailScreen` lazy `TripChatRoomSheet` | `chat_*` |
| Network desktop | `NetworkDesktopChatFlexPanel` | `network_*` |
| Capability gate | `sales.chat` (`lib/memberSurfaces.ts`, enforced in `app/chat.tsx`) | — |

### 2.5 Realtime footprint

`ChatScreen` can hold **three** simultaneous postgres change sets: `trip_*`, `network_*`, and (when Team room open) `chat_*`. Target architecture should collapse to **one subscription model per open conversation**, scoped by authorized conversation id — not three provider wrappers forever.

### 2.6 Push / attachments

- Push: `chat_push_outbox` drained by `supabase/functions/send-push-notifications`; enqueue from `chat_messages` triggers.
- Media: private bucket `trip-documents` under `trip_chat/{conversationId}/…` (`chatImageUpload.util.ts`). Attachment auth must follow conversation auth after cutover.

### 2.7 Existing docs this audit builds on (do not ignore)

- `docs/ADR-008-trip-room-messaging-model.md` — Option A (replace) resolved in principle.
- `docs/MESSAGING_CONSOLIDATION_DESIGN.md` — frozen design; network called out as separate.
- `docs/MESSAGING_MIGRATION_EXECUTION_PLAN.md` — R0–R6 **draft, not executed**.
- `docs/REALTIME_MESSAGING_ARCHITECTURE_REVIEW.md`, `docs/CHAT_MIGRATION_DISCOVERIES_2026.md`.

**Pulse Chat V2 does not replace that migration plan — it productizes scopes on top of it and forces Network into the same engine.**

---

## 3. Target architecture

```
┌─────────────────────────────────────────────┐
│  Pulse Chat UI:  DM  ·  Trips  ·  Team      │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│  Conversation Service (shared)                │
│  list / search / unread / send / edit / react │
│  attachments / realtime / notifications       │
└─────────────────────┬───────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   scope=DM      scope=TRIP    scope=TEAM
   discovery     discovery     discovery
   + authorize   + authorize   + authorize
        │             │             │
        └─────────────┼─────────────┘
                      ▼
┌─────────────────────────────────────────────┐
│  Canonical message store (target: chat_*)     │
│  + chat_participants + audit + push outbox    │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│  Identity · workspace membership · RBAC       │
│  Trip participation · network relationships   │
│  RLS + SECURITY DEFINER RPCs (server)          │
└─────────────────────────────────────────────┘
```

### 3.1 Scope mapping onto existing `conversation_type`

| Product scope | Proposed `conversation_type` / channel_key | Notes |
|---|---|---|
| **DM** | Prefer unify on `direct` or `direct_org` with explicit `channel_key` | Today Network uses `network_*`; platform already has `ensure_direct_chat` **with no UI callers**. |
| **Trips** | `trip` (room) and/or `trip_lane` during transition | End state: one trip conversation model with participant roles; lanes may become filters/threads, not separate top-level nav. |
| **Team** | `channel` (groups) + `direct` where both parties are **workspace members** | Must filter by `organization_members` of **active workspace**, not network partners. |

### 3.2 Shared vs scope-specific

**Shared:** message CRUD, attachments, typing, reactions, search FTS, unread cursors, push payload shape, audit log, outbox sync, composer UI, thread chrome.

**Scope-specific:** discovery RPCs, “New conversation” affordances, list projections, empty states, deep links from trip/client/supplier profiles.

### 3.3 Write-path principle

- **Single primary write** into canonical store.
- No permanent forward+reverse dual-write.
- Temporary compatibility mirrors only behind flags with exit criteria (reuse MCD R3–R6 discipline).
- Fix mirror exception handling before expanding write surface (already a production correctness gap).

---

## 4. RBAC / authorization matrix (critical)

UI visibility is **never** sufficient. Every list, open, send, subscribe, and attachment URL must re-check.

| Scope | Who may discover | Who may read history | Who may send | Who must lose access | Server primitives to reuse |
|---|---|---|---|---|---|
| **DM** | Orgs with eligible **network / linked business** relationship (today: `get_integrated_partners` / linked client-supplier orgs) | Parties on that DM conversation | Same, if membership + `sales.chat` (or successor surface) allows | Relationship revoked / org unlink | Network relationship tables + org membership; tighten so “has Pulse account” ≠ messageable |
| **Trips** | Users with trip-level authorization (assigned driver, host org ops with trip ACL, linked client/supplier on **that** trip) | Same, evaluated at read time | Same | **Driver reassignment**, party unlink, trip cancel policy (history may remain auditable but not writable) | Existing `private.user_can_read_trip_*` patterns + `fn_sync_trip_room_participants` / refresh on `trips` UPDATE |
| **Team** | Active **workspace** `organization_members` only | Participants of that Team conversation | Participants / creators per RBAC | Member removed from workspace; workspace switch | `organization_members` (prefer `status = 'active'`); **no** clients/suppliers/drivers unless they are members |

### 4.1 Explicit exclusions

| Actor | DM | Trips | Team |
|---|---|---|---|
| Unlinked client/supplier contact | No | No | No |
| Assigned driver | No (unless also member) | Yes (assigned trip only) | No |
| Fleet owner / ops on host org | If network-eligible | Per trip ACL | Yes if workspace member |
| Client org linked on trip | If network-eligible | That trip only | No |
| User in workspace B | No access to workspace A Team by ID guessing | No | No |

### 4.2 Known authorization gaps to fix during implementation (not ship as-is)

From schema audit of `chat_*` RLS (`20260917000000`):

1. **`chat_participants` INSERT** can add arbitrary `user_id` if caller can access conversation → privilege expansion.
2. **`chat_messages` UPDATE own** lacks column restrictions → possible `conversation_id` move.
3. **Org membership helpers** may ignore `status = 'active'` unlike legacy trip policies.
4. **Lane mirrors** in `chat_*` are host-org oriented; linked orgs still depend on `trip_*` for lane read — cutover must not strand them.

These must be closed **before** declaring `chat_*` the sole server of DM/Team traffic.

---

## 5. Migration & backward-compatibility plan

### Phase A — Product cutover (UI only, reversible) — **candidate first ship**

1. Replace `SLACK_STREAM_TABS` with `DM | Trips | Team`.
2. Remove Integrated stream partition and copy; fold indent trips into **Trips** list (with optional filter chip “Indent / marketplace” if ops still need it — chip ≠ third channel).
3. Wire **Team** tab to workspace-member conversations only (initially may be empty / `ensure_direct_chat` among members + groups via `ensure_chat_channel`).
4. Keep `trip_*` and `network_*` writers unchanged.
5. Rename `IntegratedChatContext` → `NetworkChatContext` (optional but reduces confusion).
6. Independent unread badges: `dmUnread`, `tripUnread`, `teamUnread` (stop coupling badges to search filters).

**Exit:** Three tabs only; Integrated gone; no schema drop; no mirror change.

### Phase B — Authorization hardening

1. Patch `chat_*` RLS gaps above.
2. Trip participant refresh on driver/client/supplier change (already partially via `trg_sync_trip_room_on_trip_update` — verify revoke semantics for prior drivers).
3. Realtime: subscribe only to conversations the JWT can access; reject cross-workspace channel ids.

### Phase C — Store consolidation (align with MCD R2–R6, extend Network)

1. Prepare dual-shape readers.
2. Move DM from `network_*` → `chat_*` (`direct` / `direct_org`) with flag + reverse mirror if needed for old clients.
3. Move trip lane send to canonical write (driver first, then dispatcher/client/supplier) per MCD.
4. Migrate edit/delete/react that still hit `trip_messages` while UI reads `chat_*`.
5. Drop forward mirror only when no writers remain; retain tables read-only for audit window.
6. **Never** `DROP TABLE trip_messages` in the first production release.

### Phase D — Performance

1. Eliminate 5-write path.
2. Collapse ChatScreen’s triple realtime providers.
3. Remove artificial `.limit(100)` without continuation on network conversation list / compose trip list (Pulse unlimited logical access rule).

---

## 6. Security & QA test plan

| # | Case | Expected |
|---|---|---|
| S1 | User swaps workspace; opens old Team conversation id | Deny read/send/subscribe |
| S2 | User crafts DM to unrelated Pulse org | Deny discover + send |
| S3 | Client opens trip conversation for unrelated trip | Deny |
| S4 | Driver reassigned; old driver opens prior trip thread | No send; read policy per audit decision (recommend: no live access, history retained server-side for org audit roles) |
| S5 | Supplier on trip A cannot open trip B | Deny |
| S6 | Removed workspace member | Team conversations disappear; tokens cannot subscribe |
| S7 | Realtime INSERT forged for foreign conversation_id | RLS/filter rejects |
| S8 | Attachment signed URL for foreign conversation path | Deny |
| S9 | Unread counts | Independent per DM/Trips/Team; no filter-skew on global badge |
| S10 | Concurrent offline retries | Idempotent via `client_message_id` once send RPC supports it |
| S11 | Mirror failure (pre-cutover) | Primary send must not roll back once EXCEPTION fix lands |
| S12 | Driver is not listed in Team compose | Pass |

Automated anchors to add: RLS SQL tests, Jest for tab registry (no `indent`), RPC authorize negative tests, e2e smoke for three tabs.

---

## 7. Files / modules requiring modification (when approved)

### UI / navigation (Phase A)

- `features/chat/components/shared/chatSlackStreamTabs.ts`
- `features/chat/components/mobile/ChatSlackMobileChrome.tsx`
- `features/chat/components/ChatScreen.tsx` (largest — stream partitions, badges, empty states, deep links)
- `features/chat/components/shared/ChatSlackMirrorToggle.tsx` (if layout changes)
- `components/FloatingChatButton.tsx`, `components/DynamicIsland.tsx`
- `features/chat/constants/chatPlatform.flags.ts` + `ChatTripRoomInboxSection.tsx` (Team stream)

### Contexts / services

- `features/chat/contexts/IntegratedChatContext.tsx` (rename + DM scope)
- `features/chat/contexts/TripChatContext.tsx`, `DriverChatContext.tsx`
- `features/chat/services/chat.service.ts`, `networkConversation.service.ts`, `chatPlatform.service.ts`
- `lib/chatUnreadSignal.ts`, `lib/preloadChatWarmup.ts`, `components/LazyChatProviders.tsx`
- `app/chat.tsx` (capability gate remains; tab deep links)

### Schema / RPC (Phase B–C only, after approval)

- New additive migrations (never `000000` midnight collisions; use `supabase migration new`)
- Mirror trigger EXCEPTION fix
- RLS tighten on `chat_participants` / `chat_messages`
- DM ensure RPCs constrained to network-eligible pairs
- Team ensure RPCs constrained to same-org active members
- Participant revoke on trip reassignment

### Do not touch in Phase A

- Dropping `trip_*` / `network_*`
- Removing assignment/feedback/ledger chat bridges
- Changing marketplace indent trip mechanics (only stop treating them as a third **channel**)

---

## 8. Alignment with prior “canonical chat_*” work

| Prior plan | Chat V2 implication |
|---|---|
| ADR-008 Option A | Still valid: one engine end-state |
| MCD “Network out of scope” | **Superseded for product:** Network **is** DM and must enter the same engine |
| Trip Room as “Team” | Rename in UX: trip room lives under **Trips**, not **Team** |
| R0–R6 execution plan | Remains the store-migration backbone; Phase A UI can ship earlier |

---

## 9. Recommended execution order (after approval)

1. **Approve this audit** (product sign-off on Team definition + Integrated removal + driver/client exclusion rules).
2. Phase A UI cutover behind a short-lived feature flag if desired; soak on preprod.
3. Phase B RLS/participant revoke hardening.
4. Resume MCD-style store consolidation with Network/DM included.
5. Controlled prod release; metrics: write amplification, send p95, unauthorized deny rates, unread accuracy.

---

## 10. Acceptance criteria (product)

- Exactly three chat experiences: **DM**, **Trips**, **Team**.
- Integrated channel and its carousel/classification UX are gone.
- Shared messaging infrastructure; no third engine.
- Authorization uses existing Pulse identity / workspace RBAC / trip participation / network rules — enforced server-side.
- History retained; no unnecessary permanent dual-write.
- Drivers/clients/suppliers do not inherit Team membership from trip participation alone.

---

## 11. Explicit non-actions until approval

- [ ] No chat UI PR merged for V2 tabs
- [ ] No migration that drops or renames `trip_*` / `network_*`
- [ ] No production `db push` for chat
- [ ] No Netlify deploy gated on this redesign

**Approval requested:** Product + eng owners to confirm §1 Team definition, §4 matrix (especially prior-driver read policy), and whether Phase A may ship before store consolidation.
