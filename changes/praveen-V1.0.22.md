# praveen/V1.0.22

## What
- Delivered / light-path trip detail keeps showing the driver’s phone number (same as live stages).

## Why
- Completed trips use `preferLight` first paint (`composeLightTripDetailBundle`), which left `bundle.driver` null. With the bundle path enabled, the legacy `getDriverById` phone load is skipped — so the number vanished after Delivered (and on narrow-web light paint).

## Areas
- `lib/queries/useTripDetailBundleQuery.ts` — light bundle seeds driver via `get_trip_driver_phones`
- `lib/queries/__tests__/useTripDetailBundleQuery.lightPath.test.ts`

## Migrations
- none

## Tested
- `npx jest lib/queries/__tests__/useTripDetailBundleQuery.lightPath.test.ts --ci --silent`
- UI: not clicked through
