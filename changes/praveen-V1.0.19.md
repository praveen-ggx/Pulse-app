# praveen V1.0.19

## What
- Per-MT client sale: save the exact `rate × weight` product (e.g. 2,520 × 29.877 = 75,290.04). Stop rounding the trip total to whole rupees and stop rounding indent kg→MT to 2 decimals before the multiply.
- `formatSaleAmount` / Finance `formatINR` keep paise when the stored amount is not a whole rupee; whole-rupee amounts still display as before.
- Per-trip flat totals and supplier quote previews are unchanged.

## Why
- Trip SAT812GOGTRIP001968 saved ₹75,298 because indent weight 29.877 MT was rounded to 29.88, then `Math.round(2520 × 29.88)` produced 75,298 instead of 75,290.04.

## Areas
- `features/clients/utils/saleRateSnapshot.util.ts`
- `features/clients/utils/clientLanePrefill.util.ts`
- `features/indents/utils/indentDeployTripDetails.util.ts`
- `lib/format.ts`
- tests under `features/clients/utils/__tests__/` and `features/indents/utils/__tests__/`

## Migrations
- none (no backfill of existing `client_price` rows)

## Tested
- Jest: saleRateSnapshot (exact 2520×29.877) + indentDeployTripDetails kg→tons precision
- not clicked through UI after this commit
