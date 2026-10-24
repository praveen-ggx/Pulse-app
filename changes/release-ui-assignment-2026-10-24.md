# Combined UI release — 2026-10-24

Base: `personal/V1.0.1` @ `c10f8ff2`. Branch: `release/ui-assignment-2026-10-24`.

## Included

### 1. Manifest Assets assignment
- Phone identifies the driver. App profile name is a suggestion.
- Trip-local display name is stored in `trips.driver_display_name`.
- Manifest phone assignment does not call `updateDriver`.
- After `assign_aggregate_trip_driver`, the client persists the trip label. Persist failures are logged and shown.
- Wizard: Edit → Continue → Reason/Confirm → Save.

### 2. Vault PDF preview
- Shared preview pipeline + pdf.js first-page JPEG cache.
- `PdfViewer` rasters when `showToolbar` is false (vault thumbs / card embeds).
- Iframe + native PDF chrome only when `showToolbar` is true.
- Default toolbar is off so cards do not expose Safari PDF chrome.

### 3. LR / vault thumbnails
- Desktop vault cards and mobile vault rows show hero + thumb strip from the document’s nested files, or the card `storagePath`.
- Empty / failed sign shows a file icon and Retry.
- Tap still uses the existing vault open path (`handleVaultCardPress`). Existing signed-URL helpers only (`getDocumentViewUrls`, `getVehicleDocumentViewUrl`, `signCompliancePreviewUrl`).

### 4. Compliance mobile chrome
- Below 768px: hub-style header, underline stage tabs, and search.
- Desktop toolbar, table toggle, and footer stay as they were.
- Exclusive list/review panes (`mobileExclusive` / `mobileReviewing`) are **not** included: they live on conflicted `app/compliance/index.tsx` + `ComplianceDocumentWorkspace.tsx` in the finance checkout.

## Excluded
- Vault delete-audit migration `20271024194500` and its service edits.
- Assignment RPC migration `20271024195200`.
- Individual GST worker `f0062552`.
- Lane warehouse helper.
- Conflicted finance-checkout files (not copied).
- `VaultCategoryPreviewModal` / `TripDetailScreen` wholesale rewrite.

## Known residual
- Until `20271024195200` is applied, live RPC can still UPDATE placeholder / tracking-only `drivers.name`.
- `ensureDriverRowByPhone` → `applyDriverNameToRow` still stamps `drivers.name` on the non-aggregate path.
- Compliance mobile does not hide the trip list while a card is open (workspace exclusive pane not on prod).
- Browser verification not run.

## Migrations
None.

## Tested
Focused Jest (10 suites / 39 tests). ESLint on changed files: parse clean; one pre-existing-style `exhaustive-deps` warning on the compliance header memo. `tsc --noEmit` reported no errors on the changed paths. Browser sign-off blocked (no authorized preprod session in this run).
