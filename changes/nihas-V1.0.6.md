# nihas V1.0.6 — Finance feedback (Dhira, 14 and 19 Oct): advance export, memo preview, labels

## What
- Advance Verification export: the "% of advance" column (showed 90, 90, 90) is now the advance amount = S Price × advance %. Heading reads "90% Advance" when every trip in the report uses the same %, otherwise "Advance".
- Advance Payment panel: Memo "Preview" opens the memo in the in-app viewer (zoom, rotate, full screen) instead of the raw file in a new browser tab. Falls back to the old new-tab behaviour when the Finance list has no memo file.
- Advance Payment panel: shows "Client rate / MT" and "Supplier rate / MT" only when the trip is priced per MT.
- Reject reason "Client date mismatch" renamed to "Client rate mismatch" and moved to the Compliance Pending group (like "Vendor rate mismatch"). Server routing already sends this text to compliance_pending, so no migration. Older rejects carrying "Client date mismatch" still resolve to Pending Docs.
- Supplier Lane performance: labels read "Cost", "Open AP", "AP aging" and "No open payables." for suppliers (amounts were already payable figures). Clients unchanged.

## Why
- Dhira (Finance), "Pulse feedback 14.10.2026" points 1, 4, 6, 9 and "Gogopulse feedback_19.10.2026" point 2 plus her 21 Oct follow-up.
- Not code: Reject missing on prod was Dhira's stored permissions (fixed by admin 21 Oct); documentation charges 0.00 on prod was missing Document Charge slabs for GOGOVAN INDIA (added by admin 21 Oct, same as preprod).

## Areas
- features/tripCompliance (export util + service, payment panel, document workspace, reject reasons), features/clients (Lane performance labels).

## Migrations
- None

## Tested
- Full jest 518 suites / 4079 tests pass (new: "90% Advance" heading, Advance amount, Client rate mismatch routing). ci-baseline lint 104, typecheck 64 (≤89), cycles 111, lib-files 178; navigation-policy 64 pass; git diff --check clean. Not clicked through in the UI.
