# gowtham V1.0.37 — Driver / DCO operating-mode batch + booking_ref & offline market-hire

## What
- Driver app operating-mode / DCO Self batch: tab bar and driver home routes, trip flow / completed modal, multi-order job card, trip history, control / profile / party receivable / level screens, and related tests.
- Operating-mode helpers and query wiring so Self / DCO / fleet surfaces pick the right book and gates.
- DCO Self offline + receivable issue paths (clearer errors, sync/offline util tweaks) and exchange payment test coverage for DCO Self book routing.
- Assigner display util + unit test; RBAC operating-model changelog note; DCO operating-model boundary SQL test updates.
- Migration `20271103223000_booking_ref_skip_taken_refs`: booking_ref trigger skips refs already on `trips` and can walk past a lagged sequence (paid DCO award confirm failure).
- Migration `20271103224500_dco_allow_offline_market_hire_trip`: allow Aggregate/market-hire FLEET trips to assign a `tracking_only` DCO driver (offline hire by phone); employee/fleet DCO assignment stays blocked.

## Why
- Driver / DCO Self surfaces needed mode-aware UI and book routing so Self vs fleet work does not hit the wrong gates or books.
- Lagged `booking_ref_seq` vs existing refs caused unique violations after paid DCO awards (“could not confirm your job after payment”).
- Offline market hire of an approved DCO’s truck was refused as an employee-driver assignment even when the row was `tracking_only` on a market-hire trip.

## Areas
- `app/(driver)/**`, `components/driver/DriverTabBar.tsx`
- `features/driver/**`, `features/drivers/**`, `features/dco-self/**`
- `features/marketplace/services/exchangePayments.service.ts` (+ tests)
- `features/trips/utils/driverAssignerDisplay.util.ts` (+ tests)
- `lib/queries/useDriverOperatingModeQuery.ts`
- `docs/RBAC_OPERATING_MODEL_CHANGELOG.md`
- `supabase/migrations/20271103223000_booking_ref_skip_taken_refs.sql`
- `supabase/migrations/20271103224500_dco_allow_offline_market_hire_trip.sql`
- `supabase/tests/dco_operating_model_boundary.sql`

## Migrations
- `20271103223000_booking_ref_skip_taken_refs.sql`
- `20271103224500_dco_allow_offline_market_hire_trip.sql`
- Not applied from this branch. Nihas applies to preprod after merge; Vasanth applies to prod on release.

## Tested
- not clicked through
