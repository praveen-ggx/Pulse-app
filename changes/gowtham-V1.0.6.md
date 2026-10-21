# gowtham V1.0.6 — Trips hub search, Trip Ops export, LR number on trip detail

## What
- Trips hub handoff from Nihas (c96290b0): hub search also matches LR number, vehicle number, driver and supplier; the last opened trip is outlined when you come back to the hub; the E-LR badge shows once per card; Trip Ops members without Finance get an 18-column Trips Export (stage times from trip_status_audit) instead of the ledger export.
- Trip Ops export fixes: stage times are read in 1,000-row pages so later stages (Arrived, Delivered) are not cut off; the export opens only once stage times have loaded, so stage columns are not blank; the ops sheet is built only for Trip Ops members with Export open. Removed the unused activeOpsTripIdsSorted (lint error).
- Trips hub search covers every trip and every field: a new search_trips_for_org RPC searches all trips the org can see (same visibility and row shape as get_trips_for_org, up to 200 newest matches), and its matches are added to the hub while searching. Matches trip number / ids / booking ref, client (trip name and client master), supplier, pickup / drop, vehicle number (spaces ignored), driver name, driver number (4+ digits, +91 / leading 0 ignored), indent code, LR number and e-way bill number. In the app, driver numbers come from get_trip_driver_phones (covers vendor and former drivers), and LR / e-way numbers are loaded on phones and History while searching. The hub table no longer filters a second time when the screen controls the search. Until the RPC is deployed, search falls back to the loaded trips with no error.
- Trip detail: the route hero strip shows LR No (from the trip's LR documents, typed or E-LR) between ETA Manifest and Status; "—" when there is no LR.

## Why
- Search only looked inside the newest 400 trips the hub loads (get_trips_for_org cap), so searching a client like Ramco Cement showed only a few of its trips. Driver number search found only this org's active fleet drivers, and LR / e-way numbers were not loaded on phones or History, so those searches returned nothing there.
- LR number on the trip detail hero: approval for the dark route card confirmed by Gowtham (21 Oct).
- Trip Ops export: gaps found in review of the handoff.

## Areas
- features/trips/screens/TripsScreen.tsx (hub search, server hits merge, search-time LR / e-way / driver number loads, Trip Ops export), features/trips/components/TripsHubViews.tsx (no double filter when search is controlled), features/trips/components/TripsHubMobileTripCard.tsx (handoff), features/trips/services/trips.service.ts (searchTripsForOrg), features/trips/hooks/useTripsHubSearch.ts (new), features/trips/services/tripDocumentLrPod.service.ts (lrNumbersByTripId, ewayNumbersByTripId), features/trips/services/tripStatusTimes.service.ts (new, paged), features/trips/components/trip-detail/TripDetailScreen.tsx (LR No in route hero).

## Migrations
- supabase/migrations/20261021094632_trips_hub_search.sql — new function public.search_trips_for_org(uuid, text, integer), SECURITY DEFINER, grant to authenticated / service_role. Body copied from get_trips_for_org (20271013113000_compliance_trips_backlog); only the search filter is new. Not run on any database yet (no linked DB here), so please dry-run first. Its timestamp is earlier than the 2027-dated migrations already on preprod, so it needs --include-all.

## Tested
- Rebased on V1 42a7219a. Full jest 519 suites / 4086 tests pass. ci-baseline lint 103 (≤104), typecheck 65 (≤89), cycles 111, lib-files 178; navigation-policy 64 pass; git diff --check clean.
- Migration: one file, non-empty, no 000000 time. npm run db:preflight not run (no Supabase CLI link on this machine), and the SQL has not been run against a database, so please dry-run it.
- Not clicked through in the app.
