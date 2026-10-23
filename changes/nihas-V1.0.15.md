# nihas V1.0.15

## What
- Add driver accepts two real licence formats it used to reject: Telangana/AP smart-card (`DLFAP12810371208`) and the old slash format (`1043/HW/1997OD`).
- Party driver wizard (mobile keypad + desktop): new licence option "Old / smart card" so these cards can be typed; slashes are added automatically, ABC/123 toggle on the keypad.

## Why
- Drivers with these valid cards could not be added ("Enter a valid DL number").

## Areas
- `lib/indianDrivingLicenseInput.util.ts` (shared validator used by Add driver, driver registration and party registration). Party driver keypad (`IndianDrivingLicenseKeypadFlow`) and desktop party form get a third format option.

## Migrations
- None

## Tested
- Jest: licence format tests + drivers/finance component suites. Not clicked through in the app.
