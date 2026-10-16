# gowtham V1.0.3 — Search in deploy-load driver and vehicle pickers

## What
- Deploy load (indent → allocation → Fleet step): added a search box to "Select driver" (name, phone, email) and "Select vehicle" (vehicle number ignoring spaces, vehicle / body type), with a "No … match your search" line when nothing matches. Picking a result clears the search.

## Why
- Orgs with many drivers and vehicles had to scroll the full list to find one when deploying a load.

## Areas
- features/indents/components/IndentAssetAllocationStep.tsx (search state + reuse of the existing DesktopPartySearchField from create-trip), new features/indents/utils/indentAllocationSearch.util.ts. Counts, add buttons, busy/available rules and layout unchanged.

## Migrations
- None

## Tested
- New jest indentAllocationSearch.util (9 pass). ci-baseline lint 104/104, typecheck 64/89, cycles 111/111, lib-files 178/178; full jest 515 suites pass; test:navigation-policy 64 pass; git diff --check clean. Not clicked through in the UI.
