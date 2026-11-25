# Pulse Chat V2 — Phase A Implementation Plan

**Status:** Implemented (see `docs/PULSE_CHAT_V2_PHASE_A_DELIVERY.md`)  
**Date:** 2026-11-25  
**Bound by:** Phase A brief (UI + client UX only). No schema, RLS, mirror, or production deploy.

Companion audit: `docs/PULSE_CHAT_V2_THREE_SCOPE_AUDIT.md`.

---

## 1. Findings — current architecture ≠ proposed architecture

### 1.1 Navigation today

| Tab id | Label | Data |
|---|---|---|
| `network` | DMs | `network_*` via **`IntegratedChatContext`** (must keep) |
| `trips` | Trips | `trip_*` lanes with assigned-driver / manual filter |
| `indent` | **Integrated** | Same bootstrap payload, client-partitioned by `indent_id` |

Registry: `features/chat/components/shared/chatSlackStreamTabs.ts`.

There is **no** top-level Team tab. Trip-detail **“Team”** = `TripChatRoomSheet` (`chat_*` trip room). `CHAT_TEAM_ROOMS_SIDEBAR_ENABLED = false`.

### 1.2 Bootstrap today (partial WhatsApp pattern)

| Stage | Present? | Notes |
|---|---|---|
| 1 Immediate shell | Partial | `/chat` can full-screen spin on `useMemberAccess` + lazy chunk; inside ChatScreen shell mounts, but empty lists show centered spinner — **no list skeletons** |
| 2 List init | Partial | Trip disk summaries (`chatBootstrapPersist`); DM disk + 5m memory cache; trip RPC `get_multi_lane_bootstrap` (25 then 20 pages). DM `.limit(100)` no continuation |
| 3 Active thread | Partial | Newest page 20 (trip) / 50 (DM) / 30 (platform); pin-to-bottom; **no body disk cache**; **no scroll restore**; trip `event_stream` hard-capped at **500** |
| 4 Realtime | Mixed | Org-wide UPDATE + per-open INSERT for trips/DMs; Team room org-scoped `chat_messages` filtered client-side; starts at provider mount, not after paint |
| 5 Background refresh | Weak | DM re-fetch after 5m when active; trips mostly realtime + stale heal (concurrency 2); failed bootstrap can mark org done and never retry |

### 1.3 Send / reliability today

| Surface | Optimistic | Failed / retry | Idempotency |
|---|---|---|---|
| Trip lanes | Yes (`sending`) | **Bubble removed on error** — no failed/retry | Timestamp id, not UUID |
| Network DM | Yes | Same silent remove | Same |
| Platform / trip room | Yes + AsyncStorage outbox | Outbox retry | `client_message_id` UUID |

### 1.4 Caching today (reuse, don’t reinvent)

- React Query + `PersistQueryClientProvider` (`pulse-cache-v1`).
- Zustand `useChatStore` (trips).
- Disk: `chatBootstrapPersist`, `networkChatBootstrapPersist`.
- Module in-flight dedupe for network bootstrap.
- **`preloadChatBootstrap` exists but callers pass `{ bootstrap: false }`** — unused on warm path.

### 1.5 Team MVP without schema (feasible)

- Roster: `getOrganizationMembersShared(orgId)` → active, not me, exclude `role === 'driver'`.
- Open 1:1: existing RPC **`ensure_direct_chat`** (already in `chatPlatform.service.ts`, **no UI callers**).
- Thread: reuse `useChatThreadRealtime` + `sendPlatformChatMessage` (same stack as trip room).
- List: **do not** dump raw `get_chat_inbox` (mixes trip rooms). Prefer filtered `chat_conversations` select `direct|channel` + `trip_id is null` with keyset, or whitelist inbox rows carefully.
- Groups: at most optional org-wide `ensure_chat_channel`; no subset-group API without RLS risk.

### 1.6 Hard constraints / Phase B deps (document, don’t “fix” in A)

1. **`chat_*` RLS** still allows org-wide conversation read / loose participant insert — Team 1:1 is **UI-scoped**, not private at DB. Call this out in product acceptance.
2. **500-message stream cap** and **DM limit 100** conflict with unlimited logical access — Phase A can add **client continuation** where APIs already support it; removing hard store caps may need careful store work without schema.
3. No mirror / write-amplification changes in Phase A.
4. Keep trip-lane `integrated_group` / indent **mechanics**; only remove Integrated as a **channel**.

---

## 2. Affected files (Phase A)

### Must change — navigation / Integrated removal

- `features/chat/components/shared/chatSlackStreamTabs.ts`
- `features/chat/components/mobile/ChatSlackMobileChrome.tsx` (`SlackStreamTabId`, people-strip empties)
- `features/chat/components/ChatScreen.tsx` (largest: streams, badges, empty states, deep links, compose)
- `components/FloatingChatButton.tsx`
- `components/DynamicIsland.tsx` (if tab aliases needed)
- New Jest: tab registry asserts no `indent`

### Keep / do not delete

- `features/chat/contexts/IntegratedChatContext.tsx` (DM backend)
- `trip_*` / `network_*` services and providers
- `resolveChatFlow` / `integrated_group` / lane UI inside a trip thread

### Add / wire — Team + UX infrastructure

