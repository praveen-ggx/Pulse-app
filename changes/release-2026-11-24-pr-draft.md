# Controlled release PR draft — do not merge until gates pass

**Head:** `vasanth/marketplace-lane-48h-v1` @ `da9bafc24`  
**Base:** `V1.0.1`  
**Integration workspace:** `release/2026-11-24-ui-integrate` (conflict resolution; original feature branch preserved)

## Checkpoint
- Feature commit pushed: `da9bafc24` — Ship driver DCO vehicle onboarding, wallet card polish, and ops UI fixes.
- Production (`V1.0.1` / Netlify) remains untouched.

## Conflicts with `V1.0.1` (35 files)
Resolve on `release/2026-11-24-ui-integrate` only. Do not force-push shared history. Do not blind-accept either side.

- app/(driver)/index.tsx
- app/compliance/index.tsx
- components/PartyFilterSheet.tsx
- components/ledger/LedgerEntryReceiptCard.tsx
- features/bulkOperations/components/BulkOperationWorkspace.tsx
- features/debit-control/services/__tests__/debitControlPod.service.test.ts
- features/debit-control/services/debitControlPod.service.ts
- features/driver/components/DcoStatusScreen.tsx
- features/driver/components/DriverTripOperationsTab.tsx
- features/drivers/components/DriverWalletEarningsPanel.tsx
- features/drivers/screens/DriverProfileScreen.tsx
- features/drivers/services/drivers.service.ts
- features/tripCompliance/__tests__/buildComplianceTripSummaries.hardCopyPod.test.ts
- features/tripCompliance/__tests__/compliancePaymentAmount.util.test.ts
- features/tripCompliance/__tests__/compliancePipelineSync.service.test.ts
- features/tripCompliance/__tests__/complianceTripCatalog.service.test.ts
- features/tripCompliance/__tests__/tripDocumentClassification.util.test.ts
- features/tripCompliance/hooks/useComplianceTripsQuery.ts
- features/tripCompliance/paymentBulk/compliancePaymentField.adapter.ts
- features/tripCompliance/services/complianceAdvanceFinanceBreakdown.service.ts
- features/tripCompliance/services/complianceTripCatalog.service.ts
- features/tripCompliance/services/tripComplianceBulkPayment.service.ts
- features/tripCompliance/services/tripComplianceRead.service.ts
- features/trips/hooks/useTripsHubDateRange.ts
- features/trips/screens/TripsScreen.tsx
- features/trips/services/__tests__/hubKeysetRowsWalk.test.ts
- features/trips/services/__tests__/supplierKeysetWalk.test.ts
- features/trips/services/tripDocuments.service.ts
- features/trips/services/tripIndentReport.service.ts
- features/trips/services/tripWorkflow.service.ts
- features/trips/services/trips.service.ts
- features/trips/utils/__tests__/hubTripListCounts.util.test.ts
- features/trips/utils/hubTripListCounts.util.ts
- scripts/__tests__/supabaseProject.test.ts
- scripts/supabaseProject.cjs

## Migrations on branch (review + approve before any prod apply)
Schema-first is required, but **do not apply** merely because these files are present. Exact set must be reviewed and approved.

1. `20261029170000_organization_member_warehouses_before_department_manager.sql`
2. `20261112140000_indents_award_revoked_at_before_reference.sql`
3. `20261113100000_is_org_staff_before_pool_bid_policy.sql`
4. `20261113104000_direct_quote_names_return_before_pool_reissue.sql`
5. `20261114110000_trips_owner_vehicle_id_before_plate_link.sql`
6. `20261114111733_link_trip_vehicle_by_plate.sql`
7. `20261118114448_blank_supplier_rate_basis_per_trip.sql`
8. `20270304120000_list_my_org_market_bids.sql`
9. `20270309030100_restore_my_org_market_bids_identity.sql`
10. `20270917100030_restore_warehouse_assignment_admin_policy.sql`
11. `20270921182802_pause_diagnostic_crons_during_unhealthy.sql`
12. `20270922143500_guard_http_queue_url_and_rpc_grants.sql`
13. `20271006185000_pulse_exchange_repair_sat812_trp191.sql`
14. `20271027155318_get_trips_for_org_date_range.sql`
15. `20271106053000_hot_path_trip_cover_indexes.sql`
16. `20271117021500_marketplace_bid_individual_expiry.sql`
17. `20271117144500_marketplace_expired_bid_resubmission.sql`
18. `20271118123000_supplier_trips_keyset.sql`
19. `20271118143000_compliance_ops_pipeline_and_hub_tiles.sql`
20. `20271118161500_bulk_operation_audit.sql`
21. `20271118174500_bulk_payment_paid_amount.sql`
22. `20271118191000_bulk_payment_mode.sql`
23. `20271118194500_bulk_payment_post_record.sql`

## Required deployment order
1. Migration review — identify exact files + dependencies  
2. Preprod — apply + test against matching app  
3. Production DB — **explicit approval** for the exact migration set  
4. Merge — **separate explicit merge approval** into `V1.0.1`  
5. Netlify — confirm deploy to gogopulse.com  
6. Verification — affected workflows on production  

**Do not merge, migrate prod, or deploy until each gate is separately approved.**

## App highlights in `da9bafc24` (non-exhaustive)
- Driver DCO: Assigned vehicle step in onboarding checklist  
- Wallet Daily Breakdown / Collect Payment / receipt footer polish  
- Assigner row restyle and related ops UI fixes  

## Secrets
- `.env.prod-backup` is local-only, never committed; keep ignored / rotate if exposure suspected.

## Conflict resolution (integration branch)

Resolved on `release/2026-11-24-ui-integrate` (merge of `personal/V1.0.1` into feature tip). Original feature branch tip `da9bafc24` preserved until this resolution is pushed into the PR head.

### Resolution principles
- DCO assigned-vehicle checklist, wallet/receipt compactActions, driver available+incoming assignment: keep feature behaviour; fold prod marketplace gate (`canSeeMarketplace`).
- Hub cancelled trips: keep production rule (Cancelled bucket only) from V1.0.1 / PR #148.
- Debit-control POD workflow: keep production update-first fix (dup-key noise).
- Trip document delete: keep production re-read of verified status.
- Advance freight basis: keep production “blank trip basis stays blank” (no indent per-MT inherit); keep feature approved-advance percent read.
- Compliance catalog fallback: keep feature active+history hub walks.
- `scripts/supabaseProject.cjs`: keep production Netlify `gx-pulse` → preprod lock.
- Session handling: prefer `SESSION_EXPIRED_MESSAGE` returns from V1.0.1.

### Targeted tests (post-resolve)
Ran Jest on hub counts, hub/supplier keyset walks, compliance catalog/payment amount, debit-control POD, supabaseProject, driver incoming assignment.

