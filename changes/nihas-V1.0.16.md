# nihas V1.0.16 — Indents from a saved lane link to the lane's warehouse, so Ground Ops see the trips

## What broke / root cause
- Ground Ops only see trips whose indent is linked to one of their warehouses (`indents.warehouse_id`). On create, the app linked a warehouse only when the pickup text was exactly the warehouse's full address line. Indents made from a saved lane carry the lane's short pickup ("Perambra, Kerala"), so they were never linked, although the lane itself stores its pickup warehouse (`client_lane_rates.origin_warehouse_id`). On prod, 81 of 84 GOGOVAN indents from 22 Oct had no warehouse and Ground Ops (e.g. Saravanan, Apollo Perambra) did not see the new trips.

## What
- Indent create: when an indent comes from a lane, its warehouse is the lane's pickup warehouse (by id, no text matching). Otherwise unchanged: a kept warehouse address links, typed pickups stay unlinked.

## Areas
- features/indents/services/indents.service.ts (createIndent).

## Migrations
- None. Existing unlinked prod indents were linked once by SQL run by Nihas on 24 Oct (unique pickup-city match, 84 indents). All 81 lane-based indents since 22 Oct have a lane pickup warehouse; 79 now match it, 2 (Bluestar, lane "Chennai, Tamil Nadu" → Vengal) were skipped as ambiguous by that SQL.

## Tested
- Full Jest, ci-baseline checks. Not clicked through: creating an indent from a lane on preprod.

## Also: KYC PAN/GST upload no longer blocked by the Gemini check
- What broke / root cause: on gogopulse.com every Business PAN / GST certificate upload in Workspace → KYC → Verification failed with "This doesn't look like a PAN card". The upload runs the Gemini OCR check (gemini-doc-verify), prod has no Gemini key, and PAN/GST were set to fail when the check fails.
- What: the Gemini OCR check is switched off (one flag, `DOC_OCR_ENABLED = false`, in the business verification service). Uploads are saved and go to manual review; no auto-fill of PAN/GSTIN from the scan. Turn the flag back on once the Gemini key is set on prod.
- Areas: features/organization/services/businessVerification.service.ts.
- Migrations: none.
- Tested: eslint + tsc on the file. Upload not clicked through on preprod/prod.
