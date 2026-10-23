# gowtham V1.0.7 — Ground Ops handoff from Nihas (nihas/V1.0.14)

## What
- Continues nihas/V1.0.14 (cdc93723, on V1 8a2bb97a): Ground Ops Reached Pickup / Start Trip, Assigned trips in Document Upload, Bank Docs hidden from Ground Ops, Asset Vault file counts, licence formats, KYC Individual. Details in changes/nihas-V1.0.14.md.
- Mobile bottom bar: a Compliance tab (same rule as the desktop top nav: trip_compliance.tab and the Compliance product on), and Chat only for members with sales.chat. Ground Ops on a phone now get Trips · Compliance · Profile instead of Trips · Chat · Profile.
- Document Upload on a phone (Ground Ops only, width < 560): the trip list fills the screen; tapping a trip opens its documents full-screen with a "‹ Trips" back bar (Android back too). Tabs, the full list of documents to upload, preview buttons and the preview (460 high) scroll as one page. Shorter chip labels (Inbox / On hold / Declined), no Cards/Table toggle (cards only), no duplicate "N to upload" pill. Desktop, tablet and other roles unchanged.

- Compliance on a phone (native): the stage rail (Document Upload tab) shows again above the queue, and the white gap above the bottom bar is gone. E-LR / jsPDF no longer crashes trip screens on Android (latin1 TextDecoder shim).

- Trip detail "Trip not found": stops reopening that trip on every launch (cold start restored it as the last screen) and adds Back to Trips plus a short hint; Try Again stays.

- Phone: e-way bill strip in the trip vault shows one card per e-way bill (number + Upload/View/Edit on top, Created / Valid till / Doc No below) instead of a 7-column table; Compliance trip documents tabs wrap so Driver is visible. Wider screens unchanged.

- Phone: trip vault cards 2 across (were 3, Preview/Add squeezed into vertical letters); Compliance e-way "Entered details" preview shows one entry per row (was 2 side by side with cut labels and wrapped values). Wider screens unchanged.

- Phone trip vault cards: Preview above Add, each full card width (44pt), labels on one line.

- E-way "Entered details" preview: numbers and dates stay on one line on Android (no clipped second line); header card lines up with the entry cards (phone and web).

- E-way polish (checked in a local web render at 390 and 1440 wide): entered-details entries spaced 8pt apart on phones, one centred column up to 960pt on web (cards no longer stretch edge to edge); vault e-way table action columns 48pt so "Upload" fits on one line.

- E-way entered details: labels read "E-way No" / "Doc No"; dates keep normal hyphens on Android (tabular digits only for pure numbers); the E-way Bill file sheet shows "Entered details" instead of eway-fields.json.

## Why
- Ground Ops on mobile had no way to reach Compliance (the mobile bar had no slot for it), and their Chat tab did nothing when tapped (no sales.chat, so openMessages returns early).
- On a phone the trip list and documents were squeezed into one screen (list 42% high, documents list capped at 46% of the rest), so the trip card was cut off and the list of documents to upload had no height at all: Ground Ops could not see what to upload. "Declined by finance" ran off the screen.

- On Android the stacked toolbar's `flex: 1` row collapsed to 0 high, so the queue drew over the stage rail; the screen also reserved space for a floating tab dock, but on native the root dock sits below the screen. jsPDF's fast-png dep calls `new TextDecoder('latin1')` at import; Expo's native decoder is UTF-8 only.

- A Ground Ops member whose warehouses changed (Perambra removed on preprod) was sent to a trip they can no longer read on every app open, with only Try Again, which can never succeed.

- At phone width the e-way table left ~40pt per text column (number and dates cut to "…", headers wrapping out of line), and the five document tabs (72pt minimum each) did not fit, so Driver sat past the edge of a side scroll with no hint.

- vaultCardHalf set width 48% but vaultCard's flexBasis 31.8% wins in a row, so columns={2} never applied. TypedDetailsPreview always paired entries, leaving ~110pt per card between the prev/next chevrons on a phone.

- In a half-width card the two buttons got ~37pt of text room each, so PREVIEW broke across lines.

- Android ignores numberOfLines on selectable Text, so values wrapped inside fixed-height rows; the header had no room left for the 18pt scroll rail the entries keep.

- Stacked entry cards touched; on wide web the cards ran the full screen width with labels and values far apart; the 36pt action column broke "Upload" into "Uploa / d".

- Phone screenshots showed "16 - Oct - 26" (tabular-nums widened hyphens on Android) and the internal JSON filename in the file sheet.

