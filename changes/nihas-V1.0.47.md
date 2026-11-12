# nihas/V1.0.47 — Cross-org vehicle vault: UI fix for empty-vault vehicles

## What
Show the vehicle document checklist for cross-org trips even when the supplier vehicle has no documents uploaded yet. Previously the UI showed "No vehicle assigned" for these trips.

## Why
Saravana (Ground Ops, GOGOVAN) reported that compliance trips with supplier vehicles (e.g. TN52AF9048 from SMK LOGISTICS) show "No vehicle assigned" even though the plate-fallback RPC correctly finds the vehicle.

Two bugs:
1. `indexVehicleVaultDocs` silently dropped vehicles whose vault had no uploaded documents (`docs.length === 0`), so `vaultVehicleId` was always null for empty-vault vehicles — even though the RPC found them.
2. `summarizeComplianceTrip` never forwarded `vaultVehicleId` from inputs to the summary, and the UI guards didn't check it.

## Areas
- `features/tripCompliance/services/tripComplianceRead.service.ts` — `indexVehicleVaultDocs` now indexes empty-vault vehicles (won't overwrite a docs-having entry); `summarizeComplianceTrip` forwards `vaultVehicleId`
- `features/tripCompliance/tripCompliance.types.ts` — added `vaultVehicleId` to `ComplianceTripSummary`
- `features/tripCompliance/components/ComplianceDocumentWorkspace.tsx` — 4 guard sites now check `vaultVehicleId`

- `features/tripCompliance/components/ComplianceSection.tsx` — payment-only summary sets `vaultVehicleId: null` (new required field)

## Migrations
No new migration files. Release-set prep for the 3 migrations on V1 that prod does not have yet (prod code was rolled back to Vasanth #103 `afc74f58`):
- `supabase/release-sets/prod-2026-11-12-release.versions` — 20261112061609, 20271111143000 (had no set), 20271111164000, each SHA-256 pinned; Jest test `prod20261112ReleaseSet.test.ts`.
- `hub-metric-counter.versions` — added the missing SHA-256 line.

## Tested
- 795 compliance unit tests pass
- Preprod runtime: TRP002015 (TN52AF9048, SMK LOGISTICS) now shows vehicle checklist with 6 doc slots instead of "No vehicle assigned"
- Verified vehicle `5221b5bd` has `documents = {}` on both preprod and prod — the fix handles this correctly
