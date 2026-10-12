# nihas team-sync-v1.0.1 — Compliance finance approval and resubmit flow

## What
- Database for the new Compliance flow: a Finance "Approve Advance" step before the advance can be posted, Reject / Compliance Hold that waits for a Ground Ops resubmit with a note, and gates so Verify cannot skip the resubmit and Resubmit cannot skip required files.
- Compliance screen for the new flow: Advance Verification (read-only review + Approve Advance with undo), Advance Payment form with UTR, transaction date (typed or calendar) and optional paid-from bank, tab renames, Resubmit with a note, Verify blocked until resubmit, preset Decline reasons, and one row per document type with a files dialog (preview full screen, replace, remove, add).
- Hardening database: Resubmit now checks vehicle and driver files and that trip files exist in storage; Finance can flag a trip for Compliance (blocks the advance); approved and post-verify required files cannot be deleted; payments record the paid-from bank account.
- Hardening screens: Flag to Compliance for Finance and a Flagged by finance list for Compliance, Replace swaps the file in place (no duplicates), required files locked after verify, paid-from bank saved on the payment, calendar allows tomorrow like typing, Advance Processed sub-tab under Awaiting POD, clearer Verify error, and the Compliance sub-filter wraps instead of being cut off.
- Finance feedback fixes: Finance Reject permission (no verify), truck type shows size, flagged trips show "Flagged" and export as "Flagged for Compliance", Rate per MT only for per-MT rates, Advance Verification has one list, trip panel and payment form scroll instead of cutting values off, Trip Ops get Resubmit by default.
- Verifier fixes: Upload / Replace / Remove on trip files only for people with Resubmit (Ground Ops) or Finance on finance files; once zoomed in, scroll moves the document and Ctrl+scroll or pinch zooms; a verified delivered trip stays in Advance Verification / Advance Payment until the advance is posted (still listed under Awaiting POD).
- Trip numbers past 999 no longer get cut to 3 digits (TRP1007 became TRP100 and clashed), which made trip conversion fail.
- Decline reasons per tab: each tab's Decline shows only Trip, Vehicle or Driver reasons; the whole-trip Decline is pre-filled from the declined documents (grouped by reason); Ground Ops sees each declined document's reason on its row and in the files dialog.
- Zoomed document preview no longer goes blank after dragging or scrolling (inline and full screen).
- Member access rework: one department per permission (Finance, Sales / Network, Operations, Supply, Vendor support, Compliance, Debit control, IT dept), new Vendor support role, Finance-only Compliance tabs, Sales books trips and owns indents, Invite uses the same access editor as Edit member, and pages that were open by link now check their own toggle.
- New Debit control role (hard-copy POD and the Debit Control page, read-only trips and documents, no payments), and picking Sales / Finance / TripOps now saves that exact role instead of re-deriving it.

## Why
- Finance needs to check the advance values before money goes out, and trips sent back for fixes were either stuck or could be verified without Ground Ops fixing anything.
- Ground Ops can fix and resubmit from any Document Upload view, Compliance gets clear reasons, and duplicate per-file rows (Invoice 1, 2, 3) were hard to manage.
- Close gaps found in the end-to-end audit before release.
- Finance had no in-app way to raise a problem, and small issues from the audit (duplicates on replace, unreachable Advance Processed export, misleading error text, cut-off filter).
- Dhira's 11 Oct feedback (truck size blocker, export confusion, missing Reject, wrong per-MT, cut-off screens) and stuck holds because no Ground Ops user could resubmit.
- Dinesh's 12 Oct feedback: a compliance verifier could replace or delete trip files, zoomed documents could not be moved around on Windows, and a delivered but unpaid trip skipped Finance after Verify.
- GoGoVan prod hit trip 1007 and conversions started failing on a duplicate trip number.
- Dinesh's trip Decline opened empty after declining documents, a driver reason could be picked on trip files, and Ground Ops never saw per-document reasons.
- At 400% a small drag sent the page off-screen because the move was multiplied by the zoom on every redraw.
- Permissions were duplicated across departments, Trip Ops had indents, Compliance saw settlement and POD, the invite flow only saved role defaults, and several finance / POD / audit pages could be opened by any member with a direct link (12 Oct audit).
- GoGoVan needed a Debit control desk (Gayatri, Sathish), and saving a Sales member stored TripOps because Sales also has the Trips tab.

