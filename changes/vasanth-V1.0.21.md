# vasanth V1.0.21 — Disabled Hub metric counter

## What
- Add `hub_metric_counter` and `hub_metric_fault`, immutable `hub_metric_stripe` (md5, 16 stripes), and `hub_metric_contrib` for the frozen all-time Hub buckets.
- Add `zzz_hub_project` on `trips`, created disabled. A firing's counter deltas roll back on the named projection failures. Query cancellation, shutdown, and any other exception, including a generic `RAISE`, propagate. A missing counter row uses SQLSTATE `P0H01` only.
- Add `hub_reconcile_metric_counters`, which walks organizations, trip owners, and linked suppliers in `organization_id` order and stores each trip on `hub_metric_stripe(trip id)`.
- Add `hub_org_metric_oracle` for operator shadow comparison. It aggregates `hub_metric_contrib` and is granted to `service_role` only.
- Add unread `get_org_hub_metrics_counter`. It sums stripes for a member and returns NULL for `ground_ops` and `sourcing`.

## Why
- All-time member Hub tiles need an exact counter that does not scan `trips` on every read. The disposable prototype passed the repository trigger and latency gates. This change only lands the disabled objects so a later approval can backfill and compare them.

## Areas
- `supabase/migrations/20271111164000_hub_metric_counter.sql`
- `supabase/migrations/__tests__/hubMetricCounter.contract.test.ts`
- `supabase/release-sets/hub-metric-counter.versions`

## Migrations
- `20271111164000_hub_metric_counter.sql` only, named by release set `hub-metric-counter`. Trigger created disabled.

## Tested
- Contract test, 8 passed: disabled trigger sorts last among trips AFTER triggers, 16 md5 stripes, reconciliation keeps each trip's stripe and upserts, `P0H01` is the only application exception swallowed, cancellation and shutdown are re-raised, the unread RPC does not scan trips.
- Disposable PostgreSQL 17 only: contribution parity (draft, supplier visibility, mover suppression, soft-delete, cancelled, history), a linked supplier that owns no trips, a zero-trip organization, oracle equality, 128 rows per organization, disabled trigger does not write, missing-counter `P0H01` commits the trip without a partial delta, `n >= 0` does the same, generic `P0001` and `query_canceled` abort the trip. The throwaway script enabled the trigger only inside that database. The container was removed.
- Preproduction `xbisiveavvbifbzyfhgy`, migration `20271111164000`, trigger left disabled. Backfill of 173 organizations took 32.4 seconds and wrote 22,144 counter rows. Shadow comparison against `hub_org_metric_oracle` had 0 mismatches and 0 faults. Default execute grants to `anon` and `authenticated` were revoked after the first apply; the migration file now does that revoke itself.
- `count_org_hub_metrics` and `fn_sync_mover_asset_trip_status` are unchanged. No client file is changed.
- The existing mover trip-row deadlock is not addressed.
- Trigger enablement and client cutover remain separate approvals.
