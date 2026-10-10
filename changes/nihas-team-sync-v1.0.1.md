# nihas team-sync-v1.0.1 — Compliance finance approval and resubmit flow

## What
- Database for the new Compliance flow: a Finance "Approve Advance" step before the advance can be posted, Reject / Compliance Hold that waits for a Ground Ops resubmit with a note, and gates so Verify cannot skip the resubmit and Resubmit cannot skip required files.
- Compliance screen for the new flow: Advance Verification (read-only review + Approve Advance with undo), Advance Payment form with UTR, transaction date (typed or calendar) and optional paid-from bank, tab renames, Resubmit with a note, Verify blocked until resubmit, preset Decline reasons, and one row per document type with a files dialog (preview full screen, replace, remove, add).

## Why
- Finance needs to check the advance values before money goes out, and trips sent back for fixes were either stuck or could be verified without Ground Ops fixing anything.
- Ground Ops can fix and resubmit from any Document Upload view, Compliance gets clear reasons, and duplicate per-file rows (Invoice 1, 2, 3) were hard to manage.

## Areas
- Supabase migrations and RPCs for trips compliance (finance approval, reject, decline, resubmit, verify).
- Compliance screen, document panel, payment form, decline / resubmit dialogs, queue counts and routing, RBAC (new trip_compliance.trip.resubmit surface for Ground Ops).

## Migrations
- 20271008112000_finance_verified_step.sql, 20271008113000_compliance_reject_resubmit.sql, 20271008114000_compliance_hold_resubmit.sql, 20271008115000_compliance_resubmit_note.sql, 20271008116000_compliance_resubmit_gates.sql (all applied to preprod only; prod untouched). Release set: supabase/release-sets/preprod-finance-resubmit.versions.
- None (uses the migrations from the previous commit).

## Tested
- Migration contract tests (local). 33 SQL scenarios for the resubmit gates ran on preprod inside a rolled-back transaction, all passed; then 116000 was applied to preprod with approval.
- Local CI checks: lint 104/104, cycles 111/111, lib files 178/178, V2 isolation and navigation policy pass, typecheck under baseline (local 64 vs CI 89), Jest only the 4 known failing suites. Not clicked through end to end on localhost.
