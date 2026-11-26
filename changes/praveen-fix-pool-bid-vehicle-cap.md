# praveen/fix-pool-bid-vehicle-cap

## What
- Cap Network pool bid vehicle commit at the pool's load count (and never above 10).
- PoolBidCommitSheet plus button and manual number entry both enforce the pool-sized max.
- Submit path in NetworkPoolQuoteModal clamps with the same pool/fleet args.

## Why
- UI allowed committing more vehicles than pool loads; server returned 400 because vehicle_limit cannot exceed member_count.
- Previously clampPoolVehicleCommit intentionally ignored poolSize.

## Areas
- features/network/utils/networkPoolBidCommit.util.ts
- features/network/components/bidding/PoolBidCommitSheet.tsx
- features/network/components/bidding/NetworkPoolQuoteModal.tsx
- features/network/utils/__tests__/networkPoolBidCommit.util.test.ts

## Migrations
- none

## Tested
- `npx jest features/network/utils/__tests__/networkPoolBidCommit.util.test.ts --ci --silent`
- UI not clicked through
