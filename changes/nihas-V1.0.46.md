# nihas V1.0.46 — Compliance vehicle vault by plate (cross-org fix)

## What
SECURITY DEFINER RPC `get_compliance_vehicle_vault_by_plate` that resolves
vehicle vault documents for aggregate/partner trips that have
`vehicle_display_number` but no `vehicle_id` FK. Matches by normalized plate
within the trip's supplier's `linked_organization_id`.

## Why
The vehicles table RLS policy `is_org_staff(organization_id)` silently drops
cross-org results when the Supabase client queries `.in("vehicle_number")`.
GOGOVAN Compliance showed "No vehicle assigned" for 20 trips whose trucks were
registered in the supplier's organization, not GOGOVAN's. Affects any aggregate
org using supplier-dispatched vehicles.

## Areas
- `features/tripCompliance/` — service layer + tests
- `supabase/migrations/` — new RPC
- `supabase/release-sets/` — preprod + prod sets

## Migrations
- `20261112061609_compliance_vehicle_vault_by_plate.sql`
  - SECURITY DEFINER, `search_path = ''`, fully qualified refs
  - Authorization via `private.compliance_visible_trips`
  - Vehicle scoped to supplier `linked_organization_id` only
  - `DISTINCT ON (trip_id)` with `v.created_at DESC, v.id DESC` tie-breaker
  - Revoked from PUBLIC/anon, granted to authenticated/service_role
  - SHA-256: `07518c2f53a49d8079e562c0fd40c76e3e452f48de432e08a8416fe00e62f63e`
  - Applied to preprod, verified. NOT applied to prod.

## Tested
- 31 unit/contract tests (vehicleViewerTripDedup + vehicleVaultByPlate)
- 795 compliance suite tests (all green)
- Preprod runtime: 13/65 GOGOVAN plate-only trips now resolve; unauthorized viewer returns 0 rows
- Format mismatch tested: trip "TN 31 BK 5694" matched vehicle "TN31BK5694"
- Production confirmed untouched (no RPC, no migration record)
