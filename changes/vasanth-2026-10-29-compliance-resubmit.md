# vasanth 2026-10-29 — Compliance Resubmit + document preview

## What
- Resubmit confirmation shows post-hold upload/delete change log; note for Compliance counts only the Ground Ops remark toward 500.
- Hold Resubmit is attachment-only in the app (expired Insurance with a file on slot no longer greys Resubmit).
- Migration `20271029223000_compliance_resubmit_attachment_only.sql` aligns `compliance_missing_required_files` the same way (Nihas applies on preprod; not from this machine).
- Activity/preview fixes for vehicle entity docs, audit create metadata, and related preview signing.

## Why
Ground Ops could not Resubmit after fixing files: expired Insurance was treated as missing, and the change-log note blew the 500-character limit.

## Areas
- `features/tripCompliance/**` (Resubmit modal, workspace, table status, change log util)
- `features/trips/**` (activity, vault preview)
- `supabase/migrations/20271029174500_entity_documents_audit_insert_metadata.sql`
- `supabase/migrations/20271029223000_compliance_resubmit_attachment_only.sql`

## Migrations
- `20271029174500_entity_documents_audit_insert_metadata.sql` — entity INSERT audit metadata
- `20271029223000_compliance_resubmit_attachment_only.sql` — Resubmit RPC attachment-only (preprod by Nihas)

## Tested
- Unit/contract tests for change log, table status, attachment-only migration.
- Not clicked through on production. Preprod acceptance after migration: expired Insurance Resubmit OK; missing/rejected still fail.
