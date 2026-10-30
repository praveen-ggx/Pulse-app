# nihas V1.0.29

## What
- Trip detail: on a phone browser, a completed supplier trip showed
  "Supplier: Awaiting data" (e.g. TRP001663, supplier SRUNGARAPU
  VENKATESWARA RAO). It now looks up the supplier and shows its name and
  avatar.

## Why
- Completed trips on narrow web open from a "light" bundle built from the
  trip row only, so it has no supplier details. The fallback read
  `trips.supplier_name`, a column that doesn't exist, and in bundle mode the
  supplier was never fetched. Prod data was fine: the supplier row and the
  full bundle RPC both return the name.

## Areas
features/trips/components/trip-detail/hooks/useTripDetail.ts

## Migrations
None.

## Tested
- Typecheck: no errors in the changed file (total 320, baseline 345).
- Jest: the light bundle path test and every features/trips suite (709) pass.
- Prod (read-only): bundle RPC as the GOGOVAN owner returns the supplier name.
- Not clicked through on a phone yet.
