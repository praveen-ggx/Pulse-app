# vasanth 2026-10-29 network profile partner stats

## What
- Network profile modal falls back to single partner-display when batch stats are null.
- Keep a seeded trip count instead of overwriting with 0 from an incomplete snapshot.
- Migration restores batch trip/vehicle/indent counts (apply separately).

## Why
Live `get_connection_partner_display_batch` returned null trip/vehicle/indent keys, so Demo Login 1 showed 0 trips while the DB had 2.

## Areas
Network profile modal, partner-display snapshot.

## Migrations
`20271029153000_restore_partner_display_batch_stats.sql` — not applied by this deploy; client fallback is enough for the UI.

## Tested
Jest: networkProfileSnapshot.partnerDisplay.test.ts. DB checked: Demo Login 1 has 2 trips / 1 vehicle.
