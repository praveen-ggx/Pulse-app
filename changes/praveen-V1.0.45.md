# praveen/V1.0.45

## What
- Compliance list, Advance Payment panel, hard-copy POD sheet, debit-control table, and verified export show **contract/indent truck type** (then lane, then assigned vehicle `type · size` as fallback).
- Migration updates `get_compliance_list_trip_facts` to the same precedence so list cards and Advance stay aligned.
- Truck type is keyed **per trip** so one vehicle on two different indents can show two contract types.
- Ops SQL script to identify Apollo trips on TN13Y7553 / TN18AH7051 and (commented) correct TN13Y7553 size to 20 FT after Daisy/owner approval. No UPDATE for TN18AH7051 (trip 002650) — Daisy must confirm whether Open Body Truck / Half Body should be Closed Container; capacity/size already read 20 FT.

## Why
- Apollo / Luminous advances were rejected for "truck type mismatch" when Finance saw the assigned vehicle master (e.g. Closed Container · 24 MT) instead of the indent/lane type (20 FT) that matched client/vendor rates.
- Fixing display to the booked contract type stops false rejects; vehicle master cleanup remains a separate owner-side data fix.

## Areas
- `supabase/migrations/20271125110000_compliance_truck_type_prefers_indent.sql`
- `features/tripCompliance/utils/complianceTruckType.util.ts`
- `features/tripCompliance/utils/__tests__/complianceTruckType.util.test.ts`
- `features/tripCompliance/services/complianceListFacts.service.ts`
- `features/tripCompliance/services/complianceContractTruckType.service.ts`
- `features/tripCompliance/services/complianceExportReport.service.ts`
- `features/tripCompliance/hooks/useComplianceListTripFacts.ts`
- `features/tripCompliance/components/ComplianceDocumentWorkspace.tsx`
- `features/tripCompliance/components/CompliancePaymentConfirmModal.tsx`
- `features/tripCompliance/components/ComplianceHardCopyPodSheet.tsx`
- `features/tripCompliance/components/DebitControlTripsTable.tsx`
- `features/tripCompliance/components/PodVerificationPane.tsx`
- `features/tripCompliance/__tests__/complianceListFacts.service.test.ts`
- `features/tripCompliance/__tests__/useComplianceListTripFacts.test.tsx`
- `scripts/sql/fix_tn13y7553_vehicle_size_apollo_truck_type.sql`

## Migrations
- `20271125110000_compliance_truck_type_prefers_indent.sql` — `get_compliance_list_trip_facts` prefers indent → lane → vehicle type·size. Additive function replace; grants unchanged.

## Tested
- Unit (15 passing): `complianceTruckType.util.test.ts`, `complianceListFacts.service.test.ts` (incl. `complianceTruckTypeForTrip`), `useComplianceListTripFacts.test.tsx`.
- Preprod read-only (earlier session): Apollo indent `20 FT` + vehicle TN13Y7553 `Closed Container · 24 MT` confirmed as the mismatch pattern; after this change Advance/Compliance show `20 FT` for those trips without editing trip rows. (CLI token expired this session — re-probe after `supabase login` / migration apply.)
- Trip **002650** (TN18AH7051): indent `20 FT`; vehicle master already `Open Body Truck · 20 FT`. After this change Advance/Compliance show indent **`20 FT`** (not the vehicle body label). No vehicle UPDATE in this PR — Daisy still needs to confirm whether body type should be Closed Container.
- Vehicle master UPDATE for TN13Y7553 not applied from this PR (owner org SIVAN E; Daisy capacity confirmation still open). Use the ops SQL after approval.
- Manual UI click-through on gx-pulse: not done until migration is on preprod.
- Existing workflows preserved: asset/non-indent trips still fall back to vehicle `type · size`; list batch RPC signature/grants unchanged; payment confirm / export / debit table only change the truck-type label source.
