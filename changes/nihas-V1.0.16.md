# nihas V1.0.16 — Indents from a saved lane link to the lane's warehouse, so Ground Ops see the trips

## What broke / root cause
- Ground Ops only see trips whose indent is linked to one of their warehouses (`indents.warehouse_id`). On create, the app linked a warehouse only when the pickup text was exactly the warehouse's full address line. Indents made from a saved lane carry the lane's short pickup ("Perambra, Kerala"), so they were never linked, although the lane itself stores its pickup warehouse (`client_lane_rates.origin_warehouse_id`). On prod, 81 of 84 GOGOVAN indents from 22 Oct had no warehouse and Ground Ops (e.g. Saravanan, Apollo Perambra) did not see the new trips.

## What
- Indent create: when an indent comes from a lane, its warehouse is the lane's pickup warehouse (by id, no text matching). Otherwise unchanged: a kept warehouse address links, typed pickups stay unlinked.

## Areas
- features/indents/services/indents.service.ts (createIndent).

## Migrations
- None. Existing unlinked prod indents were linked once by SQL run by Nihas on 24 Oct (unique pickup-city match, 84 indents). All 81 lane-based indents since 22 Oct have a lane pickup warehouse; 79 now match it, 2 (Bluestar, lane "Chennai, Tamil Nadu" → Vengal) were skipped as ambiguous by that SQL.

## Tested
- Full Jest, ci-baseline checks. Not clicked through: creating an indent from a lane on preprod.
