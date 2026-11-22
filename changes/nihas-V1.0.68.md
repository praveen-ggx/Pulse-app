# nihas/V1.0.68

Branched from V1 `88a50e25` on 2026-11-22.

## What
- Compliance payment screen: the TDS row stops showing "Fetching vendor rate…" once the rate is loaded on an advance the server already approved (formula v1). The load returned early without clearing the spinner.

## Why
- Dhira 22 Nov screenshots (TRP002959, TRP002681): TDS amount spinner never stopped on approved advances. Cosmetic only — the payable shown is the server amount and Confirm does not wait for it.

## Areas
- features/tripCompliance/components/CompliancePaymentConfirmModal.tsx

## Migrations
- None.

## Tested
- Jest features/tripCompliance; eslint on the file.

## Not tested
- Click-through on an approved advance (no component test covers this screen).
