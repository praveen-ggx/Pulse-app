# nihas/V1.0.70

Branched from V1 `5b8da2a0` (= prod `a9ce6d3a`, release 2026-11-22 synced via #150) on 2026-11-23.

## What
- Trip Detail "Assignment updated" popup: it is now shown only from the live state of the trip that was just updated, so Done always closes it. The cached copy of the assignment (kept only so the page shows the new driver / truck name without a flash) no longer carries the popup flag (`useAssignmentPaint`, and `patchAssignmentCaches` writes `confirm: false`).

## Why
- Ashick (23 Nov): after updating a driver name or truck number, opening that trip shows "Assignment updated" with Edit / Done and Done cannot close it, so the trip page is unusable.
- Root cause: `patchAssignmentCaches` wrote `confirm: true` into a React Query entry (`staleTime: Infinity`, kept 30 min). `useAssignmentPaint` returns the live state if it is for this trip, otherwise that cached entry. Done (`dismissAssignmentConfirm`) only clears the live state of the most recently updated trip. After updating trip A and then trip B, reopening trip A has no live state, falls back to the cached `confirm: true`, shows the popup, and Done changes nothing (it clears B). Edit-then-Done on the second trip of a batch made it permanent for 30 min.
- Introduced 2026-10-24 (Vasanth, c4c7a821c "Deploy today's local app and UI changes"). Shows now because ops update many trips in a row.

## Areas
- features/trips/hooks/useAssignmentPaint.ts (+ new test features/trips/hooks/__tests__/useAssignmentPaint.test.tsx)
- features/trips/utils/assignmentCachePatch.util.ts

## Migrations
None.

## Tested
- New hook tests reproduce the sequence (update A, update B, reopen A): 2 of 3 failed before the change, all 3 pass after. assignmentPaint / assignmentCachePatch / tripCatalogFreshness suites pass (16 tests).

## Not tested
- Click-through in the app.
- Not changed on purpose: a typed name or a plate that is not in the garage list updates only the label on that trip (the linked driver / vehicle record stays). Seen on TRP002933: label NL01N7439, linked truck NL01N7438. Needs a decision; see PR description.
