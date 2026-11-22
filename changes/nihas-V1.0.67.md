# nihas/V1.0.67

Branched from V1 `c4a39038` (= prod 2fc4f20e) on 2026-11-22.

## What
- Compliance advance / balance on Marketplace (Exchange) trips post straight to the payer's ledger (Vasanth decision, option b). App: `routeExchangeTripPayment` skips `compliance_advance` / `compliance_balance`. DB: migration `20261122124730` lets those two categories through `tg_transactions_pulse_exchange_guard` (prod body + one early return) and cancels the 42 open payer claims that Compliance payments created. Release set `compliance-direct-on-exchange-trips` + pin test.
- Plain-English incident note with proof: `docs/incidents/2026-11-22-compliance-payments-on-marketplace-trips.md`.

## Why
- Dhira 22 Nov: UTR entered, Confirm payment clicked, trip stays in Pending without UTR; second click "over_settlement". Compliance payments on Marketplace trips became Exchange claims waiting for the supplier (Exchange two-gate since 7 Oct); Compliance never showed that state. 42 claims (7 Nov 1, 17 Nov 3, 22 Nov 38), none confirmed. Surfaced now because Marketplace trips only reached advance payment from 16–18 Nov and advances were blocked 18–21 Nov.

## Areas
- features/finance/services/finance.service.ts (+ test createLedgerEntry.pulseExchange)
- supabase/migrations/20261122124730_compliance_payments_post_directly_on_exchange_trips.sql
- supabase/release-sets/compliance-direct-on-exchange-trips.versions (+ test)
- docs/incidents/2026-11-22-compliance-payments-on-marketplace-trips.md

## Migrations
- 20261122124730 (set `compliance-direct-on-exchange-trips`). Includes a data step: 42 open payer claims → cancelled (same update as cancel_exchange_payment).

## Tested
- Preprod inside BEGIN … ROLLBACK on a Marketplace trip: old guard blocks the Compliance advance; new guard posts it; ordinary payment to the same supplier and EXCHANGE_PAYMENT still blocked. Preprod unchanged after.
- Prod read-only: cleanup predicate matches exactly the 42 open claims (all GOGOVAN); all 42 amounts equal the approved advance.
- Jest: createLedgerEntry.pulseExchange (new cases), exchangePayments.service, features/tripCompliance, release-set pin test.

## Not tested
- Real apply and a real Confirm payment on a Marketplace trip after it; Finance re-posting the 42 cancelled claims.
