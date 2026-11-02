# praveen V1.0.15

## What
- Trip Operations Sales / Trip Report download: add **Indent ID** (keep Trip ID / Pulse ID); money columns stay **Client Cost** + **Supplier Cost** only — no Client Rate / Vendor Rate duplicates.
- Download pill icon uses `Theme.buttonPrimaryText` (same ink as + Add), not white `buttonDarkText`.
- Load trips via `get_trips_for_org` using the same hub date bounds (All time → `HUB_ALL_TIME_BOUNDS`) so the Excel matches the selected date / date range — all and only matching trips (deduped by id).
- Apply Asset / Aggregate sourcing scope to the export the same way as the hub list.
- Format Indent Created / Confirmed timestamps in Asia/Kolkata (aligned with hub date matching).
- Surface dated RPC / indent page caps as sheet Notes instead of silently truncating.
- Awarded indents no longer stay in Failed: clear leftover `cancel_reason` on open/broadcast/award (DB trigger + data repair + `updateIndent`); gate fail-reason metrics/tags on cancelled/expired only; merge workload into Failed candidates so a stale cancelled cache cannot overlap Needs trip creation.

## Why
- Report was missing Indent ID and commercial rate columns; export ignored the hub date filter and used an owner-only table scan that could omit or mis-include trips relative to what Trip Ops shows.
- After award, leftover `cancel_reason` from a prior cancel/reactivate made the same indent look Failed (tags + reason counters) and a stale Failed remote row could sit alongside the awarded workload copy.

## Areas
- `features/trips/utils/tripIndentReport.model.ts`
- `features/trips/services/tripIndentReport.service.ts`
- `features/trips/utils/tripIndentReportExport.util.ts`
- `features/trips/screens/TripsScreen.tsx`
- `features/trips/utils/__tests__/tripIndentReport.model.test.ts`
- `features/trips/utils/__tests__/tripIndentReportExport.util.test.ts`
- `features/indents/utils/indentCancelReason.util.ts`
- `features/indents/services/indents.service.ts`
- `features/trips/components/TripsHubIndentStageCard.tsx`
- `features/trips/services/trips.service.ts`
- `supabase/migrations/20271030110000_clear_cancel_reason_on_indent_reactivation_and_award.sql`

## Migrations
- `20271030110000_clear_cancel_reason_on_indent_reactivation_and_award.sql` — clear `cancel_reason` on active/awarded status; repair leftover reasons; gate `count_org_hub_metrics` fail-reason buckets on cancelled/expired.

## Tested
- Jest: `tripIndentReport.model.test.ts`, `tripIndentReportExport.util.test.ts`, `indentCancelReason.util.test.ts`, `indentHubToolbarFilter.test.ts`, `clearCancelReasonOnAward.migration.contract.test.ts`
- not clicked through
