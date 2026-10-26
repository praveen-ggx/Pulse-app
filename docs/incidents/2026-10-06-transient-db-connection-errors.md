# 2026-10-06 — Transient PostgreSQL connection errors (57014 / 08006 / 25P03)

**Classification:** transient, recovered, infrastructure-level degradation. The checks performed
found no evidence that the deployed application release, a specific query, or a schema defect
caused it.

This incident is separate from
[2026-10-06-release-probe-trips-lock.md](./2026-10-06-release-probe-trips-lock.md).

| Field | Value |
| --- | --- |
| Status | Closed: transient, recovered |
| Impact window | 2026-10-06 approximately **04:00:15Z–04:28:14Z** (~28 min) |
| Error pattern | PostgreSQL `57014`, `08006`, `25P03` |
| Root cause | Not identified; infrastructure-level degradation, no release/query/schema attribution |
| Remediation | None performed |

## State after recovery

- Database calm.
- The only connections were the expected Realtime standing connection and the diagnostic session.
- Zero stuck queries, zero blocking, zero long-running statements.

## Checks

- `ops.slow_query_log` showed no slow-query activity attributable to the release in the checked
  window.

## Not a product/database defect

- `42703` (`snapshot_at`) at approximately 04:15:11Z came from an incorrect diagnostic query.
  It is not a product or database defect.

## Diagnostic activity

Diagnostic queries run during the degraded window may have added some load. The evidence is not
enough to attribute the incident to that activity.

## Remediation

None. No rollback, migration, pooler or configuration change, session termination, or timeout
tuning.

## Preventive practice

During future degraded windows, check the existing `ops.*` telemetry first and keep ad-hoc
production queries to a minimum.

## Open condition

If the Supabase dashboard stays **Unhealthy** while the live database and application stay
healthy, investigate that dashboard discrepancy separately.
