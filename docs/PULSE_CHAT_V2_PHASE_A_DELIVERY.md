# Pulse Chat V2 — Phase A Delivery Report

**Date:** 2026-11-25  
**Scope:** UI + client UX only. No schema, RLS, mirror, or production deploy.

## Decisions applied

1. Indent folded into **Trips** (Integrated nav removed; `integrated_group` mechanics kept).
2. **Team** built as workspace 1:1, gated by `PULSE_CHAT_TEAM_ENABLED` / `EXPO_PUBLIC_PULSE_CHAT_TEAM_ENABLED` (default **false**).
3. No org-wide Team channel.
4. Floating chat preview remains **DM + Trips only**.
5. Trip-detail former “Team” label → **Trip room**.

## Features implemented

| Area | Change |
|---|---|
| A Navigation | Tabs: **DM \| Trips \| Team** (Team only when flag on). Legacy `indent`/`integrated` deep links → Trips. |
| A Integrated removal | Integrated channel / empty states / badge split removed from hub UI. |
| A Trips merge | Indent-backed + manual assigned-driver conversations in one Trips list. |
| A Team | `teamChat.service`, `useTeamConversations`, `TeamChatScope` via `ensure_direct_chat` + filtered `chat_conversations`. |
| B Shell / skeletons | `ChatListSkeleton`, `ChatThreadSkeleton`; trip/DM cold load uses skeletons instead of full-area spinner. |
| C Pagination | Existing keyset paths retained (trip/DM/platform); Team uses platform `get_chat_messages`. |
| D Failed + retry | Trip + DM optimistic failures keep the bubble (`markMessageFailed` / `delivery_status: failed`) with Retry. Team uses idempotent `client_message_id`. |
| D Realtime | Team thread uses existing `useChatThreadRealtime` (single conversation, dedupe by id / client_message_id). |

## Files changed (primary)

- `features/chat/constants/chatPlatform.flags.ts`
- `features/chat/components/shared/chatSlackStreamTabs.ts`
- `features/chat/components/mobile/ChatSlackMobileChrome.tsx`
- `features/chat/components/ChatScreen.tsx`
- `features/chat/components/team/TeamChatScope.tsx`
- `features/chat/services/teamChat.service.ts`
- `features/chat/hooks/useTeamConversations.ts`
- `features/chat/components/shared/ChatListSkeleton.tsx`
- `features/chat/components/shared/ChatThreadSkeleton.tsx`
- `features/chat/components/MessageTick.tsx`
- `features/chat/types/chat.types.ts`
- `features/chat/store/useChatStore.ts`
- `features/chat/contexts/TripChatContext.tsx`
- `features/chat/contexts/IntegratedChatContext.tsx`
- `features/chat/components/TripChatRoomSheet.tsx`
- `features/chat/components/ChatTripRoomInboxSection.tsx`
- Tests under `features/chat/**/__tests__/`
- `docs/PULSE_CHAT_V2_PHASE_A_PLAN.md` (status)
- This report

## Non-negotiable safeguards — confirmation

- `IntegratedChatContext` **preserved** (still backs DMs).
- **No** schema / migrations / RLS edits / production DB changes.
- **No** additional message mirroring or duplicate writes.
- Floating preview still DM + Trips only.
- Team production enablement blocked by flag until Phase B.

## Known limitations (Phase B/C)

1. `chat_*` RLS still org-readable for Team 1:1 — UI filter is **not** a security boundary; flag stays off.
2. Trip/DM send still lacks server `client_message_id` idempotency (timeout may double-send on naive retry) — document for Phase C; UI retry reuses the same bubble.
3. Trip `event_stream` 500-cap and DM list `.limit(100)` remain; client continuation softens UX but hard uncapping is deferred.
4. Team unread badge is `0` until a dedicated unread signal exists (Phase B).

## Tests executed

| Suite | Result |
|---|---|
| `chatSlackStreamTabs.test.ts` | 5 passed |
| `teamChat.service.test.ts` | passed (roster excludes self/drivers) |
| `markMessageFailed.test.ts` | 2 passed |
| `DmThreadEmptyState.test.tsx` | passed |
| `IntegratedChatContext.bootstrapDedupe.test.tsx` | passed |

Phase A chat files: no new `tsc` errors (full-project baseline still has pre-existing errors elsewhere).

## Performance notes

- No new global subscriptions; Team subscribes only to the open conversation.
- Conversation list still uses existing bootstrap RPCs; Trips merge is client-side filter only (no extra RPC).
- Write amplification unchanged for trip/DM/platform sends.

## Schema / production

**Confirmed:** no migrations created or applied; no remote DB changes; no production deploy.
