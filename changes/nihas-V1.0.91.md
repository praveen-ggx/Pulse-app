# nihas-V1.0.91

- Round started from V1 400d1976.


## Fixes from the release code review (V1.0.91)
- Party rule now also covers the accepted marketplace (market_bids) winner org: 3 of 51 accepted org winners on prod were outside the first version.
- Timeline retry-dedupe only applies when a source id is given; identical events without one are both recorded.
- 42883 only means "function not deployed" when the message names the function; refusals stay final and the comment says so.
- prod-error-report.sh warns at the 1000-row cap and fails if the log shape is unexpected.
- Local behaviour test: 36 checks pass, 12 fail without the hardening migration.
- Deliberately unchanged: members may still set any actor/event type for their own party org (pre-existing; callers pass approvers and system actors).
