# October 28, 2026 PostgreSQL saturation

Status: closed at the evidence boundary. The initiating workload is unknown.
No incident-specific SQL change, index, or migration is justified.

Sources: `supabase_logs-20.json` (09:01–09:38 UTC) and `supabase_logs-21.json`
(10:01–10:28 UTC). The 09:39–10:00 slice is not in either file. There is no
PostgREST access log and no application request log for this window.

## Executive summary

The database degraded for about an hour and was then restarted. The first
observable change is the 09:16 checkpoint writing 233 dirty buffers instead of
the 75 written at 09:11. WAL distance stayed in the same 33–49 MB band from
09:01 through 10:22, and no statement, lock, error, or transaction is logged
before that 09:16 checkpoint.

Idle-in-transaction kills, slow statements, connection refusals, and the
administrator restart all happen after that jump. They describe how the stall
spread and how it was recovered. They do not name the workload that dirtied
the extra pages.

Search, hub RPCs, and compliance reads are among the statements that became
slow after 09:31. A throwaway 20,000-trip plan of `search_trips_for_org` finished
in about 44 ms, and `pg_timezone_names` (planned cost 10) took 43 seconds in
the same window. Those durations are the stall, not a demonstrated defect in
one query.

## Earliest-event timeline

Checkpoints are `starting: time`, every five minutes. None added a WAL file.

| Checkpoint end | Buffers | Write | ms/buffer | WAL distance | Files synced |
|---|---:|---:|---:|---:|---:|
| 09:01:09 | 16 | 1.4 s | 88 | 49,085 kB | 8 |
| 09:06:14 | 69 | 6.9 s | 100 | 32,811 kB | 24 |
| 09:11:15 | 75 | 7.5 s | 100 | 49,222 kB | 23 |
| 09:16:31 | 233 | 23.7 s | 102 | 33,036 kB | 82 |
| 09:21:36 | 257 | 27.7 s | 108 | 48,870 kB | 122 |
| 09:27:42 | 845 | 93.3 s | 110 | 32,910 kB | 264 |
| 09:33:18 | 868 | 128.1 s | 148 | 49,103 kB | 235 |
| 10:07:36 | 837 | 84.4 s | 101 | 48,657 kB | |
| 10:13:06 | 1,126 | 114.3 s | 101 | 34,597 kB | |
| 10:22:39 | 629 | 80.3 s | 128 | 33,371 kB | |

Per-buffer write time is about 100 ms from the healthy 09:11 checkpoint onward.
The longer checkpoints are a larger dirty set at that same pace.

- 09:16:31 is the first deterioration. The log before it contains only the
  earlier checkpoint lines.
- 09:22:35–09:22:38: eleven `25P03` idle-in-transaction kills. Those
  transactions were opened after the 09:16 checkpoint had already finished.
- 09:31:20: first `57014`. Broad latency follows, including catalog scans.
- 10:23:24: five `53300` connection refusals in one second.
- 10:25:11.277–10:25:11.401: nine `57P01` administrator terminations, then
  `57P03` until 10:26:40. Logical decoding returns at 10:27:49.

## Dirty buffers and WAL

WAL distance stays inside approximately 33–49 MB for every checkpoint in both
files, including the healthy ones at 09:01 and 09:11. The dirty-buffer count
does not. At 09:26 the checkpointer synced 264 files for 845 buffers, roughly
three buffers per file: a wide scatter, not one heap rewritten in order.

A Pulse write amplifier that inserted or updated many extra rows would be
expected to move WAL distance. This series does not show that movement. The
buffer jump is therefore not evidence of trip-status, audit, document,
workflow, or realtime write amplification.

## Confirmed

- Progressive degradation, then a managed restart.
- Dirty-buffer growth leads. WAL volume does not.
- No SQL is logged before 09:16.
- Edge `send-push-notifications` runs about once a minute, flat across the
  morning, almost all HTTP 401.
- `search_trips_for_org` was not shown to be intrinsically slow. The 24.7 s
  duration is inside the stall.
- PR #105 and the hub keyset change are separate later work. Neither is
  identified at 09:16.

## Unknown

- Which relations the extra buffers belonged to.
- Whether the extra dirtiness was inserts, updates, or hint bits from reads.
- The statements inside the eleven sessions killed at 09:22.
- The table for relation OID 17331, locked for 1.3 s at 09:35:57.
- Anything that happened from 09:39 to 10:00.
- Application request timing. No request log exists.

## Hypotheses

| Rank | Hypothesis | Confidence |
|---|---|---|
| 1 | More distinct pages were dirtied without a higher WAL rate | High for the pattern. The relation is unknown |
| 2 | Scattered writes or hint-bit dirtiness across many files | Low. Consistent with flat WAL and 264 synced files. No statement names it |
| 3 | A known Pulse write amplifier (simulated-status second update, audit, documents, workflow events, realtime, multi-row RPCs) | Not supported before 09:16. WAL did not rise |
| 4 | Idle transactions, then slow queries, then pool exhaustion caused the dirty buffers | Ruled out. They start at 09:22, 09:31, and 10:23 |
| 5 | The administrator restart caused the incident | Ruled out. It is the recovery at 10:25, after an hour of degradation |

## Why no incident remediation PR

There is no statement to change. An index or a query rewrite would be a guess
about a workload the log does not contain. Search was measured separately and
left unchanged. The hub keyset branch and the PR #105 migration stay on their
own release sets and are not combined with this incident.

## Sampler bounds

`scripts/observability/pgSnapshot.ts` does not repair this incident and does
not schedule itself. A previous in-database `pg_stat_statements` scan took
12–15 seconds, so the sampler reads that view last, bounds every section with
`statement_timeout` on its own connection, and skips a second collect while
one is running. Snapshots append to an absolute file outside PostgreSQL.
Quiet-database timing is recorded with the pull request. It is not a
production measurement. The sampler restores `statement_timeout` only when
it successfully read the previous value and the connection is idle. A section
that does not return is not followed by another query; the caller discards
that session. The role needs `pg_monitor`. The anon and authenticated API
roles cannot read these views, and this pull request does not grant them.
