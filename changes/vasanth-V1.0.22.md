# vasanth V1.0.22 — lane offers

## What
- Shipper sees every offer relevant to an indent's lane (same pickup, drop and vehicle type), not only offers on that exact indent: pending Marketplace bids and Network quotes on the org's other open indents on the lane, plus live Network lane commitments. "On this lane" section in the indent detail and the Review Hub (Award modal), cheapest first, keyset paged with an authoritative total.
- Live Network lane commitments (`network_pool_bid_commits`) attach automatically to new indents on the lane at the committed rate (trigger on insert and on status / circulation / lane changes, plus an on-demand RPC). Only linked carriers, while vehicles remain and the commitment is valid.
- Bids from sibling indents are never copied or awarded silently. The shipper taps "Invite at ₹X"; the carrier gets a "Rate request" (notification + card in My Bids) and confirms with one tap, which places a normal bid / quote on the new load through `submit_market_bid` / `submit_network_quote`.
- After creating an indent, a dialog shows offers available for the lane. Shared to Network only with no Network offers: recommends posting to Marketplace and shows how many Marketplace bids the lane already has; "Post to Marketplace" switches the load to Network + Marketplace.
- Load Center offer badge now counts pending Marketplace bids (`market_bids`) and drops exhausted / expired lane commitments (`pool_commit_id` was read but never selected).

## Why
A new indent on a lane that already had 6 Marketplace bids (SAT812GOGIND003892) showed "No offers yet" (SAT812GOGIND004008): bids are stored per indent, and pool commitments were only copied at the moment the carrier submitted.

## Areas
- `supabase/migrations/20271113091500_lane_offers_for_indent.sql`, `supabase/release-sets/lane-offers.versions`
- `features/network/services/laneOffers.service.ts`, `features/network/utils/laneOffers.util.ts`
- `features/network/components/laneOffers/` (LaneOffersSection, LaneOffersAfterCreateDialog, LaneBidInvitesCard)
- `lib/queries/useLaneOffersQuery.ts`, `lib/queryKeys.ts`, `lib/database.types.ts`, `lib/platform/moderator/featureLanes.ts`
- `app/create-indent/index.tsx`, `features/indents/components/IndentDetailScreen.tsx`, `features/network/components/AwardModal.tsx`
- `features/driver/components/MyBidsScreen.tsx`, `app/find-loads/index.tsx`
- `features/network/services/bids.service.ts` (offer badge)

## Migrations
- `20271113091500_lane_offers_for_indent.sql` (additive: helper functions, two partial indexes, trigger on `indents`, table `lane_bid_invites` with RLS, five RPCs). Release set `lane-offers`. Not applied to any database.

## Tested
- Disposable Postgres 17 suite `supabase/tests/lane_offers/run.sh`: 58 checks passed (sibling offers, isolation, auth, consent invite flow for DCO and org carriers, auto-attach, parity with `market_indents_for_org`, 1,205 carriers over 13 keyset pages, index use). Removing the link check, the staff gate, or the already-on-target filter each fails the suite.
- Jest: new `laneOffers.contract`, `laneOffers.util`, `laneOffers.service`, `bids.service.offerCounts`; full `npx jest --ci --silent` 789 suites passed (1 skipped); `test:navigation-policy` passed.
- `ci-baseline` typecheck 345/345, lint 98/98, cycles 94/94, lib-files 178/178; `git diff --check` clean.
- `npm run db:preflight` not run: the worktree is not linked to a database.
- UI not clicked through in a browser or on device.
