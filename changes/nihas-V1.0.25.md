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
