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

## Also: one warehouse resolver, draft edits re-link, warnings for unlinked pickups
- What broke / root cause: editing a draft's pickup, lane or client never updated `indents.warehouse_id`, so a draft could keep the old warehouse (wrong Ground Ops) or stay unlinked. The lane warehouse was trusted without checking it belongs to the indent's client. Typed pickups (the place search does not know places like Arupukottai, Perunduraipattu) and Custom lanes were silently unlinked.
- What: one resolver for create and draft edits — explicit warehouse of the client, else the lane's pickup warehouse (same client only), else a pickup that is exactly one warehouse's suggested address; no city / partial matching, duplicates never picked. Draft edits re-link only when pickup / lane / client is sent and changed (or the draft has no link yet); a route that no longer resolves clears the link. Create indent shows a warning (not a block) when the pickup will not link to any of the client's warehouses; the mobile lane editor warns on a Custom pickup for a client with warehouses. Typing a pickup and Custom lanes stay allowed.
- Areas: features/clients/utils/warehouseAddress.util.ts, features/indents/services/indents.service.ts, app/create-indent/index.tsx, features/clients/components/ClientProfileLanesEditSection.tsx.
- Migrations: none.
- Tested: Jest warehouseAddress.util (16) + indentWarehouseLink (14). Warnings not clicked through in the app.

## Also: every saved lane needs one of its client's warehouses
- What broke / root cause: the mobile lane editor (and the desktop add-lane form for clients with no warehouse) saved lanes with a typed pickup and no warehouse; indents from those lanes could never link to a warehouse, so Ground Ops never saw their trips.
- What: `createClientLaneRate` / `updateClientLaneRate` refuse a lane whose pickup warehouse is missing or not one of the client's (also on update, so an old no-warehouse lane is not saved again until one is chosen). Mobile editor blocks Save on a Custom pickup and shows why; desktop add-lane form asks to add a warehouse first when the client has none. Adhoc indents unchanged (typed pickup still allowed, with the warning).
- Areas: features/clients/services/clientLaneRates.service.ts, features/clients/utils/warehouseAddress.util.ts, features/clients/components/ClientProfileLanesEditSection.tsx, features/clients/components/desktop/ClientProfileDataPanels.tsx.
- Migrations: none. Existing no-warehouse lanes left as they are (prod 24 Oct, read-only: 7 GOGOVAN — Mayora 1, Megha 4, Sarvoday 2; 7 in "nihas logs").
- Tested: Jest clientLaneRates.warehouse (10), warehouseAddress.util. Lane screens not clicked through.
