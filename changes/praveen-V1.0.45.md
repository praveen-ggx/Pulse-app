# praveen/V1.0.45

## What
- Ops SQL only: identify Apollo truck-type mismatch trips on TN13Y7553 / TN18AH7051 (incl. trip **002650**), and a **commented** `UPDATE` to set TN13Y7553 `vehicle_size` → `20 FT` after Daisy + SIVAN E owner approve. Capacity left untouched until Daisy confirms.
- **Display / indent-preference change is parked** (reverted from this branch). It reversed Dhira’s 11 Oct rule (`20271008118000_finance_reject_truck_size.sql`: Finance sees assigned vehicle `type · size` because size drives pricing). Needs explicit Dhira + Vasanth approval before any re-land, plus release set, pinning Jest test, `supabase migration new` timestamp, RLS-aligned single source for list/modal/export, and tests for RPC precedence / other-org viewers.

## Why
- 7 of 8 Apollo trips use TN13Y7553 registered as Closed Container · **24 MT** (wrong); Daisy confirmed real size is **20 FT**. Fixing the vehicle master alone clears those advances’ false “truck type mismatch” labels without changing Finance’s vehicle display rule.
- Trip **002650** uses TN18AH7051 (Open Body Truck · 20 FT, Half Body). Size already matches indent `20 FT`; open question is body type (Open/Half vs Closed Container) — Daisy must confirm; no UPDATE in this PR.

## Areas
- `scripts/sql/fix_tn13y7553_vehicle_size_apollo_truck_type.sql`
- `changes/praveen-V1.0.45.md`

## Migrations
- None in this PR (indent-preference migration removed pending product approval).

## Tested
- Read-only preprod earlier: TN13Y7553 = Closed Container · 24 MT · capacity 12; peers Closed Container · 20 FT are capacity 6–7. TN18AH7051 = Open Body Truck · 20 FT · Half Body.
- Vehicle UPDATE not applied (owner org SIVAN E). Script for Daisy/owner/Nihas only.
- No UI/code path change in the settled branch tip — Finance still shows vehicle `type · size` per Dhira’s rule.
