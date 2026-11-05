# praveen/V1.0.24

## What
- Load weight (tons / MT) validation treats catalog / passing-ton capacity as a **maximum**, not a fixed band: allowed range is **1 MT … capacity max** for every catalog vehicle type and size.
- Example: Container → 22 Feet → Upto 10 MT accepts 7 MT (and other values from 1–10); rejects only below 1 or above 10.
- Closed vehicle-type label capacity is derived from the catalog max (removed hardcoded MT strings). Open 40 Feet shows **24 MT** (catalog `20-24 Ton`), not 20 MT. Suffix still only on the prior curated types (Open 40 / Container 32 SXL·MXL / LCV Container 32 SXL).

## Why
- Passing-ton labels like `7.5-10 Ton` (shown as "Upto 10 MT") were used as both floor and ceiling, so loads below the catalog band min (e.g. 7 under 7.5) showed "Outside this vehicle's range" even when under the stated max.
- Open 40 Feet’s selected-field label used a hardcoded `"20 MT"` that disagreed with catalog `OPEN_TYPE_PASSING_TONS["40 Feet"] = ["20-24 Ton"]`.

## Clarifications
- **Capacity validation:** `min = 1 MT`, `max =` picked passing-ton ceiling when set, else the vehicle type’s highest catalog band. Catalog band mins stay in config for chips / labels only.
- **Decimals:** any finite weight in range is allowed (e.g. 1.25, 7.5, 9.75 within Upto 10 MT).
- **Where the Open 40 Feet error appears:** Load Details → Vehicle type closed field (`Open 40 Feet · 20 MT`) and Tons range hint / "Outside this vehicle's range" when weight is validated against the wrong ceiling.
- **Repro:** Create/edit trip or indent → Load Details → Vehicle type → Open → 40 Feet → Done → field shows capacity; enter tons in 1–24 (e.g. 22) and confirm the range hint allows it (rejects only below 1 or above 24).

## Areas
- `features/vehicles/utils/vehicleTypeCatalog.model.ts` (`loadWeightAllowedRange`, `tonsOutsideVehicleRange`, `capacityForPassingTon`, `formatSelectedVehicleTypeLabel`)
- `features/trips/components/add-trip/TripCommodityFields.tsx`
- `features/vehicles/utils/__tests__/vehicleTypeCatalog.model.test.ts`

## Migrations
- none

## Tested
- `npx jest features/vehicles/utils/__tests__/vehicleTypeCatalog.model.test.ts --ci --silent`
- UI: not clicked through
