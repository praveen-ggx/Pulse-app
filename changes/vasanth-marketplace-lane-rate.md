# Marketplace lane rate opt-in

## What
- Carrier opt-in after a pooled Marketplace bid: "Apply to new loads on this lane" with a vehicle limit and valid-until (max 90 days). The rate is linked to the carrier's pending lane bids, placed on every open Marketplace load on the lane now, and on every new load as it opens. It stops when the limit is awarded, the date passes, or the carrier withdraws. Re-committing replaces the rate and moves pending lane bids to the new amount.
- Automatic copying of plain bids is removed: only an explicit lane rate is applied. A load where the carrier already has any offer (pending, rejected, withdrawn, or a direct quote) is never touched.
- Carriers whose rate is already on a load no longer appear in the shipper's "Invite at" list for that load (it already excludes carriers with an offer on the load).

## Why
"Invite at" was the only way to reuse a lane rate, and the automatic copy depended on migrations that were never applied and had no carrier consent.

## Areas
- `supabase/migrations/20271114201500_marketplace_lane_rate_opt_in.sql` (new `market_lane_bid_commits`, `market_bids.lane_commit_id`, `commit_marketplace_lane_rate`, `withdraw_marketplace_lane_rate`, redefined `apply_standing_lane_bids` / trigger / `preview_standing_lane_bids`).
- `features/network/services/standingLaneBids.service.ts`, `features/network/utils/marketplaceLaneRate.util.ts`, `PoolBidCommitSheet` (optional copy), `PooledOpportunityScreen`, `lib/database.types.ts`.

## Migrations
- Release set `supabase/release-sets/marketplace-lane-rate.versions`: `20271114173800`, `20271114174600`, `20271114201500` in that order. Not applied anywhere. Preprod first (Nihas), then prod (Vasanth), before this code ships.
- DCO (individual) bidders cannot opt in yet; organization carriers only.

## Tested
- Disposable Postgres 17: `supabase/tests/marketplace_lane_rate/run.sh`, 27 checks pass (opt-in guards, past and future loads, drafts, Network to Marketplace, rejected bids, awards, exhaustion, re-commit, withdraw, RLS).
- Jest: release-set contract and copy tests; 74 suites / 651 tests in network and touched areas pass. Typecheck clean for touched files.
- UI not clicked through (needs the migrations on a database).
