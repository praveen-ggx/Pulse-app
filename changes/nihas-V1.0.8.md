# nihas V1.0.8 — Ground Ops: no previous user's data, no finance figures

## What
- Signing out, or signing in as someone else on the same browser, now wipes the saved app data before any screen loads. The saved data is tagged with the user it belongs to; a different user (or nobody) clears it.
- The app's data cache and the cache that the "switch organization" clean-up empties are now the same instance (they were two separate ones, so that clean-up emptied a cache nothing used).
- Ground Ops on the Compliance page no longer see Rates (supplier rate, client rate, profit), Banking (account number, IFSC, branch), the Advance Payment preview, or the Payment / Advance / Balance columns in the table and its Excel export. Documents, uploads and trip details are unchanged. The supplier bank account is no longer fetched for them.

## Why
- 21 Oct: a Ground Ops login on a browser previously used by an admin saw the admin's Compliance queue (345 trips instead of 102). Deepak (Ground Ops) saw Dinesh Sharma's 4 trips instead of his own 72. The database returned the right rows; the browser served the previous login's saved list, which was kept per organization, not per user, and never cleared on sign-out.
- Ground Ops upload documents only; the Compliance trip detail showed them client and supplier rates, margin and the supplier's bank account.

## Areas
- lib/cache/cacheOwner.ts (new: owner tag + gate), lib/queryClient.ts (owner tag never garbage-collected), app/_layout.tsx (gate the signed-in screens on it; use getQueryClient()), app/compliance/index.tsx and features/tripCompliance/components/ComplianceDocumentWorkspace.tsx (hide commercials for Ground Ops).

## Migrations
- None.

## Tested
- New lib/cache/__tests__/cacheOwner.test.tsx (8 tests: same user keeps the cache, other user / sign-out / unknown owner clears, owner tag survives save and restore, gate waits for auth and re-gates on a user switch). Full jest 520 suites / 4094 tests pass. ci-baseline lint, cycles, lib-files pass; git diff --check clean.

## Not tested / follow-up
- Database access: Ground Ops can still read rates, bank accounts, transactions and payment requests through the API (row access rules only check org membership). Needs a migration via a release set; not in this change.
