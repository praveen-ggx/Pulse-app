# 2026-10-06 — Post-release probe held a read-blocking lock on `public.trips`

**Classification:** testing mistake during release validation. Not a product regression from the
Driver Execution Authority release (`85bf8b3a`, migrations `20271005211835`, `20271005215938`).

| Field | Value |
| --- | --- |
| Status | Closed; cleared on its own when the probe transaction rolled back |
| Impact window | 2026-10-06 **01:05:00Z–01:05:15Z** (~15 s) |
| Root cause | Confirmed: `DROP TRIGGER` on `public.trips` inside a long rolled-back probe transaction |
| Data impact | None (whole probe transaction rolled back) |

## What happened

After the release was applied (00:59:41Z) and published (01:02:42Z), the rolled-back command-probe
suite was run against production. One section ("atomicity 2") proved that a failing trip completion
rolls back the final stop as well. To force the failure it ran, in the same transaction:

```sql
CREATE TRIGGER zz_probe_fail_t3_complete BEFORE UPDATE ON public.trips ...;  -- SHARE ROW EXCLUSIVE
-- ... COMPLETE_STOP probe ...
DROP TRIGGER zz_probe_fail_t3_complete ON public.trips;                         -- ACCESS EXCLUSIVE
```

Both locks are held until the transaction ends. `SET LOCAL lock_timeout = '3s'` only bounds the
wait to acquire a lock (here 1.6 s), not how long it is held afterwards.

## Impact (Postgres logs)

- 01:05:00.84Z: probe backend acquired `AccessExclusiveLock` on `trips` (relation 589447).
- ~10 PostgREST sessions logged `still waiting for AccessShareLock` on `trips`; they acquired it
  at 01:05:15Z after 10–14 s.
- At least one PostgREST request hit `statement timeout` (01:05:39Z). The PostgREST
  idle-in-transaction terminations at 01:06:08–01:06:14Z most likely came from the same backlog.
- From 01:06:30Z onward: no Postgres errors, lock waits or timeouts. At 01:07:58Z: 0 waiting locks,
  0 idle-in-transaction sessions.

## Not caused by this

Statement timeouts at 01:03:01–01:03:58Z happened before the probe started (01:04:24Z). They were
reads of `driver_location`/`driver_locations`, `get_multi_lane_bootstrap` and Realtime publication
queries. This matches the daytime baseline (10–170 statement timeouts per hour from 05:00 to
17:00Z on 2026-10-05), so it is existing performance behaviour, not the release.

## Action

- Removed the "atomicity 2" section from the production probe suite. Atomicity under forced
  failure is proven locally only.
- Future production validation must be read-only, or transactional DML only. No `CREATE`, `DROP`,
  `ALTER` or `COMMENT ON` against shared tables inside probe transactions. Any probe that needs a
  table-level lock stronger than `ROW EXCLUSIVE` runs locally only.
