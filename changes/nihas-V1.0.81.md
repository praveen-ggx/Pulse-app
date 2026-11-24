# nihas/V1.0.81

Branched from V1 `23dd893b` on 2026-11-24.

## What
- Advance Payment: once Finance has approved the advance (Approve Advance), expired vehicle documents no longer block posting the advance (UTR / payment date). The expired warning stays on the card and panel. The balance stays blocked until the documents are renewed.
- Test in `complianceReadiness.util.test.ts`.

## Why
- Dhira, 24 Nov (APOLLO TRP002757 and similar): the advance was approved and paid, but the vehicle insurance / FC expired afterwards, so Finance could not enter the UTR and the trip stayed under Advance Payment pending. The server never blocked this; only the screen did.
