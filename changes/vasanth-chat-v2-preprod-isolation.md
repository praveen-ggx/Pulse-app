# Chat V2 preprod isolation (allowlist inventory)

## What
Chat V2 (DM | Trips | Team) isolated onto a clean branch cut from `nihas/V1` (`4dedf625c`), copied from the dirty `merge/driver-ui-polish-v101` working tree. Team tab is default ON (`EXPO_PUBLIC_PULSE_CHAT_TEAM_ENABLED=false` opts out).

## Why
Deploy Chat V2 to preprod without driver pay-run, finance, auth recovery, network award or unrelated driver UI polish.

## Areas
- `features/chat/**` — taken from the dirty tree (the dirty chat edits sit on top of commit `24e1dc65c`, so chat-local pieces of it come along: stage-revoke cards, driver trip chrome, inbox time/shipper-name helpers). Pieces that need non-chat code were left out (see Excluded).
  - Team: `components/team/**`, `services/teamChannel.service.ts`, `services/teamChat.service.ts`, `hooks/useTeamChannels.ts`, `hooks/useTeamConversations.ts`, `utils/teamChannelSlug.util.ts`
  - `hooks/useDispatcherIncomingUnreadAlert.ts`, `components/DispatcherUnreadAlertToast.tsx`
  - `constants/chatPlatform.flags.ts`, `components/shared/chatSlackStreamTabs.ts`
  - Tests under `features/chat/**/__tests__/`
  - Chat-local helpers from `24e1dc65c` that dirty chat code imports: `utils/driverChatTripChrome.util.ts`, `utils/driverIncomingShipperMessage.util.ts`, `utils/stageRevokeChat.util.ts`, `components/ChatStageRevokeCard.tsx` (+ tests).
- `features/network/components/StoryReel.tsx` — only the `desktopRail` prop that `ChatScreen` desktop passes.
- Small type fixes made during isolation: `ChatScreen` legacy fallback `laneAvatar` -> `rowIdentity`; `TeamChatScope` time `?? ""`; `useChatStore` preview `?? null`; `DriverChatConversationRow.trip_status`.
- `features/trips/hooks/useReassignTrip.ts` — chat/driver-surface invalidation on reassign.
- Migrations (8) + `supabase/tests/chat_v2_phase_b_security.sql`.
- Docs `docs/PULSE_CHAT_V2_*.md`; evidence `changes/evidence/chat-v2-security-closure/**`, `changes/evidence/network-award-auth-recovery/DRIVER_REASSIGN_PREPROD_ACCEPTANCE.md`.

## Migrations
- 20271126104530_chat_v2_phase_b_rls_hardening.sql
- 20271126210000_team_chat_channel_management.sql
- 20271126221530_sync_trip_conversation_driver_on_reassign.sql
- 20271126223045_trip_chat_preserve_human_preview_on_system_log.sql
- 20271126224500_chat_v2_phase_b_conversation_acl_followup.sql
- 20271126231500_trip_driver_reassign_null_and_live_acl.sql
- 20271126232000_chat_conversations_immutable_allow_legacy_fk.sql
- 20271126235045_chat_v2_channel_update_acl_and_archive.sql

Not included (not on allowlist, needs a decision): `20271126235530_ensure_direct_chat_requires_auth_user.sql` (Team DM eligibility requires an auth.users row).

## Excluded
`features/pay-run/**`, `app/finance-pay-run/**`, all driver_pay_run / terminate_driver migrations, `features/drivers/**`, `features/finance/**`, `features/auth/**`, auth reset-password, emailValidation, `app/_layout.tsx`, `lib/routes.ts`, `lib/queryKeys.ts`, `lib/memberSurfaces.ts`, `lib/navigationPolicy/**` (all dirty hunks there are pay-run), `scripts/supabaseProject.cjs`, driver incoming-message popup/FAB/host/toast + `useDriverIncomingMessageAlerts`, location-ping (`ChatPingLocationAction`, `useChatPingDriverLocation`, `locationPingChatPayload`, `ChatLocationSystemCard` and `DriverChatSlackThread` left at V1; ChatScreen ping hunks removed) — they need `constants/Theme.ts`, tracking broadcast and `features/driver/**` changes from `24e1dc65c`.

## Tested
Targeted Jest: chatPlatform.flags, chatSlackStreamTabs, features/chat/services, teamChannelSlug.
