# praveen/V1.0.28

## What
- After a pooled bid/quote, vendors can **View indents** in the pool and revise **one** load’s rate without changing the others.
- Marketplace pooled opportunity lists anonymous member loads (shipper target + your rate) with per-load Quote/Revise; pool-wide submit/update is unchanged.

## Why
- Related indents share `_pool_key(pickup|drop|vehicle)` only — `supplier_target` is not part of the pool. Grouped submit correctly writes one `market_bids` / `direct_quotes` row per member, but My Bids / Marketplace UI hid members after quote, so a load with a different shipper target could not be opened or revised alone.

## Areas
- `features/network/components/pooled/NetworkBidPoolCard.tsx` — View indents
- `features/network/components/pooled/NetworkBidPoolList.tsx` — open pool → member list
- `features/network/components/LoadCenterKanbanColumnModal.tsx` — My Bids open pool + members
- `features/network/components/pooled/PooledOpportunityScreen.tsx` — member list + single-load revise
- `features/network/components/__tests__/networkBidPools.test.tsx`

## Migrations
- none

## Tested
- `npx jest features/network/components/__tests__/networkBidPools.test.tsx features/network/components/pooled/__tests__/PooledOpportunityScreen.test.tsx --ci --silent`
- UI: not clicked through
- DB (`.env` preprod `xbisiveavvbifbzyfhgy`): confirmed pools with distinct `supplier_target` on same pool_key (e.g. Perambra→Cuttack 32 Ft MXL; Periyapalayam→Poonamallee 20 Ft). Exact prod codes `SAT812GOGIND003532` / Nov-4 Oragadam rows are not on this DB (prod commented out in `.env`).

## Acceptance criteria
1. Bidding/quoting one rate for a pool still marks every eligible member bid-received (unchanged).
2. Vendor can open the pool and see every member indent.
3. When shipper targets differ, vendor can identify the different target and revise **only** that indent’s rate.
4. Revising one indent does not rewrite other members’ pending bid amounts.
5. Pool-level “Revise bid” / “Update rate for pool” still applies one rate to all currently eligible members.
6. Sponsored Reach / incomplete-lane individual cards unchanged.
