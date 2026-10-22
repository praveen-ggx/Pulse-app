# nihas V1.0.9 — Trips hub search (with Gowtham's PR #24) and Trip Ops export

Trip page work only. Includes Gowtham's PR #24 (`gowtham/V1.0.6`, commits f88c2479, 1d9e3867, 40684af9, c363d650 — see `changes/gowtham-V1.0.6.md`) with the review fixes below, plus Nihas's indent-code search fix.

## What
- **Indent codes in trip search (Nihas).** Trips hub search also matches the code of the indent a trip was created from (operational code, indent code, indent number, display number), on the cards and in the table. Allocated indents have no card of their own, so searching an indent code now finds its trip. The table search also matches the trip number and display trip id.
- **Search across all trips (Gowtham, PR #24).** A new `search_trips_for_org` function searches every trip the org can see, not only the newest 400 loaded on the hub: trip ids, client, supplier, route, vehicle, driver name and number, indent code, LR and e-way bill number. Results are added to the hub while searching. Trip detail shows LR No in the route strip. Trip Ops members without Finance get an 18-column Trips Export with stage times.
- **Review fixes to PR #24.**
  - LR / e-way search matches the actual LR and e-way numbers stored in the documents, not words inside the stored JSON. Searching "invoice", "date" or "sep" no longer matches almost every trip. Malformed stored values are read as plain text instead of failing the search.
  - Driver number search only runs for number-like searches, and only finds drivers whose number the trip detail already shows the person searching.
  - The function can no longer be called by signed-out (anon) users.
  - CI type error fixed (`actual_distance_traveled_km` added to `TripRow`).
  - Trip Ops export: LR NO is filled on the History tab too, and DRIVER NO includes vendor and former drivers. The export waits for these to load, and if a lookup fails it closes with a message; trying again works.
  - Searching no longer reloads the hub's document badges for all loaded trips on every search term; older matches load their own badges.
  - Search results, driver numbers and export lookups are not saved in the browser cache (they were up to ~550 KB per search and included phone numbers).

## Why
- Searching an indent code on the Trips hub found nothing once the indent had become a trip.
- Hub search only looked inside the newest 400 trips, so older trips of a client could not be found (PR #24).
- PR #24 review (22 Oct): CI typecheck failed (90 vs 89); LR / e-way search matched JSON key names; the export's LR NO and DRIVER NO columns were blank in common cases; each search re-fetched badges for 400+ trips and saved large results and phone numbers in the browser.

## Areas
- features/trips/screens/TripsScreen.tsx, features/trips/components/TripsHubViews.tsx, features/trips/components/TripsHubMobileTripCard.tsx, features/trips/components/trip-detail/TripDetailScreen.tsx, features/trips/hooks/useTripsHubSearch.ts, features/trips/services/trips.service.ts, features/trips/services/tripDocumentLrPod.service.ts, features/trips/services/tripStatusTimes.service.ts, lib/queryKeys.ts (new keys, `tripIdsHashKey`, `isNonPersistedTripsQueryKey`), app/_layout.tsx (cache save rule).

## Migrations
- `supabase/migrations/20261021094632_trips_hub_search.sql` — new function `public.search_trips_for_org(uuid, text, integer)`, SECURITY DEFINER; EXECUTE revoked from public / anon, granted to authenticated / service_role. Its timestamp sorts before already-applied 2027 migrations, so the preprod push needs `--include-all`. Not applied anywhere yet. Prod needs a release set.
- Known older debt, not changed: a fresh replay of all migrations already fails at earlier files (e.g. `20260918071909`) that use tables created later; this file has the same pattern.

## Tested
- New tests: `lib/__tests__/queryKeys.tripIdsHash.test.ts` (id-set hash, cache save rule) and `features/trips/services/__tests__/tripsHubSearch.regression.test.ts` (LR / e-way numbers from stored JSON, stage-time paging past 1,000 rows, migration guard / revoke / visibility rules).
- The search function body was run read-only on prod data before and after the fix: "invoice", "date", "sep" went from 200 matches to 0; a real LR and e-way number still match; a Ground Ops user finds only their hubs' trips. Malformed stored values tested on a local throwaway Postgres 17.
- Full checks on this branch: see the PR.

## Not tested
- Not clicked through in the app (search, History export, phone layout).
- Search as a linked-supplier organisation.
- Follow-ups (not in this change): export ASSIGNED time falls back to trip creation for almost all trips (only 24 "assigned" audit rows on prod); metric tiles count older search hits; older search hits lack the linked-org pill; results capped at 200 without a hint; no "searching" indicator.
