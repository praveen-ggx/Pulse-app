# vasanth pooled-bidding-ui

## What
- Prefill Revise bid with the existing pool rate; first-time Quote for pool still starts empty.
- Keep My Bids pool-centric (no member-indent list); Network Loads still lists member indents.
- Show extra-stop place names on Network Loads pool cards, My Bids pool cards, and Get Load indent cards.

## Why
Bidders could not revise a pooled bid from the pool card, opened My Bids showed indent summaries, and extra stops were only a count.

## Areas
- features/network (Load Center pool cards, quote sheet, Get Load cards)
- features/trips/utils/routeExtraStops.util.ts (via place helpers)

## Migrations
None.

## Tested
- Unit (isolated worktree): 5 suites, 86 tests — networkBidPools, networkLoadPools, bid-pool util, routeExtraStops util, MarketplaceRouteGrid via row.
- CI: cycles 111/111, lib-files 178/178, navigation-policy 64 tests. Lint 105 vs baseline 104 (same 10 errors on the copied source files as 460c2123; no new unused-import). Typecheck OOM in this worktree (tsc crashed; count not used).
- Browser (earlier on dirty tree, not this worktree): revise prefills existing rate; new quote stays ₹0; My Bids has no indent list; Network Loads still shows members.
- Not tested: pool-wide revision on a disposable multi-member QA pool; Via names on a live lane with saved extra stops (no preprod credentials).