## Areas
- components/navigation/PulseBottomTabBar/PulseBottomTabBar.tsx (Compliance slot, showChat, memo compares compliance), components/demo/DemoTabBar.tsx (passes canOpenChat).
- features/tripCompliance/components/ComplianceDocumentWorkspace.tsx (phoneFlow prop, PhoneDetailFrame), app/compliance/index.tsx (groundOpsPhone: phoneFlow, chip labels, footer hidden).

- app/compliance/index.tsx (filtersRowStacked, native paddingBottom), features/trips/utils/latin1TextDecoder.util.ts (+test), features/trips/services/elrPdf.util.ts (imports the shim).

- lib/lastRoute.ts (forgetLastFullPath + test), features/trips/components/trip-detail/TripDetailScreen.tsx (+ .styles.ts): not-found state only.

- features/trips/components/trip-detail/EwayBillVaultTab.tsx (compact < 560), features/tripCompliance/components/ComplianceDocumentWorkspace.tsx (renderChecklistPanelTabs, phone wrap).

- features/trips/components/trip-detail/TripDetailScreen.styles.ts (vaultCardHalf flexBasis), features/tripCompliance/components/ComplianceDocumentWorkspace.tsx (TypedDetailsPreview multiColumn ≥ 560).

- features/trips/components/trip-detail/TripVaultCardGrid.tsx (stackButtons), TripDetailScreen.styles.ts (vaultBtnRowStacked, vaultBtnStacked).

- features/tripCompliance/components/ComplianceDocumentWorkspace.tsx (TYPED_VALUE_SELECTABLE, typedPreviewHeader marginRight).

- features/tripCompliance/components/ComplianceDocumentWorkspace.tsx (typedPreviewColumn, typedPreviewRow gap), features/trips/components/trip-detail/EwayBillVaultTab.tsx (colAction / iconBtn 48).

- features/tripCompliance/components/ComplianceDocumentWorkspace.tsx (typedLineLabel, typedValueStyle, file sheet name via isEwayBillMetaPath).

## Migrations
- None of mine. 20261022123845_individual_registration_type.sql comes from Nihas, who runs it on preprod/prod.

## Tested
- Branched from upstream/nihas/V1.0.14 cdc93723 (V1 8a2bb97a).
- Full jest: 534 suites / 4199 tests pass on a clean rerun (a first run in parallel with tsc had 2 flaky failures that did not repeat).
- lint 102 (≤104), typecheck 62 (≤89; needs NODE_OPTIONS=--max-old-space-size=8192 locally or tsc crashes), cycles 111, lib-files 178. git diff --check clean.
- Not yet clicked through on preprod as Ground Ops / Trip Ops.
- Mobile bar: new PulseBottomTabBar test (Ground Ops slots, Compliance press, Compliance hidden without access) passes; lint and typecheck clean on touched files. Not yet checked on a phone or at mobile width with a Ground Ops login.
- Document Upload phone flow: tripCompliance + navigation Jest (60 suites, 701 tests) pass; lint 102 and typecheck 62 unchanged (the defaultFinanceList lint error and 2 tsc errors in ComplianceDocumentWorkspace were there before). Not yet checked on a phone with a Ground Ops login.
- Stage rail / bottom gap / latin1 fixes: tripCompliance + compliance + navigation Jest (59 suites, 642 tests) and ELR tests pass; typecheck 62 unchanged; no new lint. Web unchanged by design (both layout fixes are native-only or stacked-toolbar-only). Not yet re-checked on the phone.
- Trip not found fix: lastRoute tests (6) pass; lib + trips + app Jest 537 suites pass (one pulse-v2 auth test flaked in that run and passes alone); typecheck 62; no new lint in touched files. Not yet checked on the phone.
- E-way / document tabs: tripCompliance + trips Jest (133 suites, 1102 tests) pass; typecheck 62; lint unchanged in both files. Not yet checked on the phone.
- Vault cards / e-way preview: tripCompliance + trips Jest (133 suites, 1102 tests) pass; typecheck 62; lint unchanged. Not yet checked on the phone.
- Vault buttons: trips Jest (460 tests) pass; typecheck 62; no lint in touched files. Not yet checked on the phone.
- E-way preview: tripCompliance Jest (642 tests) pass; typecheck 62; lint unchanged. Not yet checked on the phone or web.
- E-way polish: before/after screenshots at phone and desktop width from a temporary local harness (removed, not committed); tripCompliance + trips Jest (1102 tests) pass; typecheck 62; lint unchanged.
- E-way labels / dates / file name: checked in a local web render (phone + desktop width; harness removed); tripCompliance + trips Jest (1102 tests) pass; typecheck 62; lint unchanged. Android hyphen spacing not yet re-checked on the phone.
