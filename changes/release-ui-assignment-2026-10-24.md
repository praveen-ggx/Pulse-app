# UI release: Manifest assignment trip-local names

## Included
- Manifest Assets phone assignment writes `trips.driver_display_name`.
- Typed name is no longer written with `updateDriver`.
- After `assign_aggregate_trip_driver`, the client persists the trip label. Persist failures are logged and shown on the Manifest phone flow.
- Wizard step tests: Edit → Continue → Confirm.

## Excluded (separate scope)
- Vault delete-audit migration `20271024194500`
- Assignment RPC migration `20271024195200` (stops live `drivers.name` updates). Client does not depend on that new RPC body.
- Individual GST worker `f0062552`
- Lane warehouse helper (prod `createIndent` already looks up `origin_warehouse_id`)
- Dirty-tree preview / compliance UI (not isolated; not copied)

## Known residual
- Until `20271024195200` is applied, live RPC can still UPDATE placeholder / tracking-only `drivers.name`.
- `ensureDriverRowByPhone` → `applyDriverNameToRow` still stamps `drivers.name` on the non-aggregate path. Separate fix.

## Migrations
None in this release.

## Tested
Focused Jest on assignment suites. Browser sign-off pending.
