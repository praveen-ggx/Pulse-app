# Marketplace 48-hour lane commitment and individual bid expiry

## What
- A pooled Marketplace rate stays on a lane for 48 hours from database time. The same rate does not move that clock. An explicit renewal does. A rate change updates pending bids only.
- Each bid expires at its own `created_at + 48 hours`. An expired pending bid cannot be accepted. Accepted bids stay accepted.
- After expiry the carrier submits a new bid row with a new 48-hour clock. The expired row stays for audit. One pending bid per carrier and load.

## Why
Shippers were able to accept bids older than 48 hours, and a carrier could not place a fresh bid after expiry without reviving the historical row.

## Areas
- Lane commitment RPCs and the shipper bid list.
- Carrier bid submission, award, the ₹600 cash fee, and separate trip creation.
- Bid cards, the award modal, and the indent review hub.

## Migrations
Apply `supabase/release-sets/marketplace-lane-rate.versions` in order, on preproduction before this code is deployed:

1. `20271114173800` `0e118ece8e09dac104fc3734c35526706a96e157a368ae53b24c5dabf6d8ad00`
2. `20271114174600` `67db8ac0415b509d66ebdd0f38019c500cba89e5aafdaee6356d254c8a888303`
3. `20271114201500` `0bf7c1a471aeea4736f08a013620ea94cd8f3d9a063790a6c252bfcbe9c33d9a`
4. `20271116144500` `3d69be94a41cbaf8a9ade851adb15e126ce8ad221bee164c525880200229b971`
5. `20271117013000` `4df18a44045801ed76ab66294b97dd228707dd8daef69d3031bd038fd8ef0333`
6. `20271117021500` `e345eb52a667fdd5e47bf730ae3fdef31dada49d70a56f768adbd6170aa1904d`
7. `20271117144500` `86481ac1ce97cf9a1a9c81fc87d9da0d9294b7a0325a71091e968da41df5196d`

`20271117021500` backfills `expires_at` and disables the `updated_at` trigger for that update. `ADD COLUMN` holds ACCESS EXCLUSIVE until the transaction ends. Not applied anywhere yet. `20271117113000` is not in this set.

## Tested
- Disposable full-schema checks for resubmission, concurrency, award, the ₹600 cash fee, counterparty, exchange enrolment, and idempotent trip creation.
- Contract, card, award, and navigation tests on this branch before the pull request.

## Not tested
- Preproduction apply and a click-through on gx-pulse. Production is not in this pull request.
