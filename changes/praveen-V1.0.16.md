# praveen V1.0.16

## What
- Needs trip creation respects dated hub pills (**This month**, custom, etc.) so awarded indents in that range still show (fixes IND002935). Default **All** pill keeps the today−7 needs_trip window (does not list every awarded indent).
- Indent search on Trip Ops auto-selects the matching stage tab (Pending / Bids received / Needs trip creation / Failed), highlights the best match, and shows **No matching indent found** when nothing matches.
- Live bids no longer show the generic **"Supplier"** label when `get_direct_quotes_with_bidder_names` falls back to the `direct_quotes` table: resolve missing bidder names via `org_display_name`.
- Trip Ops search for a Trip ID auto-selects the matching stage card (Unassigned / Assigned / Loading / In transit / Unloading / Delivered), highlights the trip, and leaves Live Indents when the hit is a trip — not an indent.
- Trip Ops search (2+ chars) no longer applies the hub date pill, so a Trip ID hit outside the selected date range still appears after stage auto-nav; desktop fleet cards expose `hub-item-*` for scroll-into-view.
- Indent Pool finder uses all unallocated workload indents (live + needs_trip), not live-only — awarded lanes such as Gowdavalli → Amaravati (IND002935) now appear in Drop options.
- Trip Report download is role-based: **Sales** keeps the Sales indent sheet (Indent ID + costs); **TripOps-only** downloads the classic ops Excel (TRIP ID / LR NO / CLIENT / stage times) with the same field mapping as Trips Export.

## Why
- Hub date pill already drove live indents, but needs_trip ignored it and always used today−7 — so awarded loads like IND002935 (pickup Oct 23) vanished from Needs trip creation on dated pills. Widening needs_trip on **All** would dump hundreds of old awards on the default view — keep All at today−7.
- Searching an indent required clicking each stage manually to find where it sat.
- Review Hub Live bids used `bidder_organization_name ?? "Supplier"`. The pressure fallback loads nameless table rows (RLS blocks `organizations`), so the real bidder org name never reached the card.
- Searching a Trip ID while Live Indents was selected showed “No trips match” because stage auto-nav only existed for indents.
- Date pill still filtered the list after stage switch, so older Trip ID hits could stay empty; fleet layout also lacked `nativeID` for scroll-to-highlight.
- Indent Pool passed only `liveIndents` into the lane finder, so awarded (needs_trip) pickups/drops never cascaded into Drop / Vehicle options.
- Sales Trip Report column changes overwrote the classic TripOps Excel (TRIP ID / LR NO / stage times) for every downloader on the same button.

## Areas
- `features/indents/utils/indentWorkload.util.ts`
- `features/indents/utils/__tests__/indentWorkload.util.test.ts`
- `features/indents/services/indentWorkload.service.ts`
- `features/indents/services/__tests__/indentWorkload.service.test.ts`
- `features/indents/hooks/useIndentWorkload.ts`
- `features/trips/utils/indentHubSearchStage.util.ts`
- `features/trips/utils/__tests__/indentHubSearchStage.util.test.ts`
- `features/trips/utils/tripHubSearchStage.util.ts`
- `features/trips/utils/__tests__/tripHubSearchStage.util.test.ts`
- `features/trips/screens/TripsScreen.tsx`
- `features/trips/components/TripsHubViews.tsx`
- `features/indents/services/direct-quotes.service.ts`
- `features/indents/utils/bidding/indentReviewHubOffers.util.ts`
- `features/indents/utils/bidding/__tests__/indentReviewHubOffers.util.test.ts`
- `features/trips/utils/tripIndentReport.model.ts`
- `features/trips/utils/tripIndentReportExport.util.ts`
- `features/trips/utils/tripOpsReport.model.ts`
- `features/trips/utils/tripOpsReportExport.util.ts`
- `features/trips/utils/__tests__/tripIndentReport.model.test.ts`
- `features/trips/utils/__tests__/tripIndentReportExport.util.test.ts`
- `features/trips/utils/__tests__/tripOpsReport.model.test.ts`

## Migrations
- None.

## Tested
- Jest: `indentWorkload.util.test.ts`, `indentWorkload.service.test.ts`, `indentHubSearchStage.util.test.ts`, `tripHubSearchStage.util.test.ts`, `indentReviewHubOffers.util.test.ts`, `tripIndentReport.model.test.ts`, `tripIndentReportExport.util.test.ts`, `tripOpsReport.model.test.ts`
- Preprod (`.env` → xbisiveavvbifbzyfhgy): confirmed table fallback rows lack `bidder_organization_name` while `org_display_name` returns the real org name (e.g. SMK LOGISTICS)
- not clicked through