## Areas
- Supabase migrations and RPCs for trips compliance (finance approval, reject, decline, resubmit, verify).
- Compliance screen, document panel, payment form, decline / resubmit dialogs, queue counts and routing, RBAC (new trip_compliance.trip.resubmit surface for Ground Ops).
- Supabase RPCs, RLS and triggers on trips, trip_documents and transactions.
- Compliance screen, document panel and files dialog, payment form, finance ledger insert (paid-from), trip document upload (replace by id), segmented filter.
- Compliance screen and panels, payment form, export, RBAC presets, truck type lookups.
- Compliance document panel and files dialog (edit permission), document preview (zoom / pan), compliance stage rule.
- Trip numbering trigger on trips (set_trip_operational_identity).
- Compliance document panel, decline dialog, files dialog, decline reason presets.
- Compliance document preview (zoom / pan).
- RBAC surface catalog and presets, member permissions panel and invite flow, invite service, Compliance page tab visibility, route gates for Finance Pro, invoicing, POD, Debit Control, ledger entry and audit, team invite buttons.
- RBAC role presets and the shared permissions builder used by Invite and Edit member.

## Migrations
- 20271008112000_finance_verified_step.sql, 20271008113000_compliance_reject_resubmit.sql, 20271008114000_compliance_hold_resubmit.sql, 20271008115000_compliance_resubmit_note.sql, 20271008116000_compliance_resubmit_gates.sql (all applied to preprod only; prod untouched). Release set: supabase/release-sets/preprod-finance-resubmit.versions.
- None (uses the migrations from the previous commit).
- 20271008117000_compliance_flow_hardening.sql (applied to preprod only; prod untouched).
- None (uses 20271008117000 from the previous commit).
- 20271008118000_finance_reject_truck_size.sql (applied to preprod only; prod untouched). Preprod GoGoVan member permissions updated (Dhira, Amilthan, 12 Trip Ops).
- None.
- 20271008119000_fix_trip_number_truncation.sql (applied to preprod only; prod needs Vasanth to run it). Added to the release set.
- None.
- None.
- None (server checks leaf surface flags only). Existing preprod members keep their saved access; reset list prepared for review, nothing written.
- None. Preprod GoGoVan members updated directly (8 rows, rollback SQL kept): Daisy, Praveen, Sandra → Sales; Dihya → Vendor support; Dineshkumar, Vaishnave → Compliance; Gayatri, Sathish → Debit control.

## Tested
- Migration contract tests (local). 33 SQL scenarios for the resubmit gates ran on preprod inside a rolled-back transaction, all passed; then 116000 was applied to preprod with approval.
- Local CI checks: lint 104/104, cycles 111/111, lib files 178/178, V2 isolation and navigation policy pass, typecheck under baseline (local 64 vs CI 89), Jest only the 4 known failing suites. Not clicked through end to end on localhost.
- Hardening: 23 rolled-back SQL scenarios on preprod (file check, flag lifecycle, delete lock, paid-from account) all passed before applying; local CI checks at or under baseline, Jest only the 4 known failing suites.
- Hardening screens: 584 compliance tests and 909 compliance + finance tests pass locally; not clicked through on localhost yet.
- Finance feedback: 7 rolled-back SQL checks on preprod (Finance Reject allowed, Verify still refused, posted money refused, truck size returned) passed before applying; 628 compliance + RBAC tests pass. Not clicked through yet.
- 589 compliance tests pass locally (4 stage expectations updated to the new rule); lint clean on changed files; no new type errors. Not clicked through on localhost.
- Checked against prod read-only: the old code turns 1007 into TRP100, which already exists; applied to preprod.
- 594 compliance tests pass locally (new prefill / per-tab tests); lint clean on changed files; no new type errors. Not clicked through on localhost.
- 594 compliance tests pass locally. Not clicked through on localhost.
- RBAC + organization tests (role matrix on HYBRID / Asset / Aggregate, invite vs edit parity, Ground Ops only Document Upload) pass; full Jest only the 4 known failing suites; no new type errors; cycles 111/111; navigation policy pass. Edit member and Invite step 2 clicked through on localhost without saving; newly gated pages not clicked through.
- 108 RBAC + organization tests pass (new Debit control and keep-picked-role tests); no new type errors. Preprod rows checked after the update; not clicked through as those users.
