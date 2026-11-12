# nihas/V1.0.47 — Cross-org vehicle vault: UI fix for empty-vault vehicles

## What
Show the vehicle document checklist for cross-org trips even when the supplier vehicle has no documents uploaded yet. Previously the UI showed "No vehicle assigned" because it checked only `vehicle_id` and `vehicleDocuments.length`, both of which are empty for cross-org aggregate trips with empty vaults.

## Why
Saravana (Ground Ops, GOGOVAN) reported that compliance trips with supplier vehicles (e.g. TN52AF9048 from SMK LOGISTICS) show "No vehicle assigned" even though the plate-fallback RPC correctly finds the vehicle. The vault RPC sets `vaultVehicleId` on the inputs, but that field was never forwarded to `ComplianceTripSummary`, so the UI guards couldn't see it.

## Areas
- `features/tripCompliance/tripCompliance.types.ts` — added `vaultVehicleId` to `ComplianceTripSummary`
- `features/tripCompliance/services/tripComplianceRead.service.ts` — pass `vaultVehicleId` through `summarizeComplianceTrip`
- `features/tripCompliance/components/ComplianceDocumentWorkspace.tsx` — 4 guard sites now check `vaultVehicleId`

## Migrations
None.

## Tested
- 795 compliance unit tests pass
- Preprod runtime: plate RPC returns vehicle `5221b5bd` for plate `TN52AF9048` on trip `6ae3edb3` (confirmed via console debug)
- Preprod pipeline times out intermittently (unrelated — Vasanth's query perf PR #100 fixes not yet on preprod)
