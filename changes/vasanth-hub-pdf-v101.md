# vasanth hub/PDF on V1.0.1

## What
- Trips hub last-opened restore, date-range fetch, exact rail metrics.
- Vault / Compliance PDF preview signing and mobile page scroll.
- Proposed migrations for dated `get_trips_for_org` and `count_org_hub_metrics` (not applied).
- Hub RPC review patch: document either-date + 400/2000 caps; PostgREST NOTIFY; `count_org_hub_metrics` fail-closed `is_org_member` + get_trips visibility; `delivered_docs_pending` is destination+docs, not completed.
- History rail no longer adds completed trips to documents pending; missing metrics RPC is not shown as org-wide counts; hub pills and matching use Asia/Kolkata days; a full 2000-row dated page is labeled as possibly incomplete.

## Why
Isolate the hub/PDF work from PR #31 so trip-finance, invites, mascots, and support stay out.

## Areas
Trips hub, trip-detail vault preview, Compliance preview source, `get_trips_for_org` / hub metrics RPCs.

## Migrations
- `20271027155318_get_trips_for_org_date_range.sql` — not applied
- `20271027155402_count_org_hub_metrics.sql` — not applied

## Tested
Focused Jest: 6 suites / 41 tests passed (hub RPC contract, metrics parse, date pills, trip org fetch). Dated list does not table-scan. Not clicked through in a browser. Migrations not applied.
