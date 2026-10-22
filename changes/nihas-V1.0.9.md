# nihas V1.0.9 — Trips hub search (with Gowtham's PR #24) and Trip Ops export

## What
- Trips hub search also matches the code of the indent a trip was created from (operational code, indent code, indent number, display number), on the cards and in the table. Allocated indents have no card of their own, so searching an indent code now finds its trip. The table search also matches the trip number and display trip id.

## Why
- Searching an indent code on the Trips hub found nothing once the indent had become a trip.

## Areas
- features/trips/screens/TripsScreen.tsx (indent codes by indent id, used by the hub search), features/trips/components/TripsHubViews.tsx (table search).

## Migrations
- None in this commit.

## Tested
- Typecheck and lint on the two files; full checks run on the combined branch (see below).
