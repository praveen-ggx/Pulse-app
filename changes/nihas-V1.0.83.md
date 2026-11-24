# nihas/V1.0.83

Branched from V1 `d1c15d0d` on 2026-11-24.

## What
- Compliance queue: when the trips after the first 40 (or a trip that joined later) fail to load, the page now says so instead of showing a short queue as if it were complete. A banner shows "X of Y trips" with a Retry, stage counts show a "+" while incomplete, and every Compliance export is blocked until the queue is complete. Retry reads only the trips still missing, one retry at a time.
- Compliance queue: switching organisation no longer shows the previous organisation's trips (or counts) while the new queue loads. A slow load that started before a header refresh, an organisation switch or a session change can no longer overwrite newer data, and trips are merged by id so none appear twice.
- No automatic retry and no change to how the banner looks while loading; both are follow-ups once the real error has been captured.
- Trips hub: cancelled trips no longer count under Unassigned. The card, the Unassigned list and the DB count now all agree (new migration `hub_unassigned_excludes_cancelled`, not applied anywhere yet).
- Added release set `hub-unassigned-excludes-cancelled` and a test pinning it, so the cancelled/Unassigned migration can go to preprod and prod through `db-push-set`.

## Why
- The queue paints the first 40 trips and loads the rest in the background. That background load, and the reconcile that picks up trips added later, swallowed their errors, so a failed load left a short queue on screen with correct-looking counts, an "Updated just now" label and working exports. Seen on a local reload with 1083 trips: the first 40 showed, the rest failed once, and Retry then loaded all of them.
- The reason the rest failed on that reload is not known yet. The failure is now logged as `[compliance] background trip load failed`; capture that line the next time it happens before changing retry behaviour.

## Areas
- features/tripCompliance/hooks/useComplianceTripsQuery.ts (load state, completeness from which trips have data, retry, stale-read guard, other-organisation rows hidden)
- app/compliance/index.tsx (banner, "+" on counts, export guards on all four export entry points, loading-only spinner)
- features/tripCompliance/components/ComplianceIncompleteBanner.tsx, ComplianceMobileChrome.tsx
- features/tripCompliance/utils/complianceIncomplete.util.ts (wording)

## Migrations
- None.

## Tested
- Jest, full suite on the merged branch: 902 suites passed, 6430 tests passed, 3 skipped (a first full run had one worker crash with SIGSEGV on `hubSearchScopedCounts.util.test.ts`, which this change does not touch; it passed on the second full run).
- New tests: `useComplianceTripsQuery.tail.test.tsx` (tail success, rejection, timeout, head failure, retry reads only missing trips and runs once at a time, retry after a failed retry, failed reconcile then retry, catalog change during the load, header refresh and organisation switch dropping old reads, other organisation's rows not shown, no duplicate ids, complete hydrated cache never flagged), `complianceIncomplete.util.test.ts`, `ComplianceIncompleteBanner.test.tsx`, `complianceIncompleteQueue.page.contract.test.ts`.
- Lint 98 (baseline 98), cycles 94 (94), lib-files 178 (178), typecheck 321 (baseline 344; no errors in the files changed here).

## Not tested
- Click-through in the browser: export blocked while incomplete with the right counts in the alert, export working once complete, desktop and phone. The export guards are checked by source-level tests, not by pressing the buttons.
- The cause of the failed background load on large queues (see Why).
- Typecheck is 23 under its baseline; the cause of that gap in this checkout is not explained, so the baseline file is unchanged.
- Vasanth confirmed cancelled should not count. The Unassigned card showed 11 on first load and 24 after a click because the DB count and the list included cancelled trips. On prod the main org had 8 vs 27.
- The plain `db push` is blocked by preflight (frozen files in the tree); only a named set is allowed.
