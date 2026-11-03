# praveen V1.0.17

## What
- Trip Ops Indent/Trip ID search: **highlight** the stage tab that owns the match; **do not** auto-switch page/tab.
- All stage tabs stay visible (rail + indent status chips).
- Strong ID matches (exact / code includes): list shows **only** that record, and only when the user is already on its stage; other stages show empty until they open the highlighted tab.
- Weaker client/route text search is unchanged (multi-match, no exclusive empty stages).
- Fix exclusive filter ownership: Live Indents (no chip) owns Pending/Bids; Completed owns Active→Delivered and History; stage highlight only when score is strong.
- Structural search (Indent ID / Trip ID / Vehicle): stage counts update across Live Indents, All Trips, indent chips, and every trip rail tile; matching stages highlight; non-matching stages show `0`; clear search restores originals. No auto-navigation.
- Hub card status chip now uses the same stage classification as the Active rail (`hubTripCardStageLabel`). `in_progress` stays **LOADING** even when `started_at` is set (was incorrectly showing **IN TRANSIT**).
- Manifest Pulse / activity actors: resolve the real member from audit `changed_by`, `trips.assigned_by_user_id`, then creator/owner profile names. Never use the viewing member’s name or generic `Staff` / `Workspace member` labels when the actor is unknown.
- Persist assigner on write: `updateTripAssignment` and create-with-driver stamp `trips.assigned_by_user_id`; migration trigger stamps assigner + writes `trip_assignment_audit` for indent-deploy RPC paths that previously left both empty.

## Why
- Ops need to see where a record lives without the hub jumping tabs for them; the match must appear only under its real stage with siblings hidden.
- Prior exclusive logic emptied Pending/Bids when no status chip was selected (`null !== stage`), and emptied History for completed Trip IDs.
- Stage badges stayed at full workload counts during ID/vehicle search, so operators could not see which stage owned the hit.
- Loading-tab trips with `status=in_progress` + `started_at` showed an IN TRANSIT chip while the rail correctly kept them under Loading.
- Manifest Pulse Assigned lines were blank (`· Assigned · driver …`) because indent deploy RPCs set `driver_id` but never wrote `assigned_by_user_id` or audit `changed_by` (preprod: SAT812GOGTRIP001922 had both missing).

## Areas
- `features/trips/screens/TripsScreen.tsx`
- `features/trips/components/TripsHubBentoMetrics.tsx`
- `features/trips/components/TripsHubViews.tsx`
- `features/trips/components/IndentHubActivityLog.tsx`
- `features/trips/components/trip-detail/TripDetailScreen.tsx`
- `features/trips/components/trip-detail/TripMobileDetail.tsx`
- `features/trips/components/trip-detail/modals/LiveTrackingModal.tsx`
- `features/trips/hooks/useIndentHubActivity.ts`
- `features/trips/services/trips.service.ts`
- `features/trips/utils/indentHubSearchStage.util.ts`
- `features/trips/utils/tripHubSearchStage.util.ts`
- `features/trips/utils/hubSearchStageView.util.ts`
- `features/trips/utils/hubSearchScopedCounts.util.ts`
- `features/trips/utils/tripHubSearch.util.ts`
- `features/trips/utils/tripHubMetrics.ts`
- `features/trips/utils/manifestJourneyLog.util.ts`
- `features/trips/utils/activityTimelineActor.util.ts`
- `lib/trips/buildTripAuditLog.util.ts`
- `supabase/migrations/20271103221500_record_trip_assigner_on_driver_change.sql`
- tests under `features/trips/utils/__tests__/`

## Migrations
- `20271103221500_record_trip_assigner_on_driver_change.sql` — BEFORE trigger stamps `trips.assigned_by_user_id` from `auth.uid()` on driver set/change; AFTER trigger writes `trip_assignment_audit` (deduped if the app already wrote a row). Covers indent deploy RPCs that never recorded the assigner.

## Tested
- Jest: indent/trip hub search stage + hubSearchStageView + hubSearchScopedCounts + tripHubMetrics (card label) + manifestJourneyLog actor / assigner resolution
- Preprod read-only: SAT812GOGTRIP001922 (`c61ab195-…`) — `assigned_by_user_id` null, no audit rows, `created_by_user_id` → VIJAYA LAKSHMI TRANSPORT; 0/862 recent driver trips had `assigned_by_user_id`
- not clicked through UI after this commit
