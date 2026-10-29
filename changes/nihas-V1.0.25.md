# nihas V1.0.25


## Trips hub: indents disappear from Pending once their pickup date passes

### What broke / root cause
- Team created indents on 28 Oct (still `broadcast` on prod) and could not find
  them on 29 Oct. The indent workload query (`indentWorkloadOrFilter`) only
  fetched live indents with pickup today or later, and the hub date pills were
  deliberately ignored for indents — so "This week" / "All" could never show
  them, and two September no-pickup indents showed instead.
- List view: the indent spreadsheet table was paged with the trip slice
  (always 0 rows on the indent tab), so it said "Showing 4 of 4" but was empty.

### What
- Date pill now drives the live set, server-side (not a client filter of the
  capped default list): a range = broadcast/open with pickup day in range, or
  IST created day when pickup is empty; "All" = every broadcast/open indent.
  Needs Trip Creation and Failed are unchanged.
- Live indents with a past pickup show a "PICKUP PASSED" tag (card + table).
- List view pages indents with the indent slice.

### Areas
features/indents/utils/indentWorkload.util.ts, services/indentWorkload.service.ts,
hooks/useIndentWorkload.ts, lib/queryKeys.ts (range in workload keys),
features/trips/screens/TripsScreen.tsx, TripsHubIndentStageCard.tsx,
IndentHubSpreadsheetTable.tsx.

### Migrations
None.

### Tested
- New util/service Jest cases (no-pill default, This week, created-day
  fallback incl. IST midnight, out-of-range, All, linked trip / org / deleted
  scoping, needs-trip unchanged, PICKUP PASSED). Trips + indents suites pass.
- Prod read-only: PostgREST accepts the new filter (200); same rule in SQL
  returns 16 GOGOVAN indents for This week incl. all seven 28 Oct ones.
- Not clicked through on gx-pulse yet. "All" shows ~320 live GOGOVAN indents.

## Compliance: detail-screen verify/payment busted the whole org's queue

### What broke / root cause
- Opening one trip's Compliance detail and clicking Verify or posting a
  payment invalidated and refetched the entire org's Compliance pipeline
  (every trip in the queue), plus called an extra `refetch()` on top of a
  query that already auto-refetches on invalidate. The main Compliance list
  screen already had the fix for this (patch just the one row); the detail
  screen was never switched over to it.
- Found and fixed along the way: the shared sync hook's Finance-cache-sync
  step used `await import(...)` inside a `try/catch` shared with the main
  cache patch. Jest can't intercept that import, so this path was untested;
  proven that in this environment the import throws and the catch silently
  falls back to invalidating the whole pipeline anyway — the exact thing
  being fixed. Converting it to a static import closes that gap (no behavior
  change — 36 other files already import this way; the synced function is
  trivial and synchronous).

### What
- Detail-screen verify and payment now call the same `useComplianceChangeSync`
  patch-in-place sync the list screen uses — one trip patched, Finance caches
  synced, only that trip's detail key invalidated.
- `useComplianceTripsQuery.ts`: dynamic import of `syncFinanceComplianceCaches`
  replaced with a static one.

### Areas
features/tripCompliance/screens/ComplianceDetailsScreen.tsx,
features/tripCompliance/hooks/useComplianceTripsQuery.ts.

### Migrations
None.

### Tested
- New focused Jest file (4 tests) against the shared sync hook: correct trip
  patched, other trip untouched, payment values from a fresh server read (not
  client math), Finance cache sync invoked, and the exact set of invalidated
  keys proven — the trip's detail key plus the hook's existing narrow Advance
  Processed key, never the org-wide pipeline key. Stable across 5 runs.
- Full tripCompliance suite: 700 passed, 3 pre-existing skips, 0 failed.
- Typecheck 325 vs baseline 350 (pass), cycles 92 (pass, no new circular
  dependency from the static import).
- Not clicked through on gx-pulse yet.

## Trips hub: "Bids received 0" when the Supabase circuit was open

### What broke / root cause
- GOGOVAN Trips hub showed Pending 329 / Bids received 0 although prod had
  492 pending quotes on its live indents (e.g. Sree Raamajayam on Bluestar
  IND003209). The offer-count read skipped itself while the Supabase circuit
  was open and returned an empty result with no error, so React Query cached
  "0 offers" for every indent until the next refetch.

### What
- The offer-count / bid-snapshot read now returns an error while the circuit
  is open (still no request sent), so it is not cached as an empty count.

### Tests
- `circuitBreakerBatchGuards.test.ts` updated: offer counts fail fast with an
  error instead of an empty success.
- Prod read-only check after reload: Live 329, Pending 113, Bids 216, Needs
  trip 30, Failed 208 and all trip tiles match prod.

### Not tested
- Circuit-open path not reproduced in the browser.

### Migrations
None.
