# nihas/V1.0.37 — Changes

Base: V1 `79171699` (PR #70 merge, 2026-11-02)

## Release preparation
## Bug fixes
- Block per-MT toggle when a per-trip lane is selected — prevents lane total rate being treated as a unit rate and multiplied by tonnage (e.g. ₹46,390 × 21 = ₹9,74,190). Guard in both Create Indent and Create Trip forms.

## Features
## Database / migrations
## Ops / manual
- Prod data fix needed: IND003313/TRP001863 (Berger, Puducherry→Thrissur) — client_price 974190→46390, sale_rate_basis per_mt→per_trip, sale_unit_rate→NULL. No finance rows exist. SQL in PR description.
- IND771/TRP381 same lane — indent still inflated (987651), trip was partially corrected to 35000/per_trip. Needs ops team confirmation on correct rate before fix.
