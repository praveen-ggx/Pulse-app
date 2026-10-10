# nihas team-sync-v1.0.1 — Compliance finance approval and resubmit flow

## What
- Database for the new Compliance flow: a Finance "Approve Advance" step before the advance can be posted, Reject / Compliance Hold that waits for a Ground Ops resubmit with a note, and gates so Verify cannot skip the resubmit and Resubmit cannot skip required files.

## Why
- Finance needs to check the advance values before money goes out, and trips sent back for fixes were either stuck or could be verified without Ground Ops fixing anything.

## Areas
- Supabase migrations and RPCs for trips compliance (finance approval, reject, decline, resubmit, verify).

## Migrations
- 20271008112000_finance_verified_step.sql, 20271008113000_compliance_reject_resubmit.sql, 20271008114000_compliance_hold_resubmit.sql, 20271008115000_compliance_resubmit_note.sql, 20271008116000_compliance_resubmit_gates.sql (all applied to preprod only; prod untouched). Release set: supabase/release-sets/preprod-finance-resubmit.versions.

## Tested
- Migration contract tests (local). 33 SQL scenarios for the resubmit gates ran on preprod inside a rolled-back transaction, all passed; then 116000 was applied to preprod with approval.
