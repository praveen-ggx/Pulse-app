# vasanth/compliance-resubmit-preview

## What

- Preview a resubmitted Compliance document from its current storage path, even when a leftover vault pin remains on the row.
- After reject + replace, retarget the reviewer preview off the rejected extra onto the new pending file.
- Clear `source_entity_document_id` on replace-upload so the next review does not pin the rejected vault row.
- Show a useful error when signing fails instead of a blank preview.

## Why

Rejected documents that were corrected and sent back to verification could not be previewed. Classification and signing treated the stale `source_entity_document_id` as the current file.

## Areas

- `features/tripCompliance/utils/tripDocumentClassification.util.ts`
- `features/tripCompliance/services/vehicleDocumentReuse.service.ts`
- `features/tripCompliance/utils/complianceDocumentRows.util.ts`
- `features/trips/services/tripDocuments.service.ts`
- `features/tripCompliance/components/ComplianceDocumentWorkspace.tsx`

## Migrations

None.

## Tested

- Focused Jest: classification, document rows, vehicle reuse preview, signed-URL cache, review actions.
- Browser reject → replace → preview cycle: not clicked through.
