# Trip-local driver name on Manifest assignment

## What
Phone assignment stamps `trips.driver_display_name` and no longer calls `updateDriver` with the typed label. Wizard step tests cover Edit → Continue → Confirm.

## Why
The trip label is not the driver profile name. Changing the phone should refresh the suggested name without writing the old label onto the new driver's profile.

## Remaining
`assign_aggregate_trip_driver` may still accept `p_driver_name`. Browser sign-off of Back / failed save is pending a signed-in session.
