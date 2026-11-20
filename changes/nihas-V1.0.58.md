# nihas/V1.0.58

Branched from V1 `617de36a` on 2026-11-20.

## What
- One rule for which copy of a vehicle / driver document counts (`features/compliance/utils/currentDocument.util.ts`): live copies only (not replaced / rejected), dated copies first, then newest. A live copy older than a newer live copy with a different expiry is superseded (history). Pages of one document share an expiry and stay together.
- Readers use that rule: Compliance queue (Pending Docs routing), checklist, Ground Ops transit gate, vehicle document reuse, Trip Detail score (expired / missing counts).
- Uploading onto a filled slot asks Replace or Add page (Compliance screen, Trip Detail vehicle, Trip Detail driver licence / Aadhaar). Replace asks for a new expiry and marks the previously live rows `replaced` (rows and files kept). Add page keeps the entered expiry (Trip Detail used to drop it).
- Trip Detail delete on a partner truck deletes the real `entity_documents` row. `vehicles.documents` deletes now fail when no row matched (they used to report success) and remove storage only after the row changed. Trip Detail vehicle list puts the current copy in the slot.
- Partner-truck Approve verifies only the viewer-org row holding the file on screen; it never approves a different copy, and a vault extra page no longer marks the slot's main file.
- Migration `20261120055411_entity_documents_superseded_readers.sql` (release set `entity-documents-superseded-readers`): `get_compliance_summary`, `get_expiring_documents`, `compute_compliance_score`, `is_compliance_blocking` skip superseded rows; adds `private.entity_document_is_superseded`.
- Manual rollback `supabase/release-manual/20261120055411_entity_documents_superseded_readers.rollback.sql`.

## Why
- SAT812GOGTRIP002582 / 002700 stayed out of the Compliance queue after a renewed insurance was uploaded: the old expired copy was never retired and the queue judged the slot by whichever copy came first in random id order.
- Trip Detail delete on those partner trucks reported "Deleted" while changing nothing (prod API logs, 19 Nov: 8 PATCH /vehicles 204 against the wrong org). Compliance uploads silently took the old file's expiry.
- Dashboard counts, the expiring list, score and blocking counted superseded copies (and summary counted replaced / rejected rows as expired).

## Areas
- features/compliance/utils (currentDocument.util, complianceScore.util)
- features/tripCompliance/utils (checklist, rows, transit gate), services/vehicleDocumentReuse.service.ts
- features/compliance/services/documents.service.ts (listLiveEntityDocumentIds, supersedeEntityDocuments)
- features/tripCompliance (vault upload, approve, workspace, crossPlatformAlert, complianceVaultDocuments.util)
- features/trips/components/trip-detail/TripDetailScreen.tsx, features/vehicles/services/vehicleDocuments.service.ts
- supabase/migrations, supabase/release-sets, supabase/release-manual

## Migrations
- None in this commit.
- 20261120055411 via release set `entity-documents-superseded-readers` only (db-push-set). Not applied anywhere yet.

## Tested
- Jest: currentDocument.util (old/new expiry both ways, pages, undated, replaced/rejected), complianceChecklist.
- Jest: supersede / snapshot service, partner-truck delete (reproduces the 0-row success), approve (dated, undated, different file, extra page).
- Migration forward -> rollback -> forward in a throwaway local Postgres 17: rollback restores all four definitions and grants byte-identically (md5 of pg_get_functiondef) and outputs identical to before.
- Rollback source checked: replaying 20260828010000 + prod-recorded 20270915103200 reproduces production's live definitions exactly.
- Jest: release-set pin test, migration contract.

## Not tested
- App click-through on preprod (Replace / Add page prompts on web and native, partner-truck delete, approve, Ground Ops upload).
- Approve now refuses when the file on screen is the owner's record and GOGOVAN has no copy of that exact file (7 of 22 partner-truck slots on prod today); approval does not gate the queue or Mark Verified.
- Preprod / prod apply (release-set path; preprod by Nihas, prod needs Vasanth's GO).
