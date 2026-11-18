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
- Trip assign popup: aggregate trips now load the assigner's fleet too, so a typed plate in their fleet saves `vehicle_id` (the popup emptied the list since 1a9f1456c, which is how TRP002015 lost its link).
- Permanent DB fix (migration `20261114111733_link_trip_vehicle_by_plate`): any trip saved with only a plate gets `vehicle_id` from the supplier's linked-org fleet, then the trip org's fleet (exactly one match, else no link). When a truck is added later, unlinked trips with its plate are linked. One-time backfill of existing trips. Cancelled/deleted/owner-vehicle trips and explicit unlinks are left alone.

## Migrations
- `20261114111733_link_trip_vehicle_by_plate.sql` (functions + 2 triggers + backfill). Prod read-only dry run: backfill links 17 trips (TRP005, 007, 009, 011, 013, 015, 017, 019, 025, 029, 055, 121, 143, 543, 565, 571, 575), none ambiguous. TRP002015 was already linked by hand on prod 14 Nov. Release set `link-trip-vehicle-by-plate` (sha-pinned, Jest-guarded). Prod apply needs Vasanth's GO; preprod push by Nihas.

## Tested
- `vehicleViewerTripDedup.test.ts`: 2 new tests (plate-matched truck reads back its uploaded doc; vehicle_id trips make no extra read). The read-back test fails without the fix.
- `npx jest features/tripCompliance`: 801 passed.
- Migration run on a scratch local Postgres 17 with a minimal schema: links supplier-fleet, trip-org-fleet, plate-set-later and truck-added-later cases; skips cancelled, ambiguous plate, explicit unlink.
- `linkTripVehicleByPlate.migration.contract.test.ts` (static contract).
- `ci-baseline typecheck`: 346 = baseline. eslint on the workspace: same 7 warnings as before, 0 errors.

## Not tested
- A real upload click-through on preprod/prod.
- Migration not yet applied to preprod (real schema/triggers) — Nihas pushes.
- 122 trips whose truck is in no fleet stay unlinked by design (nothing to link to).
