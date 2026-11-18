# nihas/V1.0.53

Branched from V1 `83d800a2` on 2026-11-16 (fix isolated from the parked V1.0.51 WIP).

## What
- Marketplace award integrity: an award closes the competing pending offers, a fully used pool commit closes its other pending offers, and the winner gets an "awarded" notice instead of "Quote requested".
- The shipper app no longer sends a second indent status write after a Marketplace award.
- Load Center: a Marketplace winner's Bids Won card shows the accepted bid amount instead of the target rate.

## Why
- Competing offers stayed pending after an award, and the winner was told "Quote requested" at the target rate. Found on prod indent SAT812 / IND004287 (Vijaya Lakshmi, 14 Nov 2026).
- The redundant status PATCH re-ran status triggers right after the RPC had already set the status.
- The Bids Won card read only direct quotes, so a Marketplace winner saw TARGET RATE.

## Areas
- supabase/migrations (award_market_bid, tg_network_pool_commit_on_quote_accept, notify_indent_supplier_requested)
- features/indents/components/IndentDetailScreen.tsx
- features/network/components/LoadCenterView.tsx, features/network/utils/loadCenter.model.ts
- scripts/fix-marketplace-stale-quotes-backfill.sql (one-time, not in the release set)

## Migrations
- 20271118213000_marketplace_award_state_integrity (release set `marketplace-award-integrity`). Not yet on preprod or prod. Schema before code: preprod must have it before this UI reaches gx-pulse.
- Re-stamped from 20271114202000 to 20271118213000 (2026-11-18): V1 now has newer migrations (up to 20271118203000), so the old version would apply out of order. SQL unchanged (sha256 3092490a…). The old version was never applied on preprod or prod.
- Backfill: scripts/fix-marketplace-stale-quotes-backfill.sql (expected 64 rows). Run once, after review, with the owner's GO.

## Tested
- Local DB: migration applied; award rejects the competing pending quotes; pool exhaustion closes siblings; notification is "awarded".
- Simulator: Load Center Bids Won shows BIDS WON with the accepted amount.
- Jest: loadCenter.marketBidAward, loadCenter.model, release-set pin test.

- Synced with V1 `cc1451ac` (prod sync #128) by a merge commit (no rebase, no force-push). `20271118213000` is still the newest migration version.

- After the V1 sync: `LoadCenterView` calls `listMyOrgMarketBids(orgId)` (prod's sync removed the page-size parameter; the function already pages at 100), and the lint baseline stays at V1's 98 (this PR had lowered it to 97 against its old base).

## Not tested
- Vendor card does not update live; it updates on refetch. Realtime on market_bids is not built.
- Backfill not run on preprod or prod.
