# vasanth hotfix — Self party list

## What
- The tag sheet, trip-card Untagged row, mission card, and earnings Tag chip open the same party list.
- That list is the driver's device parties plus parties already on the driver's own Self trips.
- Marking a fleet trip writes a fleet note and leaves the Untagged row.
- A party tag and a collect payment are confirmed against the driver view or ledger before they count as saved.

## Why
- The select list was only the device book, so parties already on Self never appeared.
- A tag or payment could look saved when the driver view never kept the row.

## Areas
- Driver tag sheet, trip history, mission card, wallet earnings, add-client, trip notes, driver ledger.

## Migrations
- `supabase/migrations/20271102184500_driver_offline_trip_book.sql`
- Not applied. The app still confirms a direct notes or ledger write when those functions are absent.

## Tested
- Focused Jest for the tag save and capture payment.
- Not clicked through on production.
