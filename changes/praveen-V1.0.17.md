# praveen V1.0.17

## What
- Trip Ops Indent/Trip ID search: **highlight** the stage tab that owns the match; **do not** auto-switch page/tab.
- All stage tabs stay visible (rail + indent status chips).
- Strong ID matches (exact / code includes): list shows **only** that record, and only when the user is already on its stage; other stages show empty until they open the highlighted tab.
- Weaker client/route text search is unchanged (multi-match, no exclusive empty stages).
- Fix exclusive filter ownership: Live Indents (no chip) owns Pending/Bids; Completed owns Active→Delivered and History; stage highlight only when score is strong.
- Structural search (Indent ID / Trip ID / Vehicle): stage counts update across Live Indents, All Trips, indent chips, and every trip rail tile; matching stages highlight; non-matching stages show `0`; clear search restores originals. No auto-navigation.

## Why
- Ops need to see where a record lives without the hub jumping tabs for them; the match must appear only under its real stage with siblings hidden.
- Prior exclusive logic emptied Pending/Bids when no status chip was selected (`null !== stage`), and emptied History for completed Trip IDs.
- Stage badges stayed at full workload counts during ID/vehicle search, so operators could not see which stage owned the hit.

## Areas
- `features/trips/screens/TripsScreen.tsx`
- `features/trips/components/TripsHubBentoMetrics.tsx`
- `features/trips/components/TripsHubViews.tsx`
- `components/hub/HubMobileUnderlineTab.tsx`
- `features/trips/utils/indentHubSearchStage.util.ts`
- `features/trips/utils/tripHubSearchStage.util.ts`
- `features/trips/utils/hubSearchStageView.util.ts`
- `features/trips/utils/hubSearchScopedCounts.util.ts`
- `features/trips/utils/tripHubSearch.util.ts`
- `features/trips/utils/__tests__/indentHubSearchStage.util.test.ts`
- `features/trips/utils/__tests__/tripHubSearchStage.util.test.ts`
- `features/trips/utils/__tests__/hubSearchStageView.util.test.ts`
- `features/trips/utils/__tests__/hubSearchScopedCounts.util.test.ts`

## Migrations
- None.

## Tested
- Jest: indent/trip hub search stage + hubSearchStageView + hubSearchScopedCounts
- not clicked through
