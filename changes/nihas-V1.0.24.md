# nihas V1.0.24

## Trips: "Failed" tab showed Awarded/Bidding/Pending indents too

### What broke / root cause
Clicking "Failed" on the Trips hub showed ~3x more cards than the stated
total (e.g. 602 shown vs "of 205"), with Awarded/Receiving Bids/Waiting for
Bid cards mixed in. `failedStageIndents` merges the real failed-indents list
with the general all-indents list (any status) via `mergeIndentsByLatestUpdate`,
which only dedupes by id/freshness — it never re-checks status. The filter
chain after the merge only checked org/date/search, never status, so any
non-failed indent that also existed in the general list leaked into the
Failed tab.

### What
Added a status check (`isIndentFailedStatus`) right after the merge, so only
indents actually `cancelled`/`expired` can appear in the Failed tab.

### Areas
features/trips/screens/TripsScreen.tsx (`failedStageIndents`).

### Migrations
None.

### Tested
Full Jest suite (655 passed), typecheck/lint/cycles/lib-files baselines.
Verified against prod (read-only): GOGOVAN real failed count is 205,
matching the "of" label; the leaked non-failed rows were confirmed by
counting non-failed org indents with no linked trip (565) — more than
enough to explain the 602 shown before the fix. Not clicked through on
gx-pulse.
