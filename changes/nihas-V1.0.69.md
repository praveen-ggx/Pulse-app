# nihas/V1.0.69

Branched from V1 `dbc4766c` on 2026-11-22.

## What
- Compliance never reports a payment as done unless the Finance entry was written: if `createLedgerEntry` parks it as a Pulse Exchange claim (`pendingExchangeConfirmation`), `postCompliancePayment` returns a clear "not posted" error.
- TDS "Fetching vendor rate…" spinner is cleared on every exit (approved advance, loaded, or lookup failure) via try/finally.
- Incident note covers all six Finance points from 22 Nov with prod evidence and the release order.

## Why
- 22 Nov: 42 Marketplace trips stayed in Pending without a UTR because the claim result was ignored (fixed at source in V1.0.67; this makes any recurrence visible). V1.0.68 only cleared the spinner on one path; a failed lookup still left it spinning.

## Areas
- features/tripCompliance/services/tripComplianceWrite.service.ts (+ test)
- features/tripCompliance/components/CompliancePaymentConfirmModal.tsx
- docs/incidents/2026-11-22-compliance-payments-on-marketplace-trips.md

## Migrations
- None.

## Tested
- Jest features/tripCompliance (+2 new cases), createLedgerEntry.pulseExchange.

## Not tested
- Click-through on prod screens (after release).
