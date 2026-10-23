# vasanth party-page perf

## What
- Finance client and supplier pages load trip rows from the scoped party bootstrap and wait to start the org-wide ledger RPC until that catalog is on screen.
- Prefetch keeps the scoped fallback bundle when the page RPC is missing, and profile fallback uses `get_client_detail_bundle` only.

## Why
Opening a Finance client or supplier page was competing with a full-org trip list and ledger fetch, which made first paint slow after the recent merge.

## Areas
- `features/finance/hooks/useFinanceAlignedPartyTrips.ts`
- `features/clients/**` party bootstrap + ClientDetailScreen
- `features/suppliers/**` party bootstrap + SupplierDetailScreen

## Migrations
- none

## Tested
- Jest: fetch-gate, prefetch fallback, profile RPC choice, viewer trip membership (12 passed)
- eslint on the touched files: 0 errors
- `tsc --noEmit -p tsconfig.json`: exit 0
- not clicked through in the browser
