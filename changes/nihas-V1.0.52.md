# nihas/V1.0.52 — Compliance: upload vehicle docs for supplier trucks matched by plate

## What broke
TRP002015 (GOGOVAN, supplier SMK LOGISTICS, TN52AF9048): the vehicle checklist shows after V1.0.47, but Upload says "Nothing to upload — Assign a vehicle to this trip".

## Root cause (evidence)
- The trip has `vehicle_id = NULL` and only a typed plate `vehicle_display_number = TN52AF9048` (prod). The assignment audit (4 Nov 2026 08:01 UTC, by smklogistics@gmail.com) set the driver but `vehicle_id_new` is empty. SMK's fleet already had that truck (`5221b5bd…`, created 3 Nov 11:24 UTC). It is 1 of SMK's 39 trips without a linked vehicle.
- V1.0.46/V1.0.47 resolved that truck by plate (`vaultVehicleId`) for display only. The Upload guard (`scope === "vehicle" ? summary.trip.vehicle_id`) predates plate matching and still looked only at `vehicle_id`.
- The read side also loaded Compliance-uploaded vehicle docs (viewer-org `entity_documents`) only for `trip.vehicle_id`, so an upload would have saved and then not shown.

## What changed
- Vehicle tab actions (upload, approve, decline prefill, preview, change log) use `trip.vehicle_id ?? vaultVehicleId`.
- Read side also loads viewer-org vehicle docs for plate-matched trucks (one extra query, only when such trips exist).

## Migrations
None.

## Tested
- `vehicleViewerTripDedup.test.ts`: 2 new tests (plate-matched truck reads back its uploaded doc; vehicle_id trips make no extra read). The read-back test fails without the fix.
- `npx jest features/tripCompliance`: 801 passed.
- `ci-baseline typecheck`: 346 = baseline. eslint on the workspace: same 7 warnings as before, 0 errors.

## Not tested
- A real upload click-through on preprod/prod.
- Linking the trip to the fleet truck (data fix) — not done; needs a decision.
