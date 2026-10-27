# vasanth hub/PDF on V1.0.1

## What
- Trips hub last-opened restore, date-range fetch, exact rail metrics.
- Vault / Compliance PDF preview signing and mobile page scroll.
- Proposed migrations for dated `get_trips_for_org` and `count_org_hub_metrics` (not applied).

## Why
Isolate the hub/PDF work from PR #31 so trip-finance, invites, mascots, and support stay out.

## Areas
Trips hub, trip-detail vault preview, Compliance preview source, `get_trips_for_org` / hub metrics RPCs.

## Migrations
- `20271027155318_get_trips_for_org_date_range.sql` — not applied
- `20271027155402_count_org_hub_metrics.sql` — not applied

## Tested
Focused Jest for hub/PDF utils. Dated list does not table-scan. Not clicked through in a browser.
