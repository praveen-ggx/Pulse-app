# nihas V1.0.10 — Sync prod (Vasanth V1.0.1 at d43cb449) into V1

Branch `sync/prod-2026-10-22`, from prod `d43cb449` with V1 `498a1873` merged in.

## What
- **Prod catch-up.** Brings Vasanth's PRs #8 (finance party analytics page, chart cross-filters), #9 (pooled bidding: prefilled bid revisions, extra-stop names on Get Load cards), #10 (hub avatars, Exchange/Reach art, E-LR shown only after a completed receipt) and his direct prod commits (hub share, connections swipe, mutual profile avatars, two-line hub E-way expiry, blue selected Compliance cards) into V1.
- **Merge conflicts (6 files), both sides kept.** Trip cards keep prod's LR / E-LR labels and hover plus V1's last-opened highlight; Compliance tab counts keep prod's "all" count plus V1's Ground Ops hiding of finance documents; query keys keep prod's hub LR labels plus V1's hub search keys; hub grid width keeps prod's typing.
- **Fixes to prod code so V1's required checks pass (no behaviour change).** Stray `{` in `ClientProfileHub.tsx` (file did not compile); type-only fixes in `NetworkScreen.tsx`, `LoadCenterView.tsx`, `indentDetailBootstrap.util.ts`, `TripsScreen.tsx` (Pressable hover state); two unused imports removed.
- **Import chain.** `pickPartyOrganizationImageUrl` (pure) moved to `lib/media/partyOrganizationImage.util.ts` and re-exported from `lib/partyAvatarDisplay.ts`, so `indentCardAvatar.util.ts` no longer pulls in avatar upload → AuthContext → expo-web-browser.
- **Test-only changes.** `IndentDetailScreen.anonymous` / `.anonymousCounter` mocks return one stable query client (with `getQueryData`), like the real provider; prod's new effect depends on the client, so a new object per render looped. `PooledOpportunityScreen` queries that look inside the bid sheet pass `includeHiddenElements: true`: the screen is now an `accessibilityViewIsModal` dialog and the test renders the sheet beside it (on device the sheet is its own RN `Modal`). No expected values changed.

## Why
- Prod had 12 commits V1 lacked; release PR #7 conflicts with prod until V1 has them.
- On prod alone: TypeScript does not compile `ClientProfileHub.tsx`, typecheck is over baseline, lint is 107 (> 104), and 4 test suites fail (3 do not load, 7 pooled tests fail). V1's required checks block the sync until these are fixed.

## Areas
- Prod's PRs #8–#10 areas (finance analytics, network / pooled bidding, hub cards, Compliance styling); conflict files `TripsScreen.tsx`, `TripsHubViews.tsx`, `TripsHubMobileTripCard.tsx`, `ComplianceDocumentWorkspace.tsx`, `hubGridCardLayout.ts`, `queryKeys.ts`.

## Migrations
- None in this sync. (V1 still carries `20261021094632_trips_hub_search.sql`, applied on preprod, not on prod; it ships in the next release with a release set.)

## Tested
- Full jest 528 suites / 4147 tests pass (1 skipped as before). ci-baseline lint 103 (≤104), typecheck 86 (≤89), cycles 111, lib-files 178; navigation-policy 64 pass; git diff --check clean. Prod's pooled bid sheet confirmed opening with 3 targets via a temporary log (removed). Not clicked through in the UI.
