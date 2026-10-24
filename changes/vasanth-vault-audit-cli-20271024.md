# Vault audit-delete CLI + migration file

## What
- Pin one Supabase CLI binary for `db:push-set` and avoid `--workdir` losing login.
- Add `20271024194500` vault delete-audit migration and its release set.

## Why
Workspace document delete fails unless the audit trigger writes `document_id` NULL.

## Areas
scripts/db-push-set.sh, scripts/pin-supabase-cli.sh, supabase/migrations, supabase/release-sets

## Migrations
20271024194500_entity_documents_audit_delete_null_fk.sql (not applied by this commit)

## Tested
CLI dry-run blocked on missing access token in the agent session. Not applied from this branch.
