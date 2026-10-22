# nihas V1.0.7 — Trips hub Failed indents: show older failures

## What
- Trips hub → Indent → Failed now lists every cancelled / expired indent of the org, not only those among the newest 500 indents. A new query loads failed indents only (cancelled + expired, up to 500 of them), and the Failed list combines it with the main list, keeping whichever copy of an indent was updated last. Date and search filters work as before.

## Why
- Daisy (21 Oct): SAT812GOGIND001680 and SAT812GOGIND001684 were marked failed (status expired, 12 Oct) but did not show under Failed. GOGOVAN INDIA has 1,389 indents; the hub loads only the newest 500 (FINITE_LIST_CAP, oldest loaded 4 Oct), so both (created 3 Oct) were never in the list. The data was correct. The org has 161 failed indents, well under the new query's cap.

## Areas
- features/indents/services/indents.service.ts (getFailedIndentsByOrganization), lib/queries/useIndentsQuery.ts (useFailedIndentsQuery), lib/queryKeys.ts (indents.failed, under indents.all so existing invalidation covers it), features/trips/utils/indentHubToolbarFilter.ts (mergeIndentsByLatestUpdate), features/trips/screens/TripsScreen.tsx (Failed list source).

## Migrations
- None (uses the existing idx_indents_org_status_pickup_date index).

## Tested
- Full jest 519 suites / 4086 tests pass (new: mergeIndentsByLatestUpdate keeps older failed indents and prefers the newest copy). ci-baseline lint 104, typecheck 64 (≤89), cycles 111, lib-files 178; navigation-policy 64 pass; git diff --check clean. Clicked through on localhost (preprod data): Failed shows all 36 failed indents; SAT812GOGIND001224 (26 Sep, outside the newest 500) now appears under Failed. Not checked on prod data before release.
