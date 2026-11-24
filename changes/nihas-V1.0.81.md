# nihas/V1.0.81

Branched from V1 `23dd893b` on 2026-11-24.

## What
- Advance Payment: once Finance has approved the advance (Approve Advance), expired vehicle documents no longer block posting the advance (UTR / payment date). The expired warning stays on the card and panel. The balance stays blocked until the documents are renewed.
- Test in `complianceReadiness.util.test.ts`.
- Compliance queue: when the trips after the first 40 (or a trip that joined later) fail to load, the page now says so instead of showing a short queue as if it were complete. A banner shows "X of Y trips" with a Retry, stage counts show a "+" while incomplete, and every Compliance export is blocked until the queue is complete. Retry reads only the trips still missing.
- Compliance queue: switching organisation no longer shows the previous organisation's trips (or counts) while the new queue loads, and a slow load from an old refresh or another organisation can no longer overwrite newer data.
- Tests in `useComplianceTripsQuery.tail.test.tsx`, `complianceIncomplete.util.test.ts`, `ComplianceIncompleteBanner.test.tsx` and `complianceIncompleteQueue.page.contract.test.ts`.

## Why
- Dhira, 24 Nov (APOLLO TRP002757 and similar): the advance was approved and paid, but the vehicle insurance / FC expired afterwards, so Finance could not enter the UTR and the trip stayed under Advance Payment pending. The server never blocked this; only the screen did.
- Compliance: a failed background load used to be swallowed, so a reviewer could work from the first 40 trips with undercounted stage chips and an "Updated just now" label. The load state was a single flag that was set on failure too, and the previous organisation's rows stayed on screen while the next one loaded. The new state is derived from which trips actually have data, so it cannot disagree with the list.
