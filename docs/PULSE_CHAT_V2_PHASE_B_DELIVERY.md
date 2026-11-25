# Pulse Chat V2 — Phase B Delivery Report

**Date:** 2026-11-26  
**Scope:** Authorization / RLS / RPC hardening for `chat_*` (Team + trip room).  
**Production apply:** **NOT done.** Team flag remains **OFF**.

Audit: [`docs/PULSE_CHAT_V2_PHASE_B_SECURITY_AUDIT.md`](./PULSE_CHAT_V2_PHASE_B_SECURITY_AUDIT.md)

---

## 1. Before → after (policy / helper inventory)

| Object | Before | After (migration `20271126104530`) |
|---|---|---|
| `fn_chat_is_org_member` | Any membership row | `status = 'active'` required |
| `fn_chat_can_access_conversation` | Participant **OR** any org member | Type-aware: Team/direct = participant+active; trip = live `fn_can_access_trip_for_chat` |
| `fn_can_access_trip_for_chat` | Org member (no status) | Active membership on host/linked orgs |
| `chat_conversations_select` | Org OR participant | `fn_chat_can_access_conversation(id)` only |
| `chat_participants_insert` | Any accessor, any `user_id` | `user_id = auth.uid()` + can_access |
| `chat_participants_delete` | Self OR can_access | Self only |
| `chat_messages` UPDATE | Sender only, mutable keys | Immutable-keys trigger + can_access WITH CHECK |
| `chat_reactions` INSERT | Own uid only | + message conversation ACL |
| `chat_read_receipts` INSERT | Own uid only | + message conversation ACL |
| `fn_sync_trip_room_participants` | INSERT only | INSERT + DELETE stale driver/client/supplier/inactive |
| `ensure_direct_chat` | Peer any org member | Peer active **and** not `driver` |

---

## 2. Security findings & fixes

See audit §1 (B1–B10). All Critical/High items addressed in the migration. Network `network_*` and trip-lane stores unchanged (regression via existing policies).

---

## 3. Migration files

- `supabase/migrations/20271126104530_chat_v2_phase_b_rls_hardening.sql` (Local-only until approved push)

**Not applied** to preprod or prod from this delivery.

---

## 4. Tests

| Test | Result |
|---|---|
| `supabase/tests/chat_v2_phase_b_security.sql` | Authored (run after apply on preprod) |
| `features/chat/constants/__tests__/chatPlatform.flags.test.ts` | Team flag default false |
| Phase A chat Jest suites | Unaffected / still green from prior run |

**Post-apply on preprod (required before Team enablement):**

```bash
psql "$PREPROD_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/chat_v2_phase_b_security.sql
# Plus manual S1–S8 from three-scope audit on gx-pulse
```

---

## 5. Performance impact

- Access helpers remain single SECURITY DEFINER lookups (no new recursive RLS graphs).
- Trip sync adds bounded DELETEs per conversation on assignment change.
- No additional mirrors or dual-writes.

---

## 6. Rollback plan

1. Stop applying / revert release-set inclusion of `20271126104530`.
2. Restore prior function bodies and policies from audit §2 (foundation `20260917000000` + phase2 sync) via a new forward migration — **do not** `migration repair` casually.
3. Keep Team flag false throughout.

---

## 7. Team production enablement recommendation

**Do not enable Team** until:

1. `npm run db:preflight` + approved **preprod** apply of `20271126104530`.
2. `chat_v2_phase_b_security.sql` PASS on preprod.
3. Manual negative cases (cross-workspace, non-participant Team read, driver reassignment, forged participant insert) signed off.
4. Separate written GO for prod migration apply.
5. Only then set `EXPO_PUBLIC_PULSE_CHAT_TEAM_ENABLED=true` in a controlled deploy.

---

## 8. Confirmations

- Phase A UI preserved.
- No schema drops; no mirror changes.
- No production database changes performed in this session.
- Local CLI was linked to prod ref in `.temp` — **agents must not `db push --linked` for this work**; use preprod project `xbisiveavvbifbzyfhgy` when applying.
