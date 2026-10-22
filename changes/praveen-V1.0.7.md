# praveen V1.0.7 — Truck type capacities for 32FT SXL, 32FT MXL, and Open 40FT

## What
- Vehicle catalog: 32 Feet SXL capacity is 7–9 Ton, 32 Feet MXL is 15–18 Ton, and 40 Feet is an Open type at 20–24 Ton. Container’s category range is 7–18 Ton. LCV Container 32 Feet SXL uses the same 7–9 Ton range; other LCV lengths stay at 3 Ton.
- The closed vehicle-type field shows the capacity in MT (Open 40 Feet · 20 MT, Container 32 Feet SXL · 7–9 MT, Container 32 Feet MXL · 15–18 MT). The option tiles do not show tonnage, and the stored vehicle type stays the catalog name.

## Why
- Those three truck types needed the payload ranges used in indent creation, trip forms, and truck assignment, with 40 Feet under Open.

## Areas
- features/vehicles/utils/vehicleTypeCatalog.model.ts, features/vehicles/components/VehicleTypeCatalogField.tsx, features/trips/components/add-trip/TripCommodityFields.tsx.

## Migrations
- None.

## Tested
- Rebased on V1 2a2cde0d. No migrations.
- lint 55 (≤104), typecheck 61 (≤89, Node 24, no errors in files touched), cycles 111, lib-files 178. navigation-policy 64 pass. git diff --check clean.
- Catalog unit tests pass for the three ranges and the selected-field labels. Picker clicked through: 40 Feet under Open, capacities not on the tiles, selected field shows the MT label.
- Full jest on this machine: 520 passed, 8 failed. None of the failures are in the vehicle catalog. They are migration contract / release-set checksum tests and a Windows path check in lib/__tests__/singleOwnerOperatorConcept.test.ts (`lib\\database.types.ts`). `node scripts/ci-baseline.js` cannot spawn `npx` here (no npx.exe); the counts above are from the same eslint, tsc, and madge commands.
