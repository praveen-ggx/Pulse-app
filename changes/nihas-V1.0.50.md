# nihas/V1.0.50

Branched from V1 `74b1c3f6` on 2026-11-13.

## What
- Shared indent ID (e.g. SAT812-IND-003827) shown to both the shipper org and the awarded supplier org: Deploy load screen, Load Center Bids Won / Claimed cards, and Load Center search.

## Why
- Supplier could not see any ID to allocate a vehicle against; shipper ops quote the operational code, which the supplier never sees (and is 1 off).

## Areas
- Indent Deploy load (allocation) screen, Load Center cards + search.
- Release-set push script: already-applied versions with two files (20271014184500) use the history placeholder.

## Migrations
- 20261112144350_indent_reference_for_awarded_supplier.sql, 20261112150640_indent_references_for_viewer_batch.sql (set indent-reference-for-viewer). Preprod applied 2026-11-12. Prod pending.

## Tested
- Nihas checked locally on preprod as supplier SRUNGARAPU: Deploy screen, Bids Won / Claimed cards, search.
- Preprod SQL as the supplier user: awarded indent returns the code, unrelated indent returns nothing.
- Release-set Jest test; lint / cycles / lib-files baselines unchanged.

## Not tested
- Full Jest and typecheck locally (left to PR checks). Sub-assigned second supplier does not get the code.