- `features/chat/constants/chatPlatform.flags.ts` — `CHAT_TEAM_TAB_ENABLED` (optional ship gate)
- `features/chat/services/chatPlatform.service.ts` — Team list query helper (existing tables/RPC only)
- New under `features/chat/`: `useTeamConversations` (or similar), `TeamThread` / list components, shared skeletons
- `features/chat/components/shared/` — conversation-row skeleton, message-bubble skeleton, scope empty states
- `lib/chatUnreadSignal.ts` — independent `dm` / `trips` / `team` badges
- `lib/preloadChatWarmup.ts` — enable early bootstrap where safe

### Trip room rename (copy only)

- Trip-detail tab label “Team” → **“All parties”** or **“Trip room”** to avoid colliding with workspace Team.

### Explicitly out of scope

- Migrations, RLS edits, mirror triggers, dropping tables, deleting `IntegratedChatContext`, Netlify prod.

---

## 3. Implementation plan (incremental A→E)

### A. Navigation + Integrated removal

1. Replace tabs with **DM | Trips | Team** (internal id may keep `network` for DM to shrink diff; map labels/deep links `dm` ↔ `network`, legacy `indent` → `trips`).
2. Delete Integrated stream partition UI, empty states, notice modal, badge split.
3. Fold indent trips into **Trips** list (relax `tripStreamConversations` filter so indent trips appear; party lanes still driven by trip type, not tab).
4. Independent unread: `dmUnread`, `tripUnread`, `teamUnread`.

**Product decision needed:** Trips list shows all eligible trip chats including indent/aggregate, or only driver-assigned? **Recommendation:** all eligible trip conversations under Trips; optional filter chip later.

### B. Conversation bootstrap + loading UX

1. Prefer shell-first: reduce full-route blocking where safe; skeleton rows when list empty + loading.
2. Warm path: call existing `preloadChatBootstrap` on chat intent (`onPressIn`) with `bootstrap: true` once safe.
3. Scope switch: keep per-scope list state; don’t remount providers; clear active subscription on scope change.
4. Workspace switch: invalidate trip store + network cache + Team query; never show previous org rows.

### C. Message rendering + pagination

1. Keep keyset/windowed APIs; target ~20–50 newest messages (already 20/50/30).
2. Shared scroll rules: open → bottom; at-bottom auto-scroll; history → no force scroll + “new messages” chip.
3. Older pages: single-flight guard, preserve anchor (existing trip path is close; harden DM + document).
4. **Do not** raise write amplification; **do not** add offset full-history reads.
5. Soften UX around 500 cap: surface “load earlier” / error honestly; full uncapping deferred if it requires store redesign risk.

### D. Realtime + optimistic UX

1. Trip + DM: on send failure keep bubble as **Failed** + Retry (reuse pending row; no new DB). Use stable client key; still no schema idempotency for trip/DM — document Phase C for `client_message_id` on `send_trip_chat_message`.
2. Dedupe API + realtime by id / optimistic content window (already partially present).
3. Avoid duplicate per-conversation subscriptions; cleanup on leave.
4. Connection banner: offline / reconnecting (NetworkContext) without wiping thread.
5. Platform Team sends already have outbox — reuse.

### E. Tests + verification

1. Tab registry: only DM/Trips/Team; no Integrated.
2. Bootstrap: cold vs warm; scope switch; workspace switch.
3. Send fail → Failed + retry; no silent delete.
4. Realtime duplicate insert.
5. Team: drivers excluded from roster; trip rooms never listed as Team.
6. Lint / typecheck / Jest for touched suites; navigation-policy if routes touched.

---

## 4. Reusable infrastructure (not one-off screen patches)

| Piece | Purpose |
|---|---|
| `ChatScope` type + tab registry | Single source for DM/Trips/Team |
| `ChatListSkeleton` / `ChatThreadSkeleton` | Stage 1–3 loading |
| `useChatScopeUnread` | Independent badges |
| `useTeamConversations` | Roster + direct chats |
| `TeamThread` | Thin wrapper on platform thread hooks |
| Send failure UX helper | Shared Failed + Retry for trip/DM optimistic rows |
| Scroll/new-message controller | Shared stick-to-bottom + chip |

---

## 5. Acceptance checklist (Phase A)

- [ ] Exactly three tabs: DM, Trips, Team  
- [ ] Integrated nav / category / empty states gone  
- [ ] DM still `network_*` + IntegratedChatContext  
- [ ] Trips still `trip_*`; indent trips reachable under Trips  
- [ ] Team = workspace members via existing `ensure_direct_chat` / filtered conversations  
- [ ] Shell + skeletons; no unnecessary full-screen loaders  
- [ ] Progressive list + thread load; pagination keyset  
- [ ] Optimistic send with Failed/Retry for trip & DM  
- [ ] Realtime dedupe + cleanup  
- [ ] Cache keyed by user/org; cleared on logout/workspace switch  
- [ ] No schema / RLS / mirror / prod deploy  
- [ ] Known limitation documented: Team privacy until Phase B RLS  

---

## 6. Decisions requested before coding

1. **Trips list:** include indent/aggregate trips in Trips (recommended) vs keep driver-only filter?  
2. **Team privacy:** ship UI-filtered Team 1:1 knowing RLS is org-readable until Phase B?  
3. **Team groups:** org-wide channel only, or 1:1-only for Phase A?  
4. **FloatingChatButton:** DM + Trips only for preview, or add Team?  
5. **Flag:** ship behind `CHAT_TEAM_TAB_ENABLED` or enable Team immediately?

---

## 7. Explicit next step

On approval of §6 decisions (or “use recommendations”), implement in order **A → E** without combining Phase B/C work.
