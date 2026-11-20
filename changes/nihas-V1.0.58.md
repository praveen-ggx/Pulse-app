# nihas/V1.0.58

Branched from V1 `617de36a` on 2026-11-20.

## What
- One rule for which copy of a vehicle / driver document counts (`features/compliance/utils/currentDocument.util.ts`): live copies only (not replaced / rejected), dated copies first, then newest. A live copy older than a newer live copy with a different expiry is superseded (history). Pages of one document share an expiry and stay together.
- Readers use that rule: Compliance queue (Pending Docs routing), checklist, Ground Ops transit gate, vehicle document reuse, Trip Detail score (expired / missing counts).

## Why
- SAT812GOGTRIP002582 / 002700 stayed out of the Compliance queue after a renewed insurance was uploaded: the old expired copy was never retired and the queue judged the slot by whichever copy came first in random id order.

## Areas
- features/compliance/utils (currentDocument.util, complianceScore.util)
- features/tripCompliance/utils (checklist, rows, transit gate), services/vehicleDocumentReuse.service.ts

## Migrations
- None in this commit.

## Tested
- Jest: currentDocument.util (old/new expiry both ways, pages, undated, replaced/rejected), complianceChecklist.
