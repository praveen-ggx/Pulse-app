# nihas/V1.0.86

Branched from V1 `27fbfa95` on 2026-11-24.

## What
- Automatic sign-outs now end only this device's session: app backgrounded with keep-signed-in off, forced sign-out after an auth failure, restore with keep-signed-in off, and the session-expired error screen.
- The explicit "Sign out" button is unchanged (still signs the user out everywhere).

## Why
- Prod 2026-11-23/24: auth logs show `session_not_found` (3) and `refresh_token_not_found` (5). Yesterday at 12:30:49 a POD upload succeeded, `/auth/v1/user` returned 403 at 12:30:50, then the audit-log and `pod.uploaded` writes went out anonymously and were refused (401), leaving the document saved without its audit trail.
- Cause: `authService.signOut()` used the default global scope, which deletes every session of that user on every device. Any automatic sign-out on one phone or tab killed the same user's other sessions. Auth config was checked (no single-session limit, no time-box, rotation on), so the sessions were deleted by a sign-out, not expired.
- Not fixed here: the half-written upload (document saved, audit/event lost) if a session dies mid-flow.

## Also: the profiles UUID error, at the real callers
- Correction to #166: the logged 22P02 queries (names "Sivakozhunthu" 9, "Mohamed Asik Hussain" 15, "Rithwik Anand" 9, 33 in 24h) select `id, full_name, phone, email[, avatar_url, avatar_seed]`. That is `fetchActivityUserProfiles` (trip activity) and the compliance actor lookup, not the driver screen fixed in #166.
- Both now filter ids through `onlyUuids` (new `lib/utils/uuid.util.ts`) before `profiles.id IN (...)`, so one name no longer drops every other actor's name in the batch.
