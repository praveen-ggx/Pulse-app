# vasanth vault-preview-delete V1.0.1

## What
- Vault preview cache identity (path + version) and PDF thumb raster cache.
- Workspace delete: database row first, then storage; leftover-file error if storage fails after the row is gone.
- Audit history lookup includes delete events with `document_id` NULL via `metadata.document_id`.

## Why
- Failed workspace deletes must not remove storage first.
- After a delete audit row is written with a null FK, history must still be findable.

## Areas
- `components/documentPreviewPipeline.util.ts`
- `components/pdfEmbedCache.util.ts`
- `components/PdfViewer.web.tsx`
- `features/compliance/services/documents.service.ts`
- `features/compliance/utils/documentAuditLookup.util.ts`
- `features/trips/services/tripDocuments.service.ts`

## Migrations
- None. Do not apply `20271024194500` from this PR.

## Tested
- Focused Jest listed in the PR body.

## Production limitation
- `entity_documents` AFTER DELETE still inserts `document_audit_log.document_id = OLD.id` until the separate audit-trigger migration is applied. Workspace-document delete can still fail the FK on production. This PR does not change that trigger.
