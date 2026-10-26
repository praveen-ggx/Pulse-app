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
- `PdfViewer` / `TripVaultFilePreview` default `showToolbar` is **false** (was true). Raster JPEG when off; iframe chrome only when `showToolbar={true}`.
- Call-site audit after the default flip:
  - `VaultDocThumb` and Compliance workspace embeds already pass `false`.
  - Hard-copy POD list pane: explicit `false` (card-sized).
  - Hard-copy POD lightbox: `showToolbar={keepPdfChrome}` (native chrome at 100% zoom; custom zoom otherwise).
  - `ComplianceDocumentPreviewModal`: explicit `true` (full inspect modal; no custom zoom).
  - Trip vault open modal (`TripDetailScreen` three `TripVaultFilePreview` sites): left on the new default (raster, no Safari chrome). Matches the vault-thumb product; those sites do not pass `true`.

### 3. LR / vault thumbnails
- Desktop vault cards and mobile vault rows show hero + thumb strip from the document’s nested files, or the card `storagePath`.
- Empty / failed sign shows a file icon and Retry.
- Tap still uses the existing vault open path (`handleVaultCardPress`). Existing signed-URL helpers only (`getDocumentViewUrls`, `getVehicleDocumentViewUrl`, `signCompliancePreviewUrl`).

### 4. Compliance mobile chrome
- Below 768px: hub-style header, underline stage tabs, and search.
- Desktop toolbar, table toggle, and footer stay as they were.
- **Accepted gap for this release:** exclusive list/review panes (`mobileExclusive` / `mobileReviewing`) are not included. They require conflicted `app/compliance/index.tsx` and `ComplianceDocumentWorkspace.tsx`. Mobile still shows the queue and the open card together.

## Excluded
- Vault delete-audit migration `20271024194500` and its service edits.
- Assignment RPC migration `20271024195200`.
- Individual GST worker `f0062552`.
- Lane warehouse helper.
- Conflicted finance-checkout files (not copied).
- `VaultCategoryPreviewModal` / `TripDetailScreen` wholesale rewrite.

## Known residual
- **Driver roster-name RPC:** this release does not include `20271024195200`. The live `assign_aggregate_trip_driver` body can still UPDATE placeholder / tracking-only `drivers.name`. Client persist writes `trips.driver_display_name` without that migration.
- `ensureDriverRowByPhone` → `applyDriverNameToRow` still stamps `drivers.name` on the non-aggregate path.
- Compliance exclusive review/list pane is out of scope (see above).
- ESLint: `react-hooks/exhaustive-deps` warning on `cardsListHeader` (`renderQueueSubFilter` omitted; same pattern as the pre-existing memo). Non-blocking.
- Browser verification not run.

## Deploy preview
`pulse-gx` production CONTEXT stays on prod `nafxpivddesgsrthmosv`. `CONTEXT=deploy-preview` is forced to preprod `xbisiveavvbifbzyfhgy` (public anon only) in `netlify.toml` plus `scripts/netlifyDeployPreviewSupabase.cjs`, so dashboard prod `EXPO_PUBLIC_*` cannot leak into PR previews.

## Migrations
None.

## Tested
Focused Jest (10 suites / 39 tests). ESLint on changed files: parse clean; one pre-existing-style `exhaustive-deps` warning on the compliance header memo. `tsc --noEmit` reported no errors on the changed paths. Browser sign-off blocked (no authorized preprod session in this run).
