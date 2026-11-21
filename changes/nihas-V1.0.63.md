# nihas V1.0.63

## What
- Network pool rebid: when a supplier's pool bid runs out of vehicles (one load awarded on a vehicle-limit-1 bid), the other loads it covered are closed as "rejected". The supplier can now quote those loads again while they are still open (single load or pool quote). Shipper rejections, counters and awards stay locked.

## Why
- MANI TRANSPORT (Pondicherry -> Chennai, 20 Nov): pool bid on 3 loads, vehicle limit 1. IND004641 awarded; IND004643/IND004645 closed and every new quote failed with quote_locked. Same state on prod for ~27 open loads across 6 suppliers (Arvinth, FR8, Petthu Selvam, Sivan E, Mani).

## Areas
- DB only: submit_network_quote, get_org_network_pool, new helper direct_quote_closed_by_pool_exhaustion. No app/UI code.

## Migrations
- 20271120101500_pool_exhausted_quotes_can_rebid.sql, release set `pool-exhausted-rebid`. Function bodies = live prod (preprod identical) + marked additions.

## Tested
- Scenario on a local Postgres 17 (3 loads, limit 1, award 1): the 2 closed loads become quotable and accept a new quote; a shipper-rejected quote stays locked; the awarded load stays closed; a second revise works as normal.
- Jest contract test for the release set and guards.
- Not tested: the app screens on preprod (needs the migration applied there first). Closed loads still show "rejected" on the supplier's card until they quote again.
