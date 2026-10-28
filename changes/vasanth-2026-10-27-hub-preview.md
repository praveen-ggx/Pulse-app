# vasanth 2026-10-27 hub / preview

## What
- Trips hub: last-opened restore, exact org metrics, date-range fetch, indent table rows.
- Compliance / vault PDF preview scroll and signed URL refresh.
- Profile, support, story reel, and welcome-mascot image prefetch.

## Why
Ship today's local product work without mixing tmp SQL, worktrees, or unapplied migrations.

## Areas
Trips hub, trip detail / vault PDF, org profile counts, onboarding visuals, support screens.

## Migrations
None in this commit. `count_org_hub_metrics` and dated `get_trips_for_org` stay untracked; client falls back if those RPCs are missing.

## Tested
Not clicked through on production. Preview after Netlify deploy-preview.
