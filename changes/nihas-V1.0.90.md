# nihas-V1.0.90

- Round started from V1 91827f7a4.

## Event functions hardened after code review
- Driver path of record_trip_operational_timeline_event: fixed list of driver event types (approval_changed only for a driver cancel), actor always the caller. A driver could previously write any type as any user.
- Both functions now require the org to be a party to the trip (owner, linked supplier/client, accepted bidder) and an ACTIVE membership; missing trip and not-allowed give the same error. Prod history check: 10,371 workflow rows and 85 timeline rows, 0 outside the rule.
- Timeline writes are retry-safe (identical row within 2 minutes returns the existing id).
- The Safe timeline wrapper now logs a refused write instead of swallowing it.
- scripts/prod-error-report.sh: validates hours, keeps the token out of the process list, fails loudly on an API error (an empty report can no longer look like zero errors).
- New migration 20261125142041 (set record-trip-events-hardening). Tested by scripts/run-trip-event-functions-local-test.sh on a throwaway Postgres: 30/30 pass with it, 11 fail without it.
