# Pulse scalability — 100,000+ trips per organization per month

Baseline: `Vasanthgogox/Pulse-app` `V1.0.1` at `5bb0cfd3` (merge of PR #90).
Worktree: `vasanth/scalability-100k-20261105` at `.worktrees/scalability-100k`.
No commit, push, hosted query, or migration apply was done.
Findings below were read from that tree. Counts of call sites are from search, not from a production EXPLAIN.

This is not a claim that Pulse handles 100,000 trips a month. It is the inventory, the rule for the next fixes, and the first local correctness fix.

## 1. What is already exact

- `getOrgHubMetrics` / `getOrgTripCounts` call `count_org_hub_metrics`. The comment in `trips.service.ts` says these rail and profile counts must not come from a page length. Verified: the function does not use `.length` of a trip catalog.
- `HubTripCompleteness` (`exact` | `capped` | `loading` | `error`) already tells the trips hub when `get_trips_for_org` dated mode hits 2,000 rows (`GET_TRIPS_FOR_ORG_DATED_SAFETY_CAP`).
- `readAllPages` keyset-pages on `id` and returns an error with no rows if a page fails or the cursor does not advance. Used by party-trip counts, compliance documents, LR duplicate scan, and commerce ledger id collection.
- Ledger, trips, indents, and clients have offset `range()` helpers (`DEFAULT_PAGE_SIZE` 50, `FINITE_LIST_CAP` 500).

## 2. Inventory (verified)

Severity is the failure at 100,000 new trips in a month and millions of historical rows. P0 is wrong money or a silent incomplete set presented as complete. P1 is a hard ceiling that the UI may label. P2 is load or latency with a visible bound. P3 is bounded by design.

| Sev | Domain | File / function | Behavior | Failure | Remediation | Migration |
|---|---|---|---|---|---|---|
| P0 | Finance cash totals | `getOrgLedgerCashTotals` / `getAllTransactionsByOrganizationForTotals` | Headline calls `get_org_ledger_cash_totals` (period + supply in SQL). Missing function falls back to a keyset read of every row, then the same client filters | Until the migration is applied, memory still grows with the ledger. A failed installed function shows no total rather than a partial sum | Apply `20271105104500`. EXPLAIN the SUM. Do not drop the keyset fallback in that release | Written, not applied |
| P0 | Trips hub list | `get_trips_for_org` dated mode, cap 2,000; undated cap 400 | Hub rows and client-side rail from those rows. Owner-only `getOrgTripKeysetPage` exists and is not the hub list | A month of 100,000 trips, and all-time history, cannot fit. Completeness becomes `capped`. Replacing the hub with an owner-only keyset would drop trips where this org is only the supplier | Page `get_trips_for_org` itself. Do not lift 2,000. Do not swap the hub onto the owner-only page | RPC already capped in `20271027155318`. Raising the cap is not the fix |
| P0 | Invoices | `fetchInvoicingTrips` keyset page of 50 on `(created_at, id)` plus an exact owner count | The invoice trip list loads the next page from the list end. The first page still merges `get_trips_where_org_is_supplier` | Owner history is no longer cut at 3,000. Supplier-org trips on the first page are still an unbounded RPC result | Page the supplier-org RPC the same way. Do not treat the first page as the whole book | None. Existing `(organization_id)` index. Not EXPLAIN'd |
| P0 | Party badges | `getTripPartyCountsForOrg` | Calls `get_org_trip_party_counts` (three grouped counts). Missing function falls back to `readAllPages` of every live trip id | Until the migration is applied, Network still downloads every trip. The fallback is exact and heavy | Apply `20271105104500`. EXPLAIN the group-bys. Keep the fallback until the function is on every environment | Written, not applied |
| P1 | Indents | Finite catalog still `.limit(500)`. `truncated` is now `count > loaded`, from an exact head count. `useIndentsInfiniteQuery` and the trip/indent report walk `(created_at, id)` instead of offset | Screens on `useIndentsQuery` still see at most 500. The report still stops at 5,000 | Older indents stay off the finite catalog. The exact count makes that visible when the caller reads `truncated` | Move those screens onto the keyset query. Do not raise 500 | None |
| P1 | Trips callers without page opts | `getTripsByOrganization(orgId)` `.limit(200)` remains for other callers. Supplier and vehicle analytics no longer call it. Their detail list is `getOrgTripKeysetPage` (50 rows). Header counts stay on the rollup | The detail page is owner trips for that supplier id or vehicle id. Name-only matches and trips where this org is only the supplier are not on that page | A 50-row page is not the history. The header count is the rollup, which is own-org rows | Page the cross-org RPCs. Do not sum the page | None |
| P1 | Ledger list | `getTransactionsByOrganization` without opts `.limit(500)` | Display list. Totals were split out on purpose | List is not the ledger. `truncated` is now set at 500. Totals path is the P0 above | UI must not sum this list | None |
| P1 | Garage | When the rollup is present, the vehicle table is built without the parent trip array. Sales are `garage_sales`. Supplier cost added back is `spend_raw`. Trip count is the grouped count. The trip table still uses the parent list | Own-org trips only. A trip owned by the other org, where this org is the carrier, is not in this rollup, so that revenue is absent from the vehicle table while the rollup is on | Carrier-trip profit can disappear from the vehicle table. The trip table is still capped by whatever the parent loaded | Include carrier trips in the rollup with the same supplier-rate rule, or page them separately. Do not add them by downloading the supplier RPC | Written, not applied |
| P1 | Business pulse | Date-only, compare off, and `chart_version >= 2`: client, supplier, and route charts and the overview revenue, margin, and utilization come from `get_org_domain_rollups`. The full trip walk stays off. Drilldown rows are one keyset page of 50. Any other filter, a compare range, or an older rollup still calls `getAllTripsForOrg`. Aux fuel/toll/ledger reads stay capped at 4,000 / 2,000 | Fleet margin is vehicle-matched non-negative client price minus ownership and operational ledger sums, using the same source-type sets as `buildVehiclePnLRows`. Utilization is vehicles with a trip `vehicle_id` in the window over the vehicle master. That is the selector's ratio, not a sample | Drilldown rows are not the historical set. Non-date filters still download trips. Fuel and toll charts can still stop at 4,000 | Page drilldown rows with the same filters as the charts. Replace the aux caps with grouped sums | `20271105144500` replaces the rollup. Not applied. Not EXPLAIN'd |
| P1 | Receipts | `fetchCustomerReceipts` pages 50 on `(transaction_date, id)` and returns an exact count. The client filter is in SQL (`contact_id`, or `party_name` when there is no id). The receipt book loads further pages. Bank and TDS figures are the loaded pages, not a ledger sum. Invoice-applied rows are the newest 50 invoices on the first page | A client with more than 50 receipts is reachable. The money tiles are not an org total | Do not read the bank tile as the customer's lifetime receipts | Add a receipt SUM for the tiles. Page the invoice-applied rows | None. Not EXPLAIN'd |
| P1 | Debit control | `fetchDebitControlBoard` pages 50 completed trips on `(created_at, id)` and returns an exact count. The screen loads further pages. Order is `created_at`, not `pickup_date` | The queue no longer stops at 1,000. Lookups run for the loaded page only | A page can be entirely received, so pending looks empty until the next page | Keep the count visible. Do not sort this list by a nullable date without a null-safe cursor | None. Not EXPLAIN'd |
| P1 | Direct quotes | `direct-quotes.service` `.limit(FINITE_LIST_CAP)` | Quote list | Same 500 ceiling | Paged query | None |
| P2 | Drivers | matching and several `.limit(200)` reads | Search / matching | Incomplete match set | Server search | Maybe |
| P2 | Supplier bootstrap | `supplierPageBootstrap.service` `.limit(400)` | Page boot | Incomplete recent set | Page the panel that needs it | None |
| P2 | Commerce ledger | `fetchCommercePlanTripIds` / `fetchCommerceFulfillmentOrders` | `readAllPages` then chunked `IN` | Exact and heavy. Large `IN` lists | Filter in SQL (`indent_id` join), not in the client | Optional |
| P2 | Documents | `documents.service` / `tripComplianceRead.service` `readAllPages` | Full document set for a scope | Memory grows with document history | Page the queue; keep exact counts in SQL | None for paging |
| P2 | Deltas | `get_trips_delta` / `get_transactions_delta` `p_limit: 1000` | Sync window | A burst larger than 1,000 can stall until the next cursor if the caller does not loop | Confirm callers loop. Not re-read in this pass | None |
| P3 | Hub metrics RPC | `count_org_hub_metrics` | One aggregate round trip | Plan cost grows with table size. Not measured here | EXPLAIN on a large org before release. Partial indexes on `(organization_id, status)` where `deleted_at is null` if the plan is a seq scan | Only if EXPLAIN shows it |

Not line-audited in this pass: every Edge Function, OMS order list, analytics Vite app, realtime channel fan-out, and CSV/PDF exporters. Those stay open. `docs/PAGINATION_AND_CACHE_ANALYSIS.md` describes a pre-React-Query app and is not the current baseline.

## 3. Architecture decision

1. Business totals (trip counts, money, invoice outstanding) come from SQL aggregates or an existing RPC such as `count_org_hub_metrics`. A page length is a loaded count.
2. `DatasetCompleteness` is `exact` or `capped`. `capped` means the ceiling was hit. Callers must not present that length as a total.
3. Large mutable lists use keyset pagination on a unique ordered column (`id`, or `(created_at, id)`). Offset stays only for small bounded pages (`range` of 50).
4. A short page ends the read. A full page means more rows exist. Never stop at a fixed page count without a `truncated` or `hasMore` flag.
5. Parallel fetches go through `mapWithBoundedConcurrency`. Unbounded `Promise.all` over one id per request is not allowed for new code.
6. Do not raise `max_rows` or the 2,000 trip cap as the scalability fix.
7. Do not add partitioning or a materialized view until an EXPLAIN and a rollback are written. None of that is in this change.
8. A new aggregate ships with a fallback for a database that does not have the function yet (`PGRST202`). The fallback is the previous exact read. A present function that errors does not download the table. The migration is local and unapplied.

## 4. What this worktree changes

- `lib/scalability/datasetWindow.ts` — ceiling check and bounded concurrency. Tested.
- `getTripsByOrganization` without page options still returns at most 200 trips and now sets `truncated` when that ceiling is hit.
- `getTransactionsByOrganization` without page options still returns at most 500 rows and now sets `truncated` when that ceiling is hit.
- `getAllTransactionsByOrganizationForTotals` keyset-pages until a short page, then sorts back to date order. The previous test forbade `.limit()` and would still have stopped at `max_rows`. The test now requires 1,200 rows to come back. This path stays. It runs only when `get_org_ledger_cash_totals` is not installed.
- `supabase/migrations/20271105104500_org_scale_aggregates.sql` adds `get_org_ledger_cash_totals` and `get_org_trip_party_counts`. Both are `SECURITY INVOKER` and return nothing unless `is_org_member`. The cash function applies the period and asset/aggregate filter in SQL. The party function is three grouped counts. Neither returns trip or ledger ids. Not applied to any database.
- The Cash headline calls the cash function. Period bounds are computed in the client timezone with `ledgerPeriodBounds`, which follows `dayIsoMatchesPeriod`. `RANGE` and an incomplete custom range pass null dates and include every row. Supply `all` / `asset` / `aggregate` matches `getTripExecutionModel`, and a missing trip counts as aggregate. While the function is available the full ledger is not downloaded.
- Party badges call `get_org_trip_party_counts` and fall back to the keyset trip scan only when the function is missing.
- `supabase/migrations/20271105113000_org_domain_rollups.sql` adds `get_org_domain_rollups`, `get_org_open_assignments`, and `get_org_vehicle_ledger_groups`. All three are `SECURITY INVOKER` and return nothing unless `is_org_member`. Not applied.
- Date-only Business Pulse uses that rollup for the trip count, the monthly revenue series, and cash exposure. Other pulse filters stay on the client trip set.
- Garage trip count and sales use the same rollup with blank dates excluded. Ledger expense groups replace the 2,500-row download when the function exists. A full 2,500-row fallback is an error.
- Supplier and client total hooks use the rollup and download the full trip history only when the function is missing. Supplier and vehicle analytics headers show the rollup trip count. Their detail rows are one owner-org keyset page, not the newest 200 trips and not the cross-org RPCs.
- `supabase/migrations/20271105144500_org_chart_rollups.sql` replaces `get_org_domain_rollups` with chart version 2: per-party non-negative sums, fleet revenue and ledger split, vehicle counts, and one row per route. Same invoker and membership rules. Not applied.
- Date-only Business Pulse with that version does not call `getAllTripsForOrg`. Overview revenue, margin, and utilization, plus client, supplier, and route charts, use the rollup. Drilldown rows are a separate 50-row keyset page.
- Garage vehicle rows use the rollup for sales, supplier cost, and trip count when it is present, and do not need the parent trip array for those figures. The trip table still does.
- Invoice trips, customer receipts, and the debit POD board page on a `(timestamp, id)` cursor and return an exact count. Indent infinite pages and the trip/indent report walk use the same cursor. The finite indent catalog is still 500 rows, with `truncated` set from the exact count.
- Assignment conflict checks use the open-assignment function. Above 2,000 open trips, or a capped 200-row fallback, the check stops instead of treating a missing vehicle as free.

No screen copy changed. Screens that ignore `truncated` still look the same and can still be wrong. That is called out above, not fixed.

## 5. Remediation matrix

| Domain | Now | This pass | Still open | Release |
|---|---|---|---|---|
| Shared contract | Caps were easy to miss | `datasetWindow` + `truncated` on two unpaged list APIs | Wire the flag into each screen | Safe to review. Not safe to call the product scalable |
| Finance totals | Silent 1,000-row cut | Keyset read kept as fallback. Server SUM for period and supply when the function exists | Apply the migration. EXPLAIN on a large ledger. List pagination is still a separate 500 cap | Local only. Not applied. Not measured |
| Trips hub | 400 / 2,000 caps, server metrics for tiles | Owner keyset page exists and is used by analytics and pulse drilldown. The hub still uses `get_trips_for_org` | Page that RPC. An owner-only list would drop supplier-visible trips | Blocked on the RPC, not on the cursor helper |
| Business pulse | Full trip hydration plus 2,000–4,000 aux caps | Date-only charts and fleet margin inputs are SQL when chart version is 2. Full walk stays off in that case | Compare, non-date filters, drilldown beyond 50 rows, and the aux caps | Local only. Not applied. Not measured |
| Garage | 2,500 ledger rows and parent trip rows | Vehicle table sales, supplier cost, and trip count use the rollup and ignore parent trips | Trip table, carrier trips owned by the other org, and the missing-function path | Local only. Not applied. Not measured |
| Supplier, client, vehicle, assignment summaries | Newest 200 or a full trip download | Detail rows are a 50-row owner keyset page. Headers stay on the rollup | Cross-org trips and name-only supplier matches are not on the page | Local only. Not measured |
| Invoices, receipts, debit, indents | Hard limits | Keyset pages and exact counts. Indent finite catalog still returns 500 and now says when that is short | Supplier-org invoice trips, receipt money tiles, direct quotes, and the finite indent screens | Local only. Not measured |
| Party counts | Exact full scan | Grouped RPC with a full-scan fallback | Apply the migration. EXPLAIN the three group-bys. Fallback still downloads every trip id | Local only. Not applied. Not measured |

## 6. Tests

- `lib/scalability/__tests__/datasetWindow.test.ts` — ceiling and in-flight cap.
- `features/finance/services/__tests__/getAllTransactionsByOrganizationForTotals.test.ts` — 1,200 rows across pages, and a failed page returns no rows.
- `features/finance/services/__tests__/getOrgLedgerCashTotals.test.ts` — numeric payload, missing-function fallback, empty and denied responses are errors.
- `features/finance/lib/__tests__/filterLedgerByPeriod.test.ts` — period bounds match `dayIsoMatchesPeriod`.
- `features/finance/hooks/__tests__/useFinanceLedger.totals.test.ts` — headline uses the aggregate. A missing function does not sum the loaded page and does not enable the full ledger read.
- `features/trips/services/__tests__/tripPartyCounts.pagination.test.ts` — grouped payload does not select trips. A missing function returns an error and does not page trip ids.
- `lib/scalability/__tests__/orgScaleAggregates.contract.test.ts` — invoker, membership, grants, no trip-id select.
- `lib/scalability/__tests__/keyset.test.ts` — equal timestamps, no missing or duplicate ids across 10,000 rows.
- `lib/scalability/__tests__/domainRollups.test.ts` — direct-sum parity at 1,000, 10,000, and 100,000 trips, chart-row parity, and both SQL contracts.
- `features/trips/services/__tests__/orgDomainRollups.service.test.ts` — compact payload, missing function, failed function. A missing open-assignment function does not read trips.
- `lib/scalability/__tests__/hubVisibility.test.ts` — owner and carrier visibility, mover-asset exclusion, equal timestamps, a 10,000-row cursor walk, and the hub / receipt / carrier SQL contracts.
- No 1,000,000-row Postgres database was loaded. The 100,000 figure is an in-memory sum, not a query plan.
- No synthetic 1k / 10k / 100k / 1M database was loaded. No EXPLAIN, p95, CPU, or pool measurement. These tests prove the contract, not capacity.

## 7. Release sequence

1. Review this worktree. Do not merge it as a 100k certification.
2. Keep the finance totals paging if the unit test stays green. It restores the rule the comment already stated.
3. Next PR, still local until approved: stop supplier, vehicle, and assignment screens from calling unpaged `getTripsByOrganization`. Show `truncated` wherever a cap remains.
4. Invoice book, garage, business pulse, receipts, debit control: one domain per change, each with a test that a set larger than the old limit is either complete or visibly incomplete.
5. `20271105104500_org_scale_aggregates.sql`, `20271105113000_org_domain_rollups.sql`, and `20271105144500_org_chart_rollups.sql` are written and not applied. Apply them in that order. `20271105144500` replaces `get_org_domain_rollups`; the chart screens stay on the trip walk until `chart_version` is 2. Do not apply them to a hosted database until a named release set and an explicit apply.
6. `get_trips_for_org` stays capped. The hub list becomes a window. EXPLAIN `count_org_hub_metrics` on a large org before relying on it at 100k/month. That EXPLAIN was not run.

## 8. Executive summary

Fixed locally, not released: cash-tab transaction totals page past the PostgREST row cap, and the unpaged trip (200) and ledger (500) lists now report when they are capped. The Cash headline and party badges now call exact SQL aggregates when `20271105104500` is present, and keep the previous full reads when it is not.

Also local, not released: date-only Business Pulse charts (client, supplier, route, fleet margin inputs, utilization) skip the full trip walk when chart version 2 is installed. Drilldown rows are one 50-row page. Garage vehicle sales and supplier cost use the rollup. Supplier and vehicle detail lists are owner keyset pages. Invoice trips, receipts, and debit POD page on a cursor and return an exact count. Indent paging and the report walk use the same cursor. The 100,000-trip check is an in-memory sum. No query plan was captured.

Phase 2D is the current inventory. See section 9. The paragraphs above describe the tree before that pass.

## 9. Phase 2D — current inventory

Migrations added, not applied: `20271105161500_list_org_hub_trips_keyset.sql`, `20271105163000_receipt_totals_and_carrier_vehicles.sql`. Apply them after `20271105144500`. The hub function is `SECURITY DEFINER` because a carrier cannot read the shipper's trip under trips RLS. `is_org_member` still gates it. A non-member gets NULL. It is not granted to `anon`. Receipt totals are `SECURITY INVOKER`. Carrier vehicle totals are `SECURITY DEFINER` for the same RLS reason.

Rule 8 above is no longer the fallback for party counts, cash totals, open assignments, the hub, or invoice trips. A missing function is an explicit unavailable state. It does not download the historical table. An installed function that errors does not download it either.

| Path | Class |
|---|---|
| Trips hub list (`list_org_hub_trips_keyset`, owner or carrier, cursor `(created_at, id)`, bucket counts) | FIXED for the list and the tab counts. Supply and attribution filters still apply to loaded pages and stay partial while another page exists |
| Invoice first page (`get_trips_where_org_is_supplier` merge) | FIXED. One hub page, side `either`. A missing function is an error, not the unbounded RPC |
| Garage carrier vehicle totals | FIXED when `get_org_carrier_vehicle_totals` is installed. Missing function is an explicit note, not a downloaded history |
| Garage trip table | FIXED onto the hub keyset page. A missing function shows the parent list and says it is not the full book |
| Supplier and vehicle detail | FIXED onto the hub page, side `either`. Vehicle match is id or normalized number. Header count is `bucket_count`. The list says when it is showing fewer rows than that count. `trips` has no `supplier_name` column, so a trip with a null `supplier_id` cannot be matched by name |
| Customer receipt bank and TDS | FIXED. SQL sums, separate from the loaded page. A missing or failed function shows Unavailable |
| Cash headline | FIXED when `get_org_ledger_cash_totals` is installed. Missing or failed function shows Unavailable and does not scan the ledger |
| Party badge counts | FIXED when the function is installed. Missing function is an error and does not scan trips |
| Open assignments | FIXED when the function is installed. Missing function is an error and does not read the newest 200 trips |
| Business Pulse full trip walk | FIXED as in "not downloaded". Date-only chart version 2 still uses SQL. Other views say trip totals are unavailable instead of summing an empty or partial set. Aux fuel, toll, and ledger caps of 4,000 / 2,000 remain |
| Indent report | BOUNDED AND EXPLICIT. Above 5,000 trips or indents it keeps the first page, the exact count, and a note. It does not download the rest |
| Finite indent catalog (500) | BOUNDED AND EXPLICIT when the caller reads `truncated` and the exact count. Screens still on `useIndentsQuery` can ignore that flag |
| Direct quotes | BOUNDED AND EXPLICIT. Keyset walk stops at 500, with `total` and `truncated` on the returned array. Callers that only render the array can still look complete |
| Ledger list | BOUNDED AND EXPLICIT. Keyset pages of 50 on `(transaction_date, id)`, exact count on the first page, Load more on the cash list. The offset helper remains for older callers. Party, contact, and driver ledger reads still stop at 500 without a truncated flag |
| `getAllTripsForOrg`, `getTripsForOrg` 400/2,000, `getTripsByOrganization` 200 | STILL BLOCKING for any caller that still uses them. The hub, invoice list, pulse, supplier totals, and client totals no longer do |
| `getOrgIndentIdsWithTrip` | STILL BLOCKING. It still keyset-walks every owned trip id |
| Receipt invoice-applied rows | STILL BLOCKING. Newest 50 invoices on the first receipt page |
| Pulse aux caps | STILL BLOCKING |
| Debit POD order | BOUNDED AND EXPLICIT on `created_at`. A page can be all received |

`tsc --noEmit -p tsconfig.json` was run. The sandboxed run aborted with exit 134 and no diagnostics. A second run with a larger heap finished with exit 2 and 371 `error TS` lines. New RPC names are not in `database.types.ts`, so those calls fail the same way the earlier unapplied rollup calls do. That run is not a clean typecheck.

**NO-GO.** The hub page, the cross-org invoice page, the receipt sums, and the removed full-table fallbacks are local and unapplied. Supply and attribution filters are still client-side in this section. Section 10 is the later pass. Do not apply `20271105104500`, `20271105113000`, `20271105144500`, `20271105161500`, or `20271105163000` to a hosted database from this worktree. No commit, push, deployment, or hosted database change was made.

## 10. Phase 2E — remaining historical reads

`20271105161500` now takes `p_supply`, `p_attributed`, `p_client_id`, and `p_driver_id`. Those filters apply to the matched counts and to the page. `20271105171500_bounded_history_aggregates.sql` adds `indent_ids_with_owned_trip`, `get_org_contact_ledger_totals`, `get_org_invoice_applied_total`, and `get_org_pulse_aux_totals`. All four are `SECURITY INVOKER`, return NULL when the caller is not a member, and are not granted to `anon`. None of them were applied.

| Path | Class |
|---|---|
| `getOrgIndentIdsWithTrip` | FIXED as a bounded existence check. It sends at most 500 already-loaded indent ids to `indent_ids_with_owned_trip` and returns the distinct ids that have an owned live trip. It does not return trip ids. A missing or failed function is an error and does not scan trips. While that error is showing, the hub does not treat unknown indents as "needs trip" |
| Party, contact, and driver ledger rows | BOUNDED AND EXPLICIT. One page of 50 on `(transaction_date, id)`, exact `total` on the first page, `truncated` and `nextCursor`. The silent 500 cap is gone |
| Party ledger money | FIXED when `get_org_contact_ledger_totals` is installed. The client statement shows that sum. A missing or failed function shows Unavailable and does not add up the page |
| Client statement aging, lane performance, margin | BOUNDED AND EXPLICIT. One hub page for that client or supplier. If `bucket_count` is larger than the page, the screen says the total is unavailable. It does not sum the page |
| Receipt invoice-applied rows | FIXED for the total. `get_org_invoice_applied_total` is the exact `receipt_applied` sum for that client. The list no longer takes the newest 50 invoices in the org. It takes one page of that client's invoices with `receipt_applied` greater than 0. The page is not the total |
| Pulse fuel, toll, and maintenance | FIXED for the org figures when `get_org_pulse_aux_totals` is installed. Those sums are driver-unsettled fuel and toll, plus maintenance, inside the date window. The 4,000 and 2,000 row downloads are gone. Drilldown rows are loaded only for the 50 detail trips, and a 500-row ceiling on that page returns no rows rather than a partial exact metric. A missing function shows fleet payables as unavailable |
| Hub supply and attribution | FIXED on the server path. Asset, aggregated, and attributed filters are parameters of the hub page and of its counts. The loaded page is not filtered again while that path is on. The newest-400 fallback still filters in the client and stays partial |
| Attributed chip count | FIXED from `attributed_count` while the hub page is installed. The fallback counts loaded rows |
| Driver analytics | BOUNDED AND EXPLICIT. One hub page for `driver_id`. A larger book shows an unavailable error and does not call `getTripsForOrg` |
| Vehicle detail trips | BOUNDED AND EXPLICIT. One hub page for the vehicle id and normalized number, owner or carrier. A larger book shows an error. It no longer loads `getTripsByOrganization` or `getTripsWhereOrgIsSupplier` |
| Finance warmup | FIXED as "not downloaded". It prefetches the first ledger page only |

Exact versus page-derived money:

- Cash in/out, contact ledger in/out, receipt bank and TDS, invoice `receipt_applied`, and pulse fuel/toll/maintenance are SQL sums. They are not the sum of the loaded page.
- Client aging, lane performance, and margin are the page only when the page is the whole party set. Otherwise they are withheld.
- Hub tab counts and the attributed count come from the filtered SQL counts.

Client-side filters that remain:

- Hub payment and load-type filters still run on loaded rows. A later page can hold a row the current page's filter would have kept, so those two filters are still incomplete across pagination.
- The hub date pill is also applied again in the client. The server already received the same from/to bounds.
- The receipt list drops loaded rows outside the selected dates. Bank and TDS for that range are the SQL totals, not that filtered page.

Remaining historical reads, with the bound:

| Caller | Bound | Why it is still here |
|---|---|---|
| `useTripsQuery` → `getTripsForOrg` | Newest 400 | First paint and the shared finite cache. The hub list does not use it once the keyset page loads |
| `useComplianceTripCatalogQuery`, compliance export, compliance report | `getTripsForOrg` with the compliance-backlog flag, still the 400/2,000 catalog | The backlog flag is a different RPC mode. It was not replaced with a keyset |
| `useCompleteTripsQuery` → `getAllTripsForOrg` | Unbounded if a caller passes an org id | Current pulse and party-total hooks pass `null`, so the query does not run. The function still walks every owned trip if something calls it |
| `useTripsInfiniteQuery` → `getTripsByOrganization` | Offset pages | Older offset list. The hub does not use it |
| `useFleetOperationsQuery`, `DriverDetailScreen`, `ledgerEntryBootstrap.util` | `getTripsForOrg` newest 400 | Still the finite catalog, then a client filter |
| Add-trip fleet resources and form fields | `getTripsByOrganization` newest 200 | Recent assignment choices, not a history total |
| Ledger reconciliation | `getTripsByOrganization` with explicit page opts | Already paged |
| `syncTripsWithCache` `getFull` | `getTripsByOrganization` newest 200 | Cache rebuild, not a screen total |
| Direct quotes | Stop at 500 with `truncated` | Unchanged from section 9 |
| Finite indent catalog | 500 with `truncated` | Unchanged |
| Indent report | Stops after the first page above 5,000 and shows the count | Unchanged |
| Pulse drilldown aux rows | 500 rows for the 50 detail trips, discarded if the ceiling is hit | Org metrics do not use these rows |

`lib/database.types.ts` now includes the phase 2A–2E RPC signatures. Types were edited locally. `supabase gen types` was not run against a hosted project.

`tsc --noEmit -p tsconfig.json` finished with exit 2 and 361 `error TS` lines. The phase 2D run on this same tree was 371. The drop is the RPC names that are now in `database.types.ts`. The run is not a clean typecheck. The remaining errors include the pre-existing `string | null` versus `string | undefined` calls, `RejectExcessProperties` insert payloads, and the Business Pulse `maintenanceRows` `SelectQueryError` assignment. Two later casts, the statement total narrowing and the receipt retry assignment, were applied after that count.

Tests run and passing: `phase2e.test.ts` (supply-filter parity with `getTripExecutionModel`, a 120-row filtered keyset with no duplicates or omissions, SQL contracts), `getOrgIndentIdsWithTrip.test.ts` (bounded RPC, missing function does not scan, 501 ids refused), `useDriverAnalyticsData.dedup.test.tsx`, `customerReceiptList.service.test.ts`, plus the existing hub visibility, hub completeness, and cash-total suites. No Postgres database was loaded. No EXPLAIN.

**NO-GO.** Payment and load-type filters are still client-side. Compliance, fleet operations, driver detail, ledger bootstrap, and the trip sync full read still use the capped trip catalog. The new functions are not on any database. This is not a capacity result. Do not apply `20271105104500`, `20271105113000`, `20271105144500`, `20271105161500`, `20271105163000`, or `20271105171500`. No commit, push, deployment, or hosted database change was made.

## 11. Phase 2F — legacy catalog, hub filters, typecheck

Work stays in `.worktrees/scalability-100k` on `vasanth/scalability-100k-20261105`. HEAD is still `5bb0cfd3`. Nothing was committed, pushed, merged, or deployed. No hosted Supabase query. No migration was applied. `20271105161500_list_org_hub_trips_keyset.sql` was edited in place while it was still unapplied. `20271105180000_busy_fleet_ids.sql` is new and unapplied.

### Remaining historical-read inventory

| Caller | Class | Behavior |
|---|---|---|
| Trips hub list | FIXED | Payment, load type, supply, attribution, client, and driver filters are SQL predicates on `list_org_hub_trips_keyset`. Tab counts use those same predicates. The client does not filter them again while the keyset list is showing |
| `useTripsQuery` | BOUNDED AND EXPLICIT | First hub page of 50, cached as `trips.preview`. It is not the book and it no longer writes `trips.finite` |
| Fleet operations | BOUNDED AND EXPLICIT | `loadCompleteHubPage` with bucket `active`. More than one page is an error, not a short fleet |
| Driver detail | BOUNDED AND EXPLICIT | One hub page for that driver. A larger book is an error |
| Ledger bootstrap owned trips | BOUNDED AND EXPLICIT | `loadCompleteHubPage`. A larger book throws. A cached finite list is still reused when present |
| Ledger bootstrap client-linked trips | BOUNDED AND EXPLICIT | `get_trips_where_org_is_client`. 1,000 or more rows throw instead of being treated as the whole set |
| Finance client-linked trips | BOUNDED AND EXPLICIT | Same 1,000-row refusal |
| Compliance catalog, export, and report | BOUNDED AND EXPLICIT | Hub page with `p_compliance`. A backlog larger than one page throws, so chip counts are not a page length |
| `useCompleteTripsQuery` | BOUNDED AND EXPLICIT | No longer calls `getAllTripsForOrg`. A book larger than one page is a query error |
| `useTripsInfiniteQuery` | FIXED | Keyset on the hub. No remaining caller in the app |
| Add-trip and assignment busy ids | FIXED | `get_org_busy_fleet_ids` returns driver and vehicle ids, not trip rows. Missing function does not download trips. Assignment treats unknown as busy |
| Trip sync `getFull` | BOUNDED AND EXPLICIT | `loadCompleteHubPage`. A 200-row list cannot replace the cache |
| Ledger reconciliation | BOUNDED AND EXPLICIT | One trip uses its id. An org worklist is the active hub page, and a larger active book throws |
| Direct quotes | BOUNDED AND EXPLICIT | One page of 50, with `total`, `truncated`, and `nextCursor`. The walk to 500 is gone |
| Indent catalog | BOUNDED AND EXPLICIT | The unpaged path is one keyset page of 50. `truncated` is set from the exact count. Sync still refuses a truncated page as a cursor baseline. `useIndentsQuery` returns an error when the count is larger than the page |
| Indent report | BOUNDED AND EXPLICIT | One hub page and one indent page. The note includes the exact count. The 5,000-row download is gone. The sheet is not the full book when `truncated` is set |
| Pulse drilldown aux rows | BOUNDED AND EXPLICIT | Fuel, toll, ledger, and maintenance for the selected trip ids are paged by id, 200 at a time, up to 25 pages. Rows are kept. Org fuel, toll, and maintenance totals stay on `get_org_pulse_aux_totals` |
| Supplier page fallback | FIXED | A missing `get_supplier_page_bootstrap` no longer downloads trips. The screen gets an error |
| Log POD trip list | BOUNDED AND EXPLICIT | One hub page. A larger book is an error. The 3,000-row owner scan and the partner RPCs are gone |
| `getTripsForOrg`, `getAllTripsForOrg`, `getTripsByOrganization` | BOUNDED AND EXPLICIT | Still in `trips.service.ts` with the old 400 / 2,000 / 200 caps. No production screen calls them after this pass. They were not deleted |
| Trip detail supplier fallback | STILL BLOCKING | `useTripDetail` still calls `getTripsWhereOrgIsSupplier` to find one trip the owner read missed |
| `get_trips_where_org_is_client` and `get_trips_where_org_is_supplier` | STILL BLOCKING | The SQL functions still return the full set. PostgREST will stop near its max rows. Callers that remain either throw at 1,000 or, in trip detail, still download the supplier set |
| Analytics screens on `useCompleteTripsQuery(orgId)` | STILL BLOCKING | Milestone, finance pro, fleet rankings, network desktop panels, and the customers tab default a failed query to `[]`. For an organization with more than one hub page that displays as zero trips unless the screen reads `isError`. Finance entities already expose `tripsError` |

### Caps

| Cap | Behavior |
|---|---|
| Hub page 50 | Next page is a `(created_at, id)` cursor. Counts ignore the cursor |
| Busy fleet ids | No row cap. The result is distinct ids on open owned trips |
| Direct quotes | 50, exact count, `truncated` when the count is larger |
| Indents | 50 on the finite path, exact count, `truncated`. Offset `range()` remains only when a caller passes offset opts |
| Indent and trip report | 200 rows on the sheet, exact count in the note |
| Compliance, fleet ops, ledger owned trips, sync, log PODs | One page of 50. A larger match is an error |
| Pulse aux detail | 200 per page, 25 pages, for the selected trip ids only. `truncated` is kept with the rows |
| Client-linked RPC | Throw at 1,000 rows |
| `get_org_open_assignments` | Unchanged. Rows only when the open count is at most 2,000 |

### Exact versus page-derived totals

Hub tab counts and the attributed count come from the filtered SQL counts, including payment and load type. They do not change as more pages load. Cash, contact ledger, receipt bank and TDS, invoice applied, and pulse fuel, toll, and maintenance totals stay SQL sums. Pulse detail rows are not those totals. A report or quote list with `truncated` set is not a complete export.

### Filter completeness

On the keyset hub, payment uses the owner finance mask. A carrier row has null `payment_status` and matches `pending`, which is what the screen already displayed. `paid` includes `fully_paid`. Load type is case-insensitive. Supply and attribution stay in SQL. The client filters for payment, load type, supply, attribution, and the date pill run only on the newest-page fallback, when the keyset list is not showing. An in-memory walk of 10,000 rows checked that the paid plus FTL predicate, the page count, and the cursor pages are the same set, with no duplicate or missing ids, and that a carrier `paid` row is not counted as paid.

### Typecheck

`tsc --noEmit -p tsconfig.json` exit 2. Phase 2D on this tree was 371 `error TS` lines. Phase 2E was 361. After 2F the count is 360. The Business Pulse `maintenanceRows` `SelectQueryError` assignment is gone. Fuel, toll, ledger, and maintenance rows are parsed into the pulse row types. The other errors are the previous baseline: `string | null` versus `string | undefined`, insert payload excess-property checks, and RPC names that are not in `database.types.ts` (`claim_trip_creator`, `get_trip_driver_online_state`, `manual_advance_trip`, and others). Those were not mass-cast. `database.types.ts` gained `p_payment`, `p_load_type`, `p_compliance`, and `get_org_busy_fleet_ids` by hand. `supabase gen types` was not run.

### Tests

Passing, in memory, no database: `phase2f.test.ts` (10,000-row payment and load-type parity, SQL contract for both hub scans, busy-fleet function is invoker and returns ids), `phase2e.test.ts`, `getOrgIndentIdsWithTrip.test.ts`, `useDriverAnalyticsData.dedup.test.tsx`, `customerReceiptList.service.test.ts`, `useFleetOperationsQuery.dedup.test.tsx`, `ledgerEntryBootstrap.util.test.ts`. No EXPLAIN. Owner and carrier visibility is the existing hub function, unchanged apart from the new predicates. Tenant isolation is `is_org_member` on the new busy-fleet function and the existing hub gate.

**NO-GO.** The hub filters and the silent 400 / 2,000 / 3,000 / 5,000 catalogs called out for this phase are no longer presented as a complete book. A full trip history is still not available to the screens that used to download it: they error, or they show one explicit page. Trip detail still downloads the supplier-trip RPC. Analytics screens can still render an empty list when that query errors. None of `20271105104500`, `20271105113000`, `20271105144500`, `20271105161500`, `20271105163000`, `20271105171500`, or `20271105180000` is applied. This is not a 100,000-trip capacity result. No commit, push, deployment, or hosted database change was made.

## 12. Phase 2G — Cross-org trip access and complete-data integrity

### Supplier and client retrieval

`get_supplier_trip_for_org(p_org_id, p_trip_id)` returns one jsonb row. It requires `is_org_member`, a non-deleted indent trip, and either a supplier linked to this org or an accepted direct quote awarded to this org. The payload is the supplier-safe columns (route, status, driver, vehicle, display ids). It does not select `trips.*` and does not include shipper cost columns. Trip detail calls `getSupplierTripForOrg(orgId, tripId)`. There is no supplier-history list, because no remaining list screen needs the old full download.

`list_client_org_trips_keyset` returns `{ total, rows }` for trips whose client is linked to this org. The page size is clamped to 1..200. The cursor is `(created_at, id)`. Rows include `client_price` and the route fields the finance picker reads. They omit `supplier_rate`, margin, and driver commission. `getClientOrgTripPage` is the client. Finance uses that page only when `total` equals the page length. A larger client book sets `tripsError` and does not render the page as the whole book. Ledger bootstrap throws when the page is truncated, with the total in the message, instead of the old 1,000-row failure. That form still has no next-page control, so a client book bigger than one page cannot be picked. That is still blocking.

Both functions are security definer, granted to `authenticated` and `service_role`, and revoked from `PUBLIC`. The migration is `20271105183000_cross_org_trip_pages.sql`. It is not applied.

### Complete-query error state

`useCompleteTripsQuery` returns `OrgTripHistory`: `empty` (successful zero), `complete` (the one hub page is the whole book), or `unavailable` (the book is larger than the page, with the count). A failed read throws, so React Query `isError` is set and `data` stays unset. `readyOrgTrips` returns `trips: null` for loading, error, and unavailable. `trips: []` is only the successful empty organization.

Milestone, fleet rankings, the network sales panels, the customers tab, Finance Pro, and the finance entity list use that view. They show an unavailable message instead of a zero chart. Milestone uses `useOrgTripCountsQuery`. If that count fails, the screen says the trip count is unavailable and does not draw the level map from zero. A successful empty organization still takes the empty path.

Business Pulse no longer calls the complete-trip hook. Date-only charts use the domain rollup. Other filters say the totals are unavailable. Party total hooks return rollup figures, or `null` when the rollup is not ready. They do not summarize an empty trip array.

### Deprecated helpers

`getTripsForOrg`, `getAllTripsForOrg`, `getTripsByOrganization`, `getTripsWhereOrgIsClient`, and `getTripsWhereOrgIsSupplier` throw and name the replacement. `phase2g.test.ts` asserts that, and asserts the service file does not call the two old partner RPCs. The old SQL functions remain in earlier migrations and in `database.types.ts`. Nothing in the app calls them. They are not dropped here, because that would be a migration applied to a shared database.

### Remaining full-history reads

| Call site | Class |
|---|---|
| Trip detail supplier lookup | FIXED — one trip |
| Client finance / ledger book | BOUNDED — one page, or unavailable / throw. Not a paged picker |
| Rankings, network, customers, Finance Pro, finance entities | EXACT page or unavailable. Not a silent `[]` |
| Milestone trip count | EXACT AGGREGATE |
| Party totals and date-only Pulse charts | EXACT AGGREGATE |
| Fleet ops, compliance catalog, ledger owned trips, sync, log PODs, reconciliation worklist | STILL BLOCKING — `loadCompleteHubPage` errors when the book does not fit one page |
| `get_org_open_assignments` | STILL BLOCKING — row cap remains |

### Tests

`phase2g.test.ts`: 4 passed. Covers empty versus unavailable, a 100,000-row in-memory client keyset for one owner, the retired helpers throwing, and the SQL contract (one trip by id, no `SELECT t.*`, no `t.supplier_rate`, client keyset, `is_org_member`). The first run failed because the function arguments are on separate lines; the pattern now allows that. `phase2f.test.ts` and `ledgerEntryBootstrap.util.test.ts` passed in the same run. No database, no EXPLAIN.

### Typecheck

Phase 2F baseline: 360 `error TS` lines in `/tmp/pulse-tsc-2f2.txt`. After this phase: 359 in `/tmp/pulse-tsc-2g2.txt`, exit 2. The new diagnostics are the same missing-RPC errors (`claim_trip_creator`, `get_trip_driver_online_state`, `manual_advance_trip`, `log_activity`, and the others). Their union text is longer because `get_supplier_trip_for_org` and `list_client_org_trips_keyset` were added to `database.types.ts` by hand. No new error remains in the phase 2G call sites. `supabase gen types` was not run. No mass cast.

### Decision

**NO-GO.** Supplier detail is one trip, and a failed history read is not an empty organization. The new SQL is not applied. A client book, a compliance book, or a fleet book larger than one page still cannot be walked. This is not a 100,000-trip capacity result. No commit, push, deployment, or hosted database change was made. Unapplied with the earlier scalability files: `20271105104500`, `20271105113000`, `20271105144500`, `20271105161500`, `20271105163000`, `20271105171500`, `20271105180000`, `20271105183000`.

## 13. Phase 2H — Operational workflow completeness

### Workflows

Fleet operations reads the active hub keyset. Coverage is `loading`, `partial`, `complete`, or `unavailable`. The screen shows the exact active count and loads the next page on request. The stage mix is drawn only when coverage is `complete`. A finished walk whose scanned row count does not equal `bucketCount`, a missing count, or a failed page is `unavailable`: the trip list is cleared and the screen says this is not an empty fleet.

Compliance catalog is the same keyset with `compliance: true`. The All chip uses `bucketCount`. While a next cursor remains, the other stage chips are labeled as the loaded page and the banner states the backlog total. The compliance report and the verified export walk every page, check that the number of trips seen matches the server count, and fail the export if a page is short or repeated. They do not call `loadCompleteHubPage`.

Ledger entry no longer reads `trips.finite` as the owned book. The first owned hub page and the first client page are loaded, with totals and cursors. The ledger form has load-more while the loaded list is shorter than the sum of those totals. A later page is appended by id, so a cursor overlap does not duplicate a trip. Trip financial previews are withheld while either next cursor is set. A trip-locked form still previews that one trip.

Log Incoming PODs returns one hub page plus the total and the next cursor. A larger book is not an error and not an empty list. The screen and the modal load the next page. Sync stores that page as truncated, so the cache cursor is not placed ahead of trips that were not returned. Marking a POD still uses the selected trip ids.

Reconciliation walks every active hub page, keeps asset trips, and reconciles them in batches of 50. The old 30-trip slice is gone. A walk that does not match `bucketCount`, or that repeats an id, throws. The screen does not show a partial exception list as the fleet.

`loadCompleteHubPage` remains defined and still throws when the page is not the whole book. Nothing in the app calls it.

### Contracts

| Workflow | Contract |
|---|---|
| Fleet | `list_org_hub_trips_keyset` bucket `active`, page 50, `activeCount` independent of the cursor |
| Compliance list | Same RPC, `p_compliance true`, page 50, `bucketCount` is the backlog |
| Compliance export | `walkHubTripPages` until `seen = bucketCount` |
| Ledger | Owned hub page and client keyset page, cursors returned to the form |
| Log PODs | Hub page 50, `truncated` when `bucketCount` is larger |
| Trip sync | First hub page with `truncated: true` when the book is larger. No cursor is stored |
| Reconciliation | Active hub walk, then `reconcileVehicleLedgerStatesBatch` of 50 |
| Open assignments | `get_org_open_assignments` replaced by one label per busy driver and one per busy vehicle. `truncated` is false. `open_count` stays exact |

`walkHubTripPages` discards each page after the visitor returns. A missing count, a repeated id, or `seen !== bucketCount` is an error.

### Assignment completeness

Conflict labels are one per busy driver and one per busy vehicle, ordered by newest open trip. The payload is the size of the fleet. A response with `truncated: true`, a missing function, or a failed request clears the busy sets and sets the index not ready. Driver and vehicle saves then stop, so an empty label map is not treated as free capacity. `get_org_busy_fleet_ids` is unchanged and remains the id set used by add-trip availability.

### Files

Migration, unapplied: `supabase/migrations/20271105191500_open_assignment_labels.sql`.

Operational code: `features/trips/services/trips.service.ts` (`walkHubTripPages`, truncated trip sync), `lib/queries/useFleetOperationsQuery.ts`, `features/trips/screens/FleetOperationsDashboardScreen.tsx`, `lib/queries/useTripsQuery.ts`, `features/tripCompliance/hooks/useComplianceTripsQuery.ts`, `app/compliance/index.tsx`, `features/tripCompliance/services/tripComplianceReport.service.ts`, `features/tripCompliance/services/complianceExportReport.service.ts`, `features/finance/utils/ledgerEntryBootstrap.util.ts`, `features/finance/screens/LedgerSyncScreen.tsx`, `components/AddTransactionModal.tsx`, `features/log-pods/services/logPods.service.ts`, `lib/queries/useLogIncomingPodsQueries.ts`, `features/log-pods/LogIncomingPodsScreen.tsx`, `features/log-pods/components/LogIncomingPodsModal.tsx`, `features/ledger/reconciliation/useLedgerReconciliation.ts`, `features/trips/components/TripAssignmentBlock.tsx`.

Tests: `lib/scalability/__tests__/phase2h.test.ts`, `lib/scalability/__tests__/phase2h.walk.test.ts`, `lib/queries/__tests__/useFleetOperationsQuery.dedup.test.tsx`, `features/finance/utils/__tests__/ledgerEntryBootstrap.util.test.ts`. `features/trips/services/__tests__/orgDomainRollups.service.test.ts` was not edited; it still requires a truncated assignment payload to fail closed.

### Partial data

- Fleet coverage `partial` means later active pages exist. Stage mix is hidden. Coverage `unavailable` clears the displayed trips.
- Compliance All count is `bucketCount`. Other stage chips are the loaded page until the catalog is complete.
- Ledger financial previews are empty while an owned or client cursor remains.
- Log POD sync of a book larger than one page stores no cursor. Marking a POD still uses the selected ids.
- Reconciliation throws when the active walk is short, repeated, or failed. The query then has no result set. The in-memory asset id list is held only for that walk.
- A 100,000-row owner filter in the page-boundary test runs in memory through `readKeysetPages`. It does not execute `list_org_hub_trips_keyset` and is not a PostgreSQL capacity result.

### Remaining unbounded or capped paths

- `get_trips_delta` still requests 1,000 changed rows. A larger change burst is not paged inside one sync.
- Trip sync of a large book returns one truncated hub page. It does not walk the book into the cache.
- The compliance workbook still accumulates summary rows for the export.
- Reconciliation still holds the active asset id list until the batches finish.
- The previous `get_org_open_assignments` body, including the 2,000-row cap, remains in `20271105113000`. `20271105191500` replaces it and is not applied. Until it is applied, a book over 2,000 still returns `truncated` and the client refuses to treat that as free capacity.
- `loadCompleteHubPage` is still defined and still throws when the page is not the whole book. No caller remains.
- No query plan was captured. No new index was added.

### Tests and typecheck

Targeted, in memory only:

| Suite | Result |
|---|---|
| `lib/scalability/__tests__/phase2h.test.ts` | 5 passed. SQL contract, no one-page loader, 100,000-row owner filter, POD id merge, short page is not the book |
| `lib/scalability/__tests__/phase2h.walk.test.ts` | 5 passed. Full walk, repeated id, short book, missing function, failed function |
| `lib/queries/__tests__/useFleetOperationsQuery.dedup.test.tsx` | 3 passed. Empty fleet is complete, two pages become complete with ids `t1` and `t2`, missing count is unavailable with no trips. Query cache cleared on unmount |
| `features/finance/utils/__tests__/ledgerEntryBootstrap.util.test.ts` | 6 passed |
| `features/trips/services/__tests__/orgDomainRollups.service.test.ts` | 5 passed |

The five suites together: 24 passed, 0 failed. Broader `phase2g.test.ts` and `phase2f.test.ts`: 6 passed, 0 failed. `useComplianceTripsQuery.pipeline.test.tsx` failed to load: `Cannot find native module 'ExpoDocumentPicker'` through `ComplianceTripActivityLog` → `finance.service` → `avatarUpload`. Zero cases ran. That import chain was not changed to make the suite pass.

Typecheck baseline after phase 2G: 359 `error TS` lines in `/tmp/pulse-tsc-2g2.txt`, exit 2. After the first 2H pass: 359 in `/tmp/pulse-tsc-2h.txt`. After this completion pass: 359 in `/tmp/pulse-tsc-2h2.txt`, exit 2. Unique diagnostic text, after collapsing RPC names, is unchanged (165). No new diagnostic. No mass cast. `supabase gen types` was not run.

### Decision

**NO-GO.** These workflows no longer treat one hub page as the book, and incomplete, failed, or truncated results are not presented as complete. The assignment function is not applied, so production still has the 2,000-row body. At the end of this phase the trip delta still requested 1,000 rows. Stage chips other than All are exact only after every compliance page is loaded. Export and reconciliation still hold bounded working sets. None of this certifies PostgreSQL at 100,000 trips per month. No commit, push, deployment, or hosted database change was made. Unapplied with the earlier files: `20271105104500`, `20271105113000`, `20271105144500`, `20271105161500`, `20271105163000`, `20271105171500`, `20271105180000`, `20271105183000`, `20271105191500`.

## 14. Phase 2I — Sync completeness and memory-bounded processing

### Sync protocol

`get_trips_delta` keeps the arguments `(uuid, text, int)`. One call returns at most 200 rows, ordered by `(updated_at, id)`. The cursor is a timestamp, or `timestamp|uuid` when a tie-break is known. `has_more` is false only when that page is the end of the change set. A non-member receives NULL. An invalid cursor raises. The client walks pages inside one sync. A missing `has_more`, a repeated id, a cursor that does not advance, or a failed page returns an error and an empty delta. The stored cursor stays at the start of that walk, so the retry reads the same pages again. Merge is by id.

A full trip sync walks the hub book. It stores a cursor only when the walk matches `bucketCount`. That cursor is the greatest `(updated_at, id)` in the book. A truncated full fetch still stores no cursor. `syncTripsWithCache` returns `complete` only after that success. A failure keeps the previous rows and returns `stale` when those rows exist, otherwise `failed`. It does not report success for a partial book.

The delta remains owner-org trips (`organization_id = p_org_id`) plus the existing ground-ops warehouse scope. Carrier trips stay on the hub full sync, not on this delta.

### Memory bounds

| Path | Bound |
|---|---|
| Trip delta request | 200 rows |
| Trip full-sync page | 50 hub rows, released after they are appended to the cache |
| Compliance report and verified export | 50 hub trips in flight. Trip and summary objects are dropped after the page becomes export rows. A short or failed walk throws before a file is written |
| Reconciliation | 50 trips per batch, reconciled inside the page walk. A failed trip throws, so the query has no result set |

The local trip cache and the finished workbook still hold the completed output. They do not also hold every earlier trip page.

### Files

Migration, unapplied: `supabase/migrations/20271105201000_trip_delta_keyset.sql`.

Code: `lib/scalability/tripDelta.ts`, `features/trips/services/trips.service.ts`, `lib/cache/domainSync.ts` (an explicit complete-book cursor is stored; a truncated fetch still clears it), `features/tripCompliance/services/tripComplianceReport.service.ts`, `features/tripCompliance/services/complianceExportReport.service.ts`, `features/ledger/reconciliation/useLedgerReconciliation.ts`, `features/tripCompliance/hooks/useComplianceTripsQuery.ts` (catalog pages are memoized), `jest.config.js`, `__mocks__/expo-document-picker.js`.

Tests: `lib/scalability/__tests__/phase2i.test.ts`, `features/tripCompliance/__tests__/useComplianceTripsQuery.pipeline.test.tsx`.

### Tests

In memory only. Not a PostgreSQL capacity result.

| Suite | Result |
|---|---|
| `phase2i.test.ts` | 11 passed. 1,200-row delta, same-timestamp boundary, failed page leaves the cursor, resume and retry do not duplicate, other org excluded, complete cursor stored, truncated cursor cleared, SQL and source contracts |
| `domainSync.test.ts` | 11 passed, 0 failed. A truncated fetch still stores no cursor |
| `phase2h.test.ts` | 5 passed, 0 failed, after the export and reconciliation edits |
| `useComplianceTripsQuery.pipeline.test.tsx` | 13 passed, 0 failed. The previous `ExpoDocumentPicker` load failure is gone. The native module is mapped to `__mocks__/expo-document-picker.js`. Production imports were not changed. New cases: a page with `bucketCount` 100 and a next cursor is not complete, and a failed catalog is not an empty complete backlog |

`phase2i.test.ts` and the pipeline suite together: 24 passed, 0 failed.

### Typecheck

Baseline after phase 2H: 359 `error TS` lines, exit 2 (`/tmp/pulse-tsc-2h2.txt`). After this phase: 359 in `/tmp/pulse-tsc-2i.txt`, exit 2. Unique diagnostic text, after collapsing RPC names, is unchanged (165). No new diagnostic. No mass cast. `supabase gen types` was not run.

### Remaining blockers

- `20271105201000` is not applied. Until it is, `get_trips_delta` has no `has_more`, and the client refuses that payload instead of treating 1,000 rows as the whole change set. The hub full sync is also still unapplied, so a large-book sync fails rather than pretending to finish.
- The finished trip cache and the finished workbook still hold the completed rows.
- Delta does not include carrier-org trips. Those remain on the hub full sync.
- No `EXPLAIN`. No hosted apply.
- Earlier scalability migrations remain unapplied: `20271105104500`, `20271105113000`, `20271105144500`, `20271105161500`, `20271105163000`, `20271105171500`, `20271105180000`, `20271105183000`, `20271105191500`, `20271105201000`.

### Decision

**NO-GO.** The 1,000-row delta request is gone from this branch, and a failed or partial sync, export, or reconciliation is not reported as complete. The functions are not on a database, and the in-memory fixtures do not certify PostgreSQL at 100,000 trips per month. No commit, push, deployment, or hosted database change was made.

## 15. Phase 2J — Release readiness and PostgreSQL capacity gate

Read-only audit of the worktree at `5bb0cfd3` plus the uncommitted Phase 2A–2I files. No migration was applied. No hosted database was queried. No `EXPLAIN` output exists. Nothing below is a measured query plan or a capacity result.

Sections 7 and 8 describe earlier passes. This section is the release gate.

### Migration inventory and release order

Apply only as one controlled batch, in this order. Each file uses a non-midnight timestamp. None is in `FROZEN.versions`. There is no release-set file for this batch. `CREATE OR REPLACE` keeps the earlier file in history, and the later body is the one that remains.

| Order | File | What it installs | Superseded by |
|---|---|---|---|
| 1 | `20271105104500_org_scale_aggregates.sql` | `get_org_ledger_cash_totals(uuid, date, date, text)`, `get_org_trip_party_counts(uuid)`. INVOKER | Nothing later |
| 2 | `20271105113000_org_domain_rollups.sql` | `get_org_domain_rollups`, `get_org_open_assignments`, `get_org_vehicle_ledger_groups`. INVOKER | Rollup body by step 3. Assignment body by step 9. Vehicle groups stay |
| 3 | `20271105144500_org_chart_rollups.sql` | Replaces `get_org_domain_rollups` with `chart_version` 2. Same signature. INVOKER | Final rollup |
| 4 | `20271105161500_list_org_hub_trips_keyset.sql` | `list_org_hub_trips_keyset` (19 args, including payment, load type, compliance). DEFINER. Limit clamped to 1..100 | Final hub |
| 5 | `20271105163000_receipt_totals_and_carrier_vehicles.sql` | `get_org_customer_receipt_totals` INVOKER. `get_org_carrier_vehicle_totals` DEFINER | Final |
| 6 | `20271105171500_bounded_history_aggregates.sql` | `indent_ids_with_owned_trip`, `get_org_contact_ledger_totals`, `get_org_invoice_applied_total`, `get_org_pulse_aux_totals`. INVOKER | Final |
| 7 | `20271105180000_busy_fleet_ids.sql` | `get_org_busy_fleet_ids(uuid, uuid)`. INVOKER | Final |
| 8 | `20271105183000_cross_org_trip_pages.sql` | `get_supplier_trip_for_org(uuid, uuid)`, `list_client_org_trips_keyset`. DEFINER. Client page clamped to 1..200 | Final |
| 9 | `20271105191500_open_assignment_labels.sql` | Replaces `get_org_open_assignments(uuid)`. INVOKER. `truncated` is false. One label per busy driver and vehicle | Final assignment body |
| 10 | `20271105201000_trip_delta_keyset.sql` | Replaces production `get_trips_delta(uuid, text, int)`. DEFINER. Page clamped to 1..200. Adds `has_more`. Cursor `timestamptz` or `timestamptz\|uuid` | Final delta |
| 11 | `20271105213000_hub_and_client_keyset_paths.sql` | Replaces the hub and client keyset bodies from steps 4 and 8. Same signatures | Final hub and client page bodies |

Do not stop after step 2. The app on this branch expects `chart_version` 2 and refuses a truncated assignment payload. Do not deploy this app before step 10: the client treats a delta response without `has_more` as incomplete. The previous app can call the new delta: it ignores `has_more`, sends the returned cursor back, and the new function accepts both cursor shapes. Apply the batch before the app.

No scalability file creates an index. No file uses dynamic SQL. Grants are `REVOKE ALL FROM PUBLIC` and `GRANT EXECUTE` to `authenticated` and `service_role`. None grants `anon`.

`service_role` can execute the functions and still receives NULL or no rows. `is_org_member` is `SECURITY DEFINER` and checks `auth.uid()` against `organization_members`. A service-role call has no member `auth.uid()`.

Rollback is forward-only. These files do not drop columns. Reversing one function means installing the previous body on purpose. Re-running `20270918100100_ground_ops_legacy_indent_warehouse_scoping.sql` to undo the delta would also replace the other functions in that file. Do not do that. The assignment and rollup bodies have the same hazard: the previous body is the earlier scalability file, not a production function that already exists, except `get_trips_delta`.

### SQL and RLS review

`is_org_member` gates every function. A failed check returns NULL or an empty table, not another org's rows. DEFINER is used only where the comment says trips RLS would hide a carrier or client row: the hub, carrier vehicle totals, the supplier trip, the client keyset, and the existing delta. INVOKER functions still pass through RLS, so a ground-ops member can see a smaller set than the org total. That is a smaller total, not a cross-tenant total. The hub DEFINER path does not apply that RLS filter after membership succeeds, except for the ground-ops warehouse branch copied into the function.

Counts on the hub ignore the cursor. `bucket_count` is the filtered book. The page is at most 100 rows. Finance columns are NULL unless `trips.organization_id` is the caller org. The client keyset returns a fixed column list, not shipper cost columns.

Contract gaps, from reading the SQL rather than from a plan:

- The hub builds `matched`, then repeats the same filter in `page`. The two copies can drift. Both walk the visibility predicate. Counts then scan `matched` several times.
- The client keyset puts every matching trip in `matched`, then sorts that set for one page.
- Hub `active_count` excludes the status `cancelled` and not `canceled`. Assignment and busy-fleet SQL exclude both spellings.
- Delta stays `organization_id = p_org_id`. Carrier trips are not in the delta. The hub full sync is the carrier path. A non-member used to get an empty JSON object from `get_trips_delta`. Step 10 returns NULL. This branch treats that as failure.
- Chart rollup sums are SQL `sum` without an added round. Cash totals cast the sums to `numeric`.
- No function concatenates a parameter into executable SQL.

### Index matrix

Existing indexes that match a predicate, and the access path that is still unproven:

| Query | Predicate and order | Index present in migrations | Gap |
|---|---|---|---|
| Hub owner page | `organization_id`, order `(created_at DESC, id DESC)` | `idx_trips_organization_id`. Separate `idx_trips_created_at` on `created_at DESC` only | No `(organization_id, created_at DESC, id DESC)` |
| Hub carrier arm | supplier linked to the caller org, then the trip | `idx_suppliers_linked_org` and `idx_trips_supplier_id` | The `OR` with the owner arm is not one index. Plan unknown |
| Delta | `organization_id` and `(updated_at, id) > cursor`, order `(updated_at, id)`, limit 200 | `idx_trips_organization_id`. Separate `idx_trips_updated_at` on `updated_at DESC` | No `(organization_id, updated_at, id)` |
| Cash totals | `transactions.organization_id` and `transaction_date` | `idx_transactions_org_date` | Supply filter joins `trips` and may not stay on that index |
| Party counts | three `GROUP BY` scans of one org's trips | `idx_trips_organization_id` | Three aggregates per call |
| Client page | `clients.linked_organization_id`, then trips, order `(created_at, id)` | `idx_clients_linked_org` | The function still materializes the matched set before the limit |
| Open assignments and busy fleet | owned trips, status not closed | `idx_trips_org_status_date` on `(organization_id, status, pickup_date)` where `deleted_at` is null | Predicates use `lower(status)`, so that index may not apply |
| Supplier trip | primary key plus supplier or accepted quote | trips primary key, supplier link index, `idx_dq_accepted_bidder_indent` | One row. Not the book |

Proposed indexes, not created, and not claimed to be effective:

- `trips (organization_id, created_at DESC, id DESC)` for the owner hub keyset.
- `trips (organization_id, updated_at, id)` for the delta. This one is written on every trip update. `idx_trips_updated_at` already adds a write on `updated_at`.
- Do not add them in the same batch as the functions until a staging `EXPLAIN` shows the scan they remove. A wrong index is extra write cost on `trips`.

### Query-plan commands

Run these only on a staging database that already contains the batch and a disposable copy of a large org. Do not run them on production. Replace the UUIDs. Capture `EXPLAIN (ANALYZE, BUFFERS)` and the result rows. This audit did not run them.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT public.list_org_hub_trips_keyset(
  '<org>'::uuid, 50, NULL, NULL, NULL, NULL,
  'all', 'either', NULL, NULL, NULL, NULL, 'all', 'all', NULL, NULL, 'all', NULL, false);

EXPLAIN (ANALYZE, BUFFERS)
SELECT public.get_trips_delta('<org>'::uuid, '2020-01-01T00:00:00Z', 200);

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.get_org_ledger_cash_totals('<org>'::uuid, NULL, NULL, 'all');

EXPLAIN (ANALYZE, BUFFERS)
SELECT public.get_org_trip_party_counts('<org>'::uuid);

EXPLAIN (ANALYZE, BUFFERS)
SELECT public.list_client_org_trips_keyset('<org>'::uuid, 50, NULL, NULL, NULL);

EXPLAIN (ANALYZE, BUFFERS)
SELECT public.get_org_open_assignments('<org>'::uuid);

EXPLAIN (ANALYZE, BUFFERS)
SELECT public.get_org_busy_fleet_ids('<org>'::uuid, NULL);
```

A plan that shows a sequential scan, an external sort, or temporary files on a 100,000-trip org fails the capacity gate even if the function returns the right rows.

### Benchmark design

Not run. Dataset, in a disposable staging cluster:

- Org A: 100,000 trips in one month, 80 percent owner, 20 percent linked-carrier rows, status skew 70 percent delivered, 20 percent active, 10 percent cancelled. 1,000 distinct clients, 200 suppliers, 500 drivers, 500 vehicles. Include at least 50 trips that share one `updated_at` and 50 that share one `created_at`.
- Org B: 1,000,000 historical trips over 24 months, same shape, plus 100,000 trips updated in the last hour.
- Orgs C–J: 10,000 trips each, so the planner cannot assume one tenant.

Mix, after a cache flush and again after a warm run:

- Hub first page and a cursor in the middle, buckets `all` and `active`, sides `either` and `owner`.
- Delta from a day-old cursor and from a cursor inside a shared `updated_at`.
- Cash totals, party counts, domain rollup, client keyset, open assignments, busy fleet.
- 20 sessions creating and updating trips while 20 sessions run the read mix.

Record p50, p95, and p99 of each statement, transactions per second, and from `pg_stat_statements` plus system views: CPU, memory, connections, shared-buffer hits, temporary files, and lock waits.

Fail the gate if any of these is true: p95 of a hub page or a delta page is above 500 ms on the warm cache; any statement writes temporary files on the 100,000-trip org; a sequential scan of `trips` appears in the plan for the owner keyset or the delta; a sync, export, or assignment call returns success with fewer rows than its exact count; lock waits on `trips` exceed 5 seconds during the concurrent mix. Passing this gate is still not production rollout approval.

### Readiness

| Workflow | Correctness in this branch | Migration | Staging apply | Production | 100k capacity |
|---|---|---|---|---|---|
| Cash and party aggregates | Fail-closed when the RPC is missing | File written | Blocked until the batch is authorized | No | No evidence |
| Domain rollup and charts | Expects `chart_version` 2 | Step 3 must replace step 2 | Same | No | No evidence |
| Hub pages, compliance walk, reconciliation, trip full sync | Fail-closed on a short walk | Step 4 | Blocked by index and plan | No | No evidence |
| Receipts, carrier totals, indent and invoice helpers, pulse aux | Fail-closed when missing | Steps 5–6 | After review | No | No evidence |
| Busy fleet and open assignments | Empty labels are not free capacity | Step 9 must replace step 2 | After review | No | No evidence |
| Client and supplier trip pages | One page or one trip | Step 8 | Blocked by the client materialization | No | No evidence |
| Trip delta | Requires `has_more` | Step 10 before the app | Blocked by index and plan | No | No evidence |

### Decision

**NO-GO.** The batch is ordered and the functions fail closed for a non-member, but it is not applied, it has no release set, it adds no index, and no query plan or staging benchmark exists. Correctness of the client contracts is local. Migration, staging, production, and 100,000-trip capacity are not ready. No commit, push, deployment, or hosted database change was made.

## 16. Phase 2K — SQL access-path structure

No query plan was captured. Local Docker databases were not queried. The changes below are structural. They are not a performance result.

### Hub

Before, in `20271105161500`, `matched` held the visibility set and `page` repeated that filter against `trips`, then added the bucket and the cursor. After, in `20271105213000`, `page` is:

```sql
SELECT id FROM matched
WHERE <bucket> AND <created_at, id cursor>
ORDER BY created_at DESC, id DESC
LIMIT v_limit
```

Counts still read `matched`. Full trip rows are joined only for those limited ids. Finance columns stay NULL unless `trips.organization_id` is the caller org. Owner and carrier visibility, payment, load type, compliance, and the ground-ops branch are the `matched` predicate from step 4, once.

Exact bucket counts still need one pass over that filtered set. Splitting them into a second scan of `trips` would not remove that pass. The narrow `matched` set can still be materialized because the counts and the page both read it. That is the remaining hub cost. It is not measured.

### Client keyset

Before, `list_client_org_trips_keyset` put every matching trip, including its display columns, in `matched`, then counted and limited that set. After, the count is its own `SELECT count(*)`, and the page is a separate statement with `ORDER BY t.created_at DESC, t.id DESC LIMIT lim` inside the subquery that `jsonb_agg` reads. Membership, the client link, `deleted_at`, `indent_id`, and the optional owner org are unchanged. The returned columns are unchanged. `margin`, `platform_fee`, and `supplier_rate` are not selected.

The count still touches every matching client trip. That cost is separate from the page. It is not measured.

### Indexes

Not added. No `CREATE INDEX` is in `20271105213000`.

| Proposed index | Matches | Existing coverage | Decision |
|---|---|---|---|
| `trips (organization_id, created_at DESC, id DESC)` | Owner hub keyset order | `idx_trips_organization_id` and a separate `idx_trips_created_at` on `created_at DESC` only | Not created. The carrier `OR` still cannot use this index alone. A plan has to show the owner page sort before this is worth the extra btree on every insert |
| `trips (organization_id, updated_at, id)` | Delta `WHERE organization_id` and `(updated_at, id)` ascending | `idx_trips_organization_id` and `idx_trips_updated_at` on `updated_at DESC` | Not created. Every trip update would maintain it, on top of the existing `updated_at` index. DESC on `updated_at` does not by itself serve an ascending keyset |

A partial active-trip index was not added. Open-assignment and busy-fleet predicates use `lower(status)`, so a btree on the raw status, or a partial index of a few status spellings, would not reliably match. `idx_trips_organization_id` is not dropped. The proposed composites would make it redundant only for an equality on `organization_id`, and only after a plan says so.

Storage and write cost of those two btrees were not measured.

### Other paths, unchanged

- `get_trips_delta` already limits to 200 rows ordered by `(updated_at, id)`. It does not load the book. The missing composite above is the unproven access path.
- `get_org_domain_rollups` still builds one `live` set and aggregates it several times, including `chart_version` 2. Left as-is so the chart contract does not move in this pass.
- `get_org_open_assignments` still counts open trips and then runs `DISTINCT ON` for drivers and vehicles. Two passes over the open set. The payload is labels, not the trip book. Not rewritten.
- Ledger cash totals remain one aggregate over `transactions` for the org. Party counts remain three grouped scans. No new scan was added.
- Compliance walks still call the hub. They inherit the single visibility predicate. They still walk every page when the export or reconciliation needs the whole bucket.
- Supplier trip lookup remains one primary-key read plus the supplier or accepted-quote predicate.

### Validation

`lib/scalability/__tests__/phase2k.test.ts`: 3 passed, 0 failed. The tests read the migration text. They check the page source, the cursor order, the separate client count, and that no index was created. They do not execute PostgreSQL and they are not a query plan.

`EXPLAIN` commands from section 15 still apply, with step 11 installed, on a disposable staging copy. They were not run.

### Typecheck

Baseline after phase 2I: 359 `error TS` lines, exit 2 (`/tmp/pulse-tsc-2i.txt`). After this phase: 359 in `/tmp/pulse-tsc-2k.txt`, exit 2. No new diagnostic. The SQL signatures did not change. No mass cast.

### Decision

**NO-GO.** The hub no longer repeats its visibility filter, and the client page is limited before its rows are aggregated. Neither function is applied. No index was added. No plan or benchmark exists. 100,000-trip capacity is not shown. No commit, push, deployment, or hosted database change was made.

## 17. Phase 2L-B — local bootstrap repair

No `EXPLAIN` was executed. No capacity number below is a measurement. Benchmarking did not start.

### Root cause

The failure is migration order, not a missing historical file and not a wrong signature.

`20260903061452_admin_rpc_anon_lockdown.sql` revokes functions whose first `CREATE` is a later timestamp. The same pattern is in `20260903072324_admindata_admin_access.sql` and `20260903073406_verification_rpc_anon_lockdown.sql`. `20260903070151_credits_rpc_type_guard.sql` then refuses to continue unless four Reach functions already exist, and `20260903073017_boost_analytics_guard_hardening.sql` rewrites `get_boost_control_center()` and raises when that body is absent. `get_boost_control_center()` is created in `20270106000000_boost_control_center.sql`, still with the guard text that `20260903073017` expects to replace.

A second class shows up once those revokes pass. `20260904123000` updates `trips.source_market_bid_id`, added in `20270304030000`. `20260908192441` creates a profiles policy that reads `dco_profiles`, created in `20270310200000`.

The CLI pin is separate. `config.toml` uses `[inbucket]`. That is valid for Supabase CLI 2.x, including the installed 2.121.0, which prints a deprecation warning. CLI 3.0.0 rejects the file. `scripts/pin-supabase-cli.sh` defaults to 2.95.4. This bootstrap used the explicit binary `/opt/homebrew/bin/supabase` at version 2.121.0. `config.toml` was not edited. Unpinned `npx supabase` is not the bootstrap command.

The CLI runs `RESET ALL` before every migration file, on a connection opened before migrations. A `SET` or `ALTER DATABASE` in an earlier file does not stay in force for the next file. `supabase start` against the full migration directory still stops at the first hard error and deletes that stack.

### Repair

These files keep the final revoke. They run it only when the signature or column already exists. They do not grant `anon`.

| File | Change |
|---|---|
| `20260903061451_replay_prerequisite_absent_admin_rpcs.sql` | New. Creates six missing signatures only when absent. Each body raises `replay_stub`. `EXECUTE` is revoked from `PUBLIC`, `anon`, and `authenticated`. Later `CREATE OR REPLACE` installs the real body. The boost stub contains the guard text `20260903073017` rewrites. |
| `20260903061452_admin_rpc_anon_lockdown.sql` | Driver-KYC revokes run only when that signature exists. Those return types are created in January 2027, so a placeholder would block the real `CREATE OR REPLACE`. |
| `20260903072324_admindata_admin_access.sql` | Same conditional revoke for four functions created later. |
| `20260903073406_verification_rpc_anon_lockdown.sql` | `platform_reject_verification` revoke runs only when that signature exists. The later file revokes `PUBLIC`. |
| `20260904123000_backfill_market_bid_trip_driver_id.sql` | The orphan-trip update runs only when `source_market_bid_id` exists. A fresh database has no such rows. The resolver function is still replaced. |
| `20260908192441_dco_review_queue_identity.sql` | The profiles policy is created only when `dco_profiles` exists. |
| `20270310200100_dco_reviewer_profile_policy.sql` | New. Installs that same policy after `dco_profiles` exists, and only if the policy is absent. |

### Bootstrap result

Isolated project `pulse2lb` is running. Project `pulse` on port 54322 was not reset and was not queried. No hosted project was contacted.

| Item | Value |
|---|---|
| CLI | 2.121.0 |
| Server | PostgreSQL 17.11, aarch64-unknown-linux-gnu |
| Project | `pulse2lb` |
| Database port | 56522 |
| API port | 56521 |
| Migration files | 1016 |
| Recorded in `supabase_migrations.schema_migrations` | 482 |
| Last recorded version | `20260918010000` |

`supabase start` was pointed at an empty migration directory so it could initialise `storage.objects` and stay up. The repo files were then applied with `psql --single-transaction` and `SET check_function_bodies = off` inside that transaction. That setting does not grant privileges. It lets a `LANGUAGE sql` function be stored before its table exists.

The next file stops the apply:

`20260918071909_fix_db_unhealthy_query_storm_and_cron.sql`

```text
ERROR: cannot change name of input parameter "org_id"
HINT: Use DROP FUNCTION market_indents_for_org(uuid) first.
```

`market_indents_for_org` is created earlier as `(org_id uuid)`. This file replaces it as `(p_org_id uuid)`. PostgreSQL 17 rejects that rename. The file does not re-grant. Dropping the function first would drop the grants already on it, so that was not done in this pass.

### Security checks that did run

On the partial catalog, `anon` cannot execute:

| Function | anon | authenticated |
|---|---|---|
| `admin_approve_profile(uuid, uuid, text)` | no | yes |
| `get_boost_control_center()` | no | yes |
| `increment_credit_wallet(uuid, text, bigint, text, uuid, text)` | no | yes |
| `list_dco_review_queue()` | no | yes |
| `platform_approve_verification(uuid, text)` | no | yes |

`platform_reject_verification`, the driver-KYC review functions, and `emit_network_notification` are not created yet at version `20260918010000`. Membership behavior of the scalability RPCs was not tested. Those RPCs are not installed.

### Decision

**LOCAL BOOTSTRAP BLOCKED.** 482 of 1016 files were recorded at the end of phase 2L-B. The scalability batch was not applied. No query plan was captured.

**NO-GO** for 100,000-trip capacity. No commit, push, deployment, or hosted database change was made.

### Phase 2L-C

`market_indents_for_org` on the partial catalog was `SECURITY DEFINER`, owner `postgres`, `search_path=public`, argument `org_id uuid`. `anon` could not execute it. `authenticated` and `service_role` could. The body already called `is_org_staff`.

`20260918071909` replaced that function as `(p_org_id uuid)`. PostgreSQL 17 rejects an input-name change. Callers do not need that name from this file. SQL tests call `market_indents_for_org(uuid)` positionally. The PostgREST name `p_org_id` is installed later by `20270128103000`, which already drops the function and recreates it. This file does not re-grant, so it was not dropped here. The signature in this file stays `org_id`. After it applied: same owner, same `search_path`, still `SECURITY DEFINER`, `is_org_staff` present, `anon` still false, `authenticated` and `service_role` still true.

The same file then called `cron.alter_job` for jobs that do not exist on a fresh database (`job_id can not be NULL`). Those alters now run only when `cron.job` contains that job name. The schedules are unchanged.

Two later forward references were the same class and were closed without a grant to `anon`:

| File | Repair |
|---|---|
| `20261005080754_add_bank_account_beneficiary_branch.sql` | Adds `beneficiary_name` and `branch_name` only when `entity_bank_accounts` exists. |
| `20261029000006_entity_bank_account_beneficiary_branch.sql` | New. Adds those columns after `20261029000005` creates the table. `IF NOT EXISTS`. |
| `20261022100607_ground_ops_warehouse_indents_read.sql` | Creates `indents_ground_ops_select_assigned` only when `ground_ops_can_see_trip(uuid, uuid)` exists. `get_indents_delta` is still replaced. |
| `20271008120100_ground_ops_indent_select_policy.sql` | New. Installs that policy after the helper exists, and only if the policy is absent. |
| `20261017080000_market_indents_exclude_deleted.sql` | Also revokes `anon`. Its `DROP FUNCTION` plus a fresh `CREATE` picked up the local default execute grant to `anon`. `REVOKE FROM PUBLIC` does not remove that direct grant. |
| `20270128103000_market_indents_for_org_pin_p_org_id.sql` | Same `anon` revoke after its drop and recreate. Not applied yet. |

`20261017080000` was already recorded before that `anon` revoke was added to the file. The revoke was then executed on `pulse2lb`. Measured afterward: `anon` false, `authenticated` true, `service_role` true. Argument name still `org_id uuid`.

Apply then stopped. Nothing after the failure was recorded.

```text
ERROR: type "public.registration_type_enum" does not exist
File: 20261022123845_individual_registration_type.sql
```

That enum is created in `20261101000000_business_verification_sprint1.sql`. The failing file adds `'individual'` and replaces `submit_business_verification`. Later files `20261101000000`, `20261101000005`, `20261111000000`, and `20261114000000` replace that function again and do not contain the individual branch. Skipping the file drops the enum value. Replaying it after those replacements would put the individual branch back, which strict timestamp order would then overwrite. That choice is not made here.

| Item | Value |
|---|---|
| Recorded migrations | 527 |
| Migration files | 1018 |
| Last recorded version | `20261022100607` |
| Next file | `20261022123845_individual_registration_type.sql` |

The scalability batch is still not installed. No `EXPLAIN` was run.

**LOCAL BOOTSTRAP BLOCKED.** **NO-GO** for 100,000-trip capacity. Project `pulse` on port 54322 was not touched. No commit, push, or hosted database change was made.

### Phase 2L-D

The app still treats individual registration as a real type. `kycVerification.util.ts` maps it, skips GST, and requires an Aadhaar upload. `OrganizationVerifyWizard` has that branch. `database.types.ts` lists `individual` on `registration_type_enum` and `aadhaar_card` on `verification_document_type`.

`20261022123845` both adds those values and replaces `submit_business_verification` and `kyc_missing_required_documents` from a live snapshot. That snapshot is not the final SQL. These later files replace `submit_business_verification` and do not mention `individual`:

- `20261101000000_business_verification_sprint1.sql` creates the enum without `individual`
- `20261101000005_verification_tiers_async_workers.sql`
- `20261111000000_verification_documents_registry.sql` creates `verification_document_type` without `aadhaar_card`
- `20261114000000_gst_not_applicable.sql` skips GST when `gst_not_applicable` is set
- `20270215220000_admin_approve_completeness_gate.sql`

Those later bodies stay the SQL definition. The individual document matrix stays in the client. The old function text is not replayed.

The enum value and the Aadhaar document type are still required, separately from that function. `20261022123845` now adds them only when the type or table already exists, which is a no-op on this fresh database. `20261111000002_individual_registration_schema_backfill.sql` adds `individual`, adds `aadhaar_card`, and widens the KYC document check after `20261107070001` rebuilds that check without Aadhaar. It does not replace a function and it does not grant `anon`.

`20261022123845` is recorded. `registration_type_enum` does not exist yet at the current version, which is expected. The backfill has not been reached.

Apply then stopped. Nothing after the failure was recorded.

```text
ERROR: relation "public.organization_member_warehouses" does not exist
File: 20261029171316_department_manager_allowlist_and_scope.sql
```

That table is created in `20270917100000_ground_ops_warehouse_scoping.sql`. This file replaces manager RPCs and replaces warehouse policies. The policies were not rewritten in this phase. They change who can read and write warehouse assignments, and `anon` is revoked from the manager RPCs inside the same file.

| Item | Value |
|---|---|
| Recorded migrations | 547 |
| Migration files | 1019 |
| Last recorded version | `20261029000006` |
| Next file | `20261029171316_department_manager_allowlist_and_scope.sql` |

The scalability batch is not installed. No `EXPLAIN` was run.

**LOCAL BOOTSTRAP BLOCKED.** **NO-GO** for 100,000-trip capacity. Project `pulse` on port 54322 was not touched. No commit, push, or hosted database change was made.

### Phase 2L-E — full local replay

The isolated database is `supabase_db_pulse2lb` on host port 56522. Project `pulse` on port 54322 was not used. 1,020 migration files are on disk and 1,020 versions are recorded. Each file runs in one transaction, and the history row is part of that transaction. A failed file is not recorded.

| Blocker | Repair |
|---|---|
| `20261029171316` policies on `organization_member_warehouses` | Policies run only when the table already exists. The table and its policies still come from `20270917100000`. |
| `20261101000000` procedure replacing a function | Drop the existing function, create the procedure, revoke `anon`. `20261113000000` turns it back into a function and revokes `anon`. |
| `20270131120000` payout CASE anchor missing | If the function does not mention `trip_payout_mode`, there is nothing to patch. A different stamp still raises. |
| `20270212010000` `FOR SELECT, UPDATE, DELETE` | Split into one policy per command. `anon` revoked on `can_create_indent`. |
| `20270302000000` support tables already created | `IF NOT EXISTS` for the tables, indexes, and sequence. RLS and the owner-select policies still run. |
| Platform admin seed user ids | Insert only when that `public.users` row exists. |
| `20270917100000` `is_org_staff(uuid)` missing | New `20270915103300_is_org_staff.sql`. Active owner, admin, member, dispatcher, or finance. `search_path` empty. `anon` not granted. |
| `20270921182802` and `20270922143500` cannot update `cron.job` | Skip the cron write when this role cannot update `cron.job`. RPC revokes still run. |
| `20271006185000` production trip repair | Skip only when both named trips are absent. |
| `list_org_hub_trips_keyset` | `jsonb_build_object` had more than 100 arguments, so the call failed before any plan. The payload is three objects concatenated. |

`registration_type_enum` includes `individual`. `verification_document_type` includes `aadhaar_card`. The KYC document check includes `aadhaar_card`. `submit_business_verification` is the six-argument body that mentions `gst_not_applicable` and does not mention `individual`. `anon` cannot execute that function. `anon` cannot execute `list_org_hub_trips_keyset`, `get_trips_delta`, `count_org_hub_metrics`, or `is_org_staff`.

Warehouse policies on this database are `org_member_warehouses_staff_manage` and `org_member_warehouses_self_select`, from `20270917100000`. The October admin-only policies were not copied forward.

Fixture, in this database only: one auth user, two organizations, 100,000 trips on `22222222-2222-4222-8222-222222222222`, and 100,000 committed trips on the second organization when the plans were captured. A further load toward 900,000 on the second organization was still running and had not committed another batch. One million historical rows were not reached. Insert time for 20,000 rows grew from 72 seconds to more than 200 seconds as indexes and triggers accumulated.

Measured plans, target organization, PostgreSQL 17.11:

| Statement | Result |
|---|---|
| `list_org_hub_trips_keyset` limit 50, cold | 203.7 ms. Shared hit 3,924, read 3,293, written 1,836. Temp read 3,240, written 540. |
| Same call, warm | 142.0 ms. Shared hit 7,217. Temp read 3,240, written 540. |
| Returned payload | JSON object, `total` = 100000, `rows` = 50, about 101 KB. |
| `count(*)` for that organization, `deleted_at` null | 12.6 ms. Index-only scan `idx_trips_org_supplier`. 100,000 rows. Heap fetches 0. |
| Owner `ORDER BY created_at DESC, id DESC LIMIT 50` with the date predicate | 1.6 ms. Index scan `idx_trips_created_at`. Planner estimated 514 rows. The limit stopped after 51 index rows because those newest rows belonged to this organization. |
| `get_trips_delta` limit 50 | 95.6 ms. Shared hit 5,288, read 1. |

No index was added. The hub function still builds the matched set and counts it several times, which is the temp spill. A date-ordered index is not an organization keyset index.

`pgbench` against `list_org_hub_trips_keyset`, 8 seconds, zero failures, same page. This ran on the same machine while the second-organization insert was still open, so it is not a clean capacity run.

| Clients | Transactions | Average latency | Throughput |
|---|---|---|---|
| 1 | 68 | 118.8 ms | 8.4 txn/s |
| 10 | 530 | 152.2 ms | 65.7 txn/s |
| 25 | 590 | 350.8 ms | 71.3 txn/s |
| 50 | 625 | 682.8 ms | 73.2 txn/s |

A separate 10-client log, 520 transactions: p50 152.0 ms, p95 174.7 ms, p99 195.6 ms, max 200.9 ms. p95 and p99 were not logged for 1, 25, or 50 clients. Throughput stops rising after 10 clients. At 50 clients the average is above 500 ms.

**LOCAL BOOTSTRAP READY** for this disposable database: every file is recorded and the registration contract is present.

**NO-GO** for 100,000-trip capacity. The hub page is correct and bounded, and one organization count is fast, but the page still spills temporary files, 50-client latency is above the draft 500 ms bar, one million historical rows were not loaded, and these numbers are from one local Postgres while another insert was running. No commit, push, or hosted database change was made.

### Phase 2M — hub sort and a clean 1,000,000-row run

The temp traffic was not an external sort of the 50-row page. `matched` is referenced by five counts and the page, so PostgreSQL 17 materializes all matching rows. On 100,000 rows that tuplestore was about 540 blocks written and then read once per consumer (temp read 3,240). The page sort on that tuplestore was a top-N heapsort in 32 kB.

`20271105220000_hub_keyset_separate_count_and_page.sql` keeps the same filters, cursor, and payload. Counts are one aggregate. The page is `ORDER BY created_at DESC, id DESC LIMIT` before the wide trip row is loaded. `idx_trips_org_created_id` is `(organization_id, created_at DESC, id DESC)`.

Before that index, the limited page was an incremental sort on `idx_trips_created_at` (0.65 ms) because the newest rows happened to belong to the target organization. After the index, at 1,000,000 trips:

| Piece | Plan |
|---|---|
| Page, limit 50 | Index scan `idx_trips_org_created_id`. Index condition is `organization_id`. No Sort node. 0.096 ms. Shared hit 3, read 2. |
| Count of that organization with the date predicate | Parallel index scan `idx_trips_organization_id`. 48.8 ms. No temp blocks. |
| Whole `list_org_hub_trips_keyset` | 150.9 ms. Shared hit 4,053, read 3,289, written 1,951. No temp line. |

The first page is the same 50 ids as before the rewrite. The next page does not overlap it. The active bucket returns only `assigned` rows, and its `bucket_count` is 80,400. `anon` still cannot execute the function.

Fixture, committed, no writer left running: 1,000,000 trips. Target organization `22222222-2222-4222-8222-222222222222` has 100,000. Seven other organizations hold 120,000 or 130,000. Status is 800,400 `assigned` and 199,600 `completed`. The historical insert disabled user triggers on `trips`, supplied `trip_number`, then enabled the 29 user triggers again. It does not include ledger, invoice, or POD rows. Those tables are not read by this hub page.

Clean `pgbench`, 20 seconds, zero failures, no concurrent insert. `pg_stat_database.temp_bytes` did not move during the hub runs. It did move during `count_org_hub_metrics`, which is a different function and still uses temporary files.

| Workload | Clients | txn/s | Average | p50 | p95 | p99 | Max |
|---|---|---|---|---|---|---|---|
| Hub | 1 | 11.5 | 87.0 ms | 85.8 | 92.6 | 101.8 | 147.9 |
| Hub | 10 | 92.8 | 107.8 ms | 104.8 | 125.7 | 152.5 | 192.4 |
| Hub | 25 | 114.5 | 218.3 ms | 235.9 | 364.2 | 431.0 | 510.5 |
| Hub | 50 | 109.9 | 455.1 ms | 471.2 | 709.2 | 824.9 | 924.1 |
| Delta | 1 | 14.4 | 69.6 ms | 68.9 | 73.9 | 78.7 | 94.6 |
| Delta | 10 | 123.7 | 80.9 ms | 80.6 | 84.1 | 94.2 | 112.1 |
| Delta | 25 | 156.3 | 160.0 ms | 173.1 | 268.0 | 294.0 | 424.5 |
| Delta | 50 | 141.5 | 353.3 ms | 365.7 | 524.7 | 636.5 | 1062.2 |
| `count_org_hub_metrics` | 1 | 11.3 | 88.3 ms | 87.5 | 94.5 | 104.2 | 117.3 |
| `count_org_hub_metrics` | 10 | 78.5 | 127.4 ms | 123.5 | 153.2 | 164.3 | 190.9 |
| `count_org_hub_metrics` | 25 | 102.1 | 244.8 ms | 265.8 | 393.4 | 432.1 | 505.9 |
| `count_org_hub_metrics` | 50 | 99.3 | 503.4 ms | 516.7 | 699.7 | 1066.1 | 1284.6 |

A 50/50 hub and delta mix: 10 clients, 101.8 txn/s, hub average 109.8 ms, delta average 86.0 ms, zero failures. 50 clients, 112.5 txn/s, hub average 495.5 ms, delta average 384.9 ms, zero failures. Percentiles were not logged for that mix.

During a 50-client hub run the database container was at about 1,423% CPU and 692 MiB of 11.7 GiB. Throughput stops rising between 25 and 50 clients. The machine is CPU bound. Hub `temp_bytes` stayed flat, so the old tuplestore spill is gone. The remaining hub time is the exact count over the organization’s rows plus building the 50-row payload.

**NO-GO** for 50 concurrent callers against the draft 500 ms p95 bar. Hub p95 is 126 ms at 10 clients and 709 ms at 50. One organization of 100,000 trips and 1,000,000 historical trips are loaded. Single-caller hub p95 is 93 ms with no temporary files. This is one local Postgres, not a production pooler or disk. No commit, push, or hosted change was made.

### Phase 2N — insert path, metrics spill, final local certification

The earlier loader that exited with code 3 was cancelled on purpose. It had already committed the target organization’s 100,000 trips and 100,000 trips for the second organization, then stalled in `set_trip_operational_identity()` on `MAX(trip_number)`. The later load, with user triggers disabled only for that insert and then re-enabled, is the load that reached 1,000,000 trips. Those rows are still present. Nothing in this phase reloaded them.

Fixture check after this phase, still 1,000,000 trips and no active writer:

| Organization | Trips |
|---|---:|
| Target `22222222-2222-4222-8222-222222222222` | 100,000 |
| Second `33333333-3333-4333-8333-333333333333` | 120,000 |
| Six other bench orgs | 130,000 each |

Status is 800,400 `assigned` and 199,600 `completed`. Created-at years are 780,000 in 2024, 120,000 in 2025, and 100,000 in 2026. Every row has a trip number, an organization, a status, and `created_at`. `vehicle_id`, `driver_id`, `supplier_id`, and `client_id` are null on all 1,000,000 rows. The 780,000 rows loaded with triggers off have null `trip_code`, `display_trip_id`, and `sequence_number`. Hub, delta, and metrics pages that filter by organization, status, and date are valid on this fixture. Fleet, finance, invoice, POD, assignment, and operational-identity benchmarks are not: those relationships were not loaded, and the trigger-skipped rows did not receive identity fields. Triggers are enabled again (29 user triggers). Insert probes were deleted. The target org is back to 100,000 and the table is back to 1,000,000.

Local Postgres settings, unchanged: `shared_buffers` 128 MB, `work_mem` 4 MB, `max_connections` 100. `pgbench` connected as `postgres` with one connection per client. There is no pooler in front of this database.

#### Trip numbers

Before, the max query was an index scan of all 100,000 target-org rows (36.2 ms, 3,206 buffer pages) because the `TRP` test sat inside `MAX(CASE ...)`. One insert on that org took 205.9 ms and returned `TRP200001`.

`20271106045000_trip_number_index_max.sql` adds partial index `idx_trips_org_trp_seq` on `(organization_id, trip-number suffix DESC) WHERE trip_number ~ '^TRP[0-9]+$'`. The function locks `organization_counters` for the organization, then takes the highest suffix with `ORDER BY ... LIMIT 1`. The label rule is still `GREATEST(trip_code suffix, max TRP suffix + 1)` through `format_org_local_seq_label`. A rolled-back insert on the target org still returned `TRP200001`.

After, that lookup is an index scan on `idx_trips_org_trp_seq`, 0.126 ms, 2 buffer pages, zero rows on this fixture because bench numbers are not `TRP` labels. Warm inserts into the target org, triggers on, then deleted:

| Clients | Window | txn/s | Average | p50 | p95 | p99 | Max | Failures |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 8 s | 389.3 | 2.6 ms | 2.0 | 4.7 | 7.6 | 63.1 | 0 |
| 10 | 8 s | 511.8 | 19.5 ms | 15.7 | 45.5 | 68.6 | 192.4 | 0 |
| 25 | 8 s | 414.4 | 60.1 ms | 41.6 | 171.1 | 267.8 | 746.5 | 0 |
| 50 | 8 s | 402.9 | 123.2 ms | 86.3 | 363.7 | 573.0 | 1596.5 | 0 |

Twenty parallel inserts produced 20 distinct numbers. A separate empty-org run of 23,930 inserts also had 23,930 distinct numbers, zero failures, and zero deadlocks. Those rows were deleted. During the concurrent insert, sessions waited on tuple and transaction locks. No deadlock counter moved, and no wait in that sample was a multi-second lock on `trips`. `anon` cannot execute the trigger function. `authenticated` and `service_role` can.

The two numbering triggers still each advance `operational_sequences` once, so automatic labels on a new org come out odd (`TRP001`, `TRP003`, …). That was already true before this change. This phase did not collapse the two counters.

#### Hub metrics temp files

`count_org_hub_metrics` referenced `visible_trips` from two aggregates, so PostgreSQL materialized it and `temp_bytes` climbed on every concurrency step in Phase 2M. `20271106045100_hub_metrics_inline_visible_trips.sql` marks that CTE `NOT MATERIALIZED`. The returned JSON for the target org is the same: `trips_total` 100,000, `trips_active` 80,400, `trips_completed` 19,600. `temp_bytes` stayed at 31,081,997,100 across a 15-second run at 1, 10, 25, and 50 clients. Deadlocks stayed 0.

| Clients | txn/s | Average | p50 | p95 | p99 | Max |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 12.6 | 79.2 ms | 76.9 | 86.9 | 100.3 | 278.6 |
| 10 | 100.8 | 99.0 ms | 97.1 | 118.2 | 138.3 | 195.8 |
| 25 | 126.5 | 196.8 ms | 215.6 | 315.1 | 404.1 | 500.2 |
| 50 | 121.3 | 410.0 ms | 432.1 | 598.5 | 747.4 | 827.1 |

`anon` cannot execute this function.

#### Plans that did not change in this phase

The hub page plan from Phase 2M still stands: index scan on `idx_trips_org_created_id`, no Sort node, no temp files. Its clean 20-second benchmark was not repeated because this phase did not change that function. At 50 clients that run’s p95 was 709 ms.

A delta page of 50 ids for the target org, `updated_at > 2026-01-01`, is an incremental sort in about 30 kB over `idx_trips_updated_at`, 2.3 ms, 87 buffer pages, no temp files, and not a sequential scan. It stops early because the newest `updated_at` values include that org. A different distribution can make that scan read more rows. No new delta index was added.

#### Gate

Section 15 fails the gate when warm hub or delta p95 is above 500 ms, when a statement on the 100,000-trip org writes temporary files, when the owner keyset or the delta sequentially scans `trips`, or when a lock wait on `trips` exceeds 5 seconds.

Single-client warm hub p95 is 93 ms and delta p95 is 74 ms. Neither writes temp files. The measured plans are index scans. Insert p95 at 50 clients on the target org is 364 ms. Metrics no longer write temp files. At 50 clients, hub p95 is 709 ms and metrics p95 is 598 ms. Delta p95 at 50 clients in the Phase 2M clean run is 525 ms. Finance, fleet, POD, and assignments were not timed because this fixture does not contain those rows.

**NO-GO** for 100,000 trips per organization per month as a concurrent capacity certification. The local database does hold 100,000 trips in one org and 1,000,000 historical trips, the hub page no longer spills, trip creation no longer scans the org on every insert, and metrics no longer spill. Fifty concurrent hub callers still miss the 500 ms p95 bar on this 128 MB `shared_buffers` Postgres. No commit, push, or hosted change was made. Migration versions recorded: `20271106045000`, `20271106045100`. Schema history count is 1,023.

### Phase 2O — concurrent count cost

The remaining cost was CPU inside the plpgsql functions, not the hub sort and not the trip-number lookup. `list_org_hub_trips_keyset` and `count_org_hub_metrics` are parallel-unsafe, so a plan that asked for workers ran on the leader alone. Per-row `lower(status)` filters, and a `trip_documents` subplan that the planner costed even when no row was unloading, kept the metrics scan off the covering index. `timezone('Asia/Kolkata', created_at)` is stable and cannot be indexed; the fixed +05:30 offset is an equivalent range on `created_at`.

`20271106052000_hot_path_index_only_counts.sql` (already recorded on `pulse2lb`; the function bodies were replaced again after that version was inserted):

- Covering indexes `idx_trips_org_count_cover` and `idx_trips_org_created_cover`.
- Default hub and metrics callers (not ground ops, no supplier/vehicle/driver/payment/load/compliance filters) count from an organization index scan. Supplier-linked trips stay a second branch. Ground ops keeps the warehouse predicate.
- Hub date match is `created_at` in the IST day range, plus `pickup_date BETWEEN`, without counting a row twice.
- Metrics and hub status totals are one `GROUP BY` of status (and driver presence or the attributed-note flag), not a filter expression per row.
- Document checks for unloading run only on that status, not across the 100,000-row aggregate.
- Delta, when the caller is not ground ops, reads `trips` by organization and cursor. No indent join.
- Each function sets `plan_cache_mode = force_custom_plan`, `max_parallel_workers_per_gather = 0`, and `random_page_cost = 1.1`. Those are function settings, not server settings. `shared_buffers` stays 128 MB, `work_mem` stays 4 MB, `max_connections` stays 100.

Page-1 hub JSON, the active-bucket page, and metrics JSON matched the pre-change payloads. A hub call with no date bounds still returns `total` 100,000. `anon` cannot execute the three functions. The trip table is still 1,000,000 rows and the target org is still 100,000. `temp_bytes` stayed 31,325,786,740 and deadlocks stayed 0. `blks_read` did not move during the matrix (569,195). No lock wait on `trips` was observed. Peak database CPU in that matrix was 1,402% and memory about 534 MiB.

Clean 20-second windows, zero failures. Phase 2N 50-client p95 is the before number.

| Workload | Clients | txn/s | Average | p50 | p95 | p99 | Max |
|---|---:|---:|---:|---:|---:|---:|---:|
| Hub | 1 | 31.4 | 31.9 ms | 31.4 | 34.5 | 41.6 | 71.0 |
| Hub | 10 | 253.4 | 39.5 ms | 38.4 | 47.0 | 60.5 | 102.7 |
| Hub | 25 | 312.6 | 80.1 ms | 86.5 | 128.6 | 151.0 | 232.7 |
| Hub | 50 | 295.9 | 169.1 ms | 171.4 | 252.1 | 379.9 | 895.1 |
| Delta | 1 | 326.2 | 3.1 ms | 2.9 | 3.8 | 5.6 | 18.6 |
| Delta | 10 | 2343.4 | 4.3 ms | 4.2 | 4.9 | 6.1 | 31.5 |
| Delta | 25 | 2614.5 | 9.6 ms | 9.5 | 16.8 | 22.1 | 94.4 |
| Delta | 50 | 2506.5 | 19.9 ms | 18.1 | 37.3 | 66.1 | 233.3 |
| Metrics | 1 | 42.2 | 23.7 ms | 22.9 | 26.7 | 35.1 | 96.3 |
| Metrics | 10 | 294.6 | 34.0 ms | 33.6 | 39.6 | 46.4 | 159.1 |
| Metrics | 25 | 360.9 | 69.3 ms | 74.7 | 113.9 | 129.1 | 248.3 |
| Metrics | 50 | 354.1 | 141.5 ms | 144.0 | 206.3 | 303.7 | 543.0 |

A second hub 50-client window was 309.2 txn/s, p95 229.1 ms. A second metrics 50-client window, taken before the matrix, was p95 192.7 ms. Throughput rises from 1 to 25 clients and does not collapse at 50.

| Workload | 50-client p95 before | 50-client p95 after | 50-client txn/s before | 50-client txn/s after |
|---|---:|---:|---:|---:|
| Hub | 709.2 ms | 252.1 ms | 109.9 | 295.9 |
| Metrics | 598.5 ms | 206.3 ms | 121.3 | 354.1 |
| Delta | 524.7 ms | 37.3 ms | 141.5 | 2506.5 |

**GO** for hub, metrics, and delta at 50 concurrent callers on this local database: each p95 is under 500 ms, counts stayed exact, and organization isolation and `anon` denial are unchanged. This fixture still has null `vehicle_id`, `driver_id`, `supplier_id`, and `client_id` on every row, and 780,000 rows have null `trip_code`, `display_trip_id`, and `sequence_number`. It does not certify fleet, finance, invoice, POD, assignment, or operational identity.

**NO-GO for production deployment.** The worktree still has the rest of the scalability program uncommitted (about 144 files). This change was not committed, not pushed, and not deployed. `gogopulse.com` was not updated. Production database `nafxpivddesgsrthmosv` was not changed. The index build in `20271106052000` locks `trips` and has to be applied by Vasanth, through a reviewed release, before any application deploy that depends on these function bodies. HEAD remains `5bb0cfd3`.

### Production release shape

The local database applied `20271106052000_hot_path_index_only_counts.sql` as one transaction, including ordinary `CREATE INDEX`. That file is not the production release. Production builds the same two indexes with `CREATE INDEX CONCURRENTLY` from `supabase/release-manual/20271106053000_hot_path_indexes_concurrent.sql`, outside a transaction and outside `schema_migrations`. The tracked migration is `20271106053100_hot_path_counts_functions.sql`. It contains the same three function bodies and grants, and it aborts unless both indexes are valid and match those definitions.

Supplier-linked metrics and ground-ops or filtered hub paths were not certified by the 50-client benchmark. The local fixture has null vehicle, driver, supplier, and client ids.
