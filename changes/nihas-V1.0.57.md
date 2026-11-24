# nihas/V1.0.57

Branched from V1 `abe0e8dd` on 2026-11-19.

## What
- `20271118213000_marketplace_award_state_integrity.sql`: add the missing `;` after the first two `$function$` bodies (lines 188 and 253). Release set `marketplace-award-integrity` pins the new sha256 (`671d3b4c…`).

## Why
- The preprod apply on 2026-11-18 failed at statement 0 with `syntax error at or near "CREATE"`: without the terminators, the three CREATE FUNCTION statements were read as one. The push rolled back; preprod was unchanged. The pin test checks list, order and sha256, not SQL syntax, so CI did not catch it.

## Areas
- supabase/migrations/20271118213000_marketplace_award_state_integrity.sql
- supabase/release-sets/marketplace-award-integrity.versions

## Migrations
- 20271118213000 (content fix only; never applied on any database).

## Tested
- Ran the corrected file on preprod inside BEGIN … ROLLBACK: all statements executed; award_market_bid picked up the direct_quotes close; after ROLLBACK the live function is unchanged.
- Jest: marketplaceAwardIntegrityReleaseSet (pin test).

## Not tested
- The real preprod apply and the award / rejection / pool exhaustion / concurrency tests come after merge.
