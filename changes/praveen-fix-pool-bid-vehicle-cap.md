# praveen/fix-pool-bid-vehicle-cap

## What
- Cap Network pool bid vehicle commit at the pool's load count (and never above 10).
- When pool size is unknown/0/NaN/negative, return no cap and block submit — do not fall back to 10.
- PoolBidCommitSheet: plus disabled at pool max; typed draft stays free until blur/submit; re-clamps if pool shrinks while open.
- NetworkPoolQuoteModal: one `commitPoolSize` for sheet + submit; if clamp would change the number, show an error instead of silently submitting.
- Drop unused fleetSize arg from clamp (fleet roster stays display-only).

## Why
- UI allowed committing more vehicles than pool loads; server returned 400 because vehicle_limit cannot exceed member_count.
- Previously clampPoolVehicleCommit intentionally ignored poolSize, and unknown pool size still fell back to 10.

## Areas
- features/network/utils/networkPoolBidCommit.util.ts
- features/network/components/bidding/PoolBidCommitSheet.tsx
- features/network/components/bidding/NetworkPoolQuoteModal.tsx
- features/network/utils/__tests__/networkPoolBidCommit.util.test.ts
- features/network/components/bidding/__tests__/PoolBidCommitSheet.max.test.tsx

## Migrations
- none

## Tested
- `npx jest features/network/utils/__tests__/networkPoolBidCommit.util.test.ts --ci --silent`
- `npx jest features/network/components/bidding/__tests__/PoolBidCommitSheet.max.test.tsx --ci --silent`
- UI not clicked through
