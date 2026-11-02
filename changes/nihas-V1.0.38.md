# nihas/V1.0.38 changelog

## Warehouse locality fix
- fix: enrichPlaceSelectionSync now returns the operational locality (e.g. Jeedimetla) instead of the administrative city (Hyderabad) when Google Places reports a distinct sub-city area

## Simulate stage on completed trip
- fix: forceSetTripStatusSimulated now clears completed_at when target status isn't 'completed', preventing trips_check1 constraint violation on stale-state simulate
- fix: handleConfirmSimulate guards against already-completed/cancelled trips before sending the write

## Driver name edit flow blockade
- fix: editing driver name on an already-assigned trip no longer triggers the "Assignment updated" confirmation dialog — the paintVehicleAssignment call was wrongly publishing confirm:true
