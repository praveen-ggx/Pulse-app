# Trip Documents ("Vault" / "Asset Vault")

End-to-end reference for how trip documents are uploaded, stored, read, replaced, and deleted.

- **Code facts**: taken from branch `nihas/V1.0.18` @ `5908a86a`.
- **Database facts** (columns, constraints, policies, bucket config, function bodies): read live from **preprod** (`xbisiveavvbifbzyfhgy`) on 2026-10-06.
- **Prod check** (`nafxpivddesgsrthmosv`), done read-only on 2026-10-06. Results are in §11. Prod matches preprod for every function and policy covered here, for realtime membership, and for bucket config. The one difference is the `document_type` allowed list (§2.1).
- Everything in §1–§10 describes **current behaviour**. Fixes that are planned but **not implemented** are listed separately in §12.

---

## 1. What the feature is called in the app

| Where | Name shown |
|---|---|
| Trip Detail, desktop/web tab | **Asset Vault** (shield icon) |
| Trip Detail, mobile chip | **Vault** |
| Success toast | "… is saved in the vault." |
| Code | "vault", "trip documents", `trip_documents` |

The tab only appears when the member has the `tripops.trips.docs` surface (`canTripDocsTab`, [TripDetailScreen.tsx:759](../features/trips/components/trip-detail/TripDetailScreen.tsx#L759)).

---

## 2. Data model

### 2.1 Table `public.trip_documents`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `trip_id` | uuid | no | | FK → `trips(id)` **ON DELETE CASCADE** |
| `file_name` | text | no | | Original file name (or `lr-fields.json` / `eway-fields.json` for metadata rows) |
| `storage_path` | text | no | | Object key in bucket `trip-documents`. **UNIQUE**. Can be the synthetic `ref:vehicle-document:…` (see §7.4) |
| `mime_type` | text | yes | | |
| `size_bytes` | bigint | yes | | |
| `uploaded_at` | timestamptz | no | `now()` | |
| `uploaded_by` | uuid | yes | | FK → `auth.users` ON DELETE SET NULL |
| `document_type` | text | no | `'pod'` | CHECK list below |
| `document_number` | text | yes | | LR / invoice / e-way number. Can be plain text **or JSON** (see §2.3) |
| `ocr_job_id` | uuid | yes | | FK → `ocr_jobs` ON DELETE SET NULL |
| `stop_id` | uuid | yes | | FK → `execution_plan_stops` (multi-stop pickup/delivery proof) |
| `status` | text | no | `'pending'` | CHECK `pending \| verified \| rejected` (Compliance) |
| `verified_by` | uuid | yes | | FK → `auth.users` |
| `verified_at` | timestamptz | yes | | |
| `rejection_reason` | text | yes | | |
| `source_entity_document_id` | uuid | yes | | FK → `entity_documents` ON DELETE SET NULL (reused vehicle RC/insurance) |

**`document_type` CHECK (`trip_documents_document_type_check`):**
`manifest, pod, soft_pod, pod_soft, invoice, memo, other, bank_docs, eway_bill, loading_slip, odometer_start_photo, odometer_end_photo, fuel_bill_photo, toll_receipt_photo, trip_expense_receipt_photo, maintenance_invoice_photo, lr, insurance, rc`

**Prod schema drift (confirmed on prod, 2026-10-06):**

- Prod is missing five trip-document migration versions that the repo and preprod have (54 of 59 applied): `20270922163000`, `20270925110000`, `20270929194800`, `20270929203000`, `20270930123100`.
- Prod's current `trip_documents_document_type_check` does **not** include `bank_docs`, so the database on prod rejects a `bank_docs` insert.
- Reconciliation is planned through the existing migration and merge process. No fix has been applied as part of this audit.

TS mirror: `TripDocumentType` in [tripDocuments.service.ts:109](../features/trips/services/tripDocuments.service.ts#L109) (omits the legacy `soft_pod` / `pod_soft`).

**Indexes:** `(trip_id)`, `(trip_id, document_type)`, `(trip_id, uploaded_at DESC)`, partial on `ocr_job_id`, `source_entity_document_id`, `uploaded_by`; plus `(stop_id)`.
**Triggers:** none.

### 2.2 Storage bucket `trip-documents`

| Setting | Value (preprod and prod, identical) |
|---|---|
| `public` | `false` (private; all reads go through signed URLs) |
| `file_size_limit` | `NULL` — no server-side limit |
| `allowed_mime_types` | `NULL` — no server-side restriction |

**Object key layout**

| Path | Written by |
|---|---|
| `{tripId}/{document_type}/{uuid}.{ext}` | `uploadTripDocument()` — the normal path |
| `{tripId}/pod/{random}-{ts}.{ext}` | `PodAttachmentModal` (direct upload, see §5.6) |
| `{tripId}/chat/{uuid}.{ext}` | `uploadTripChatImage()` — **no** `trip_documents` row |
| `trip_chat/{conversationId}/{uuid}.jpg` | Chat image upload (`features/chat/utils/chatImageUpload.util.ts`). Same bucket, but the first folder is `trip_chat`, not a trip id. **No** `trip_documents` row |
| `{tripId}/{file}` (no subfolder) | Legacy uploads; treated as `pod` by the storage fallback |
| `{tripId}/lr/fields.json` | Not a real object — metadata-only row for typed LR numbers |
| `{tripId}/eway_bill/fields.json` | Not a real object — metadata-only row for typed e-way fields |
| `ref:vehicle-document:…` | Not a real object — row reusing a vehicle's `entity_documents` file |

The link between a row and its file is only the `storage_path` text. There is no foreign key and no transaction covering both. A separate legacy bucket, `pod-documents`, still exists (1 object on prod); path normalizers in chat and compliance still strip a `pod-documents/` prefix.

### 2.3 `document_number` formats

| Type | Format | Helper |
|---|---|---|
| `lr` | Plain `"AI3583"`, or JSON `{"lrNumber","date","invoice"}` when a date/invoice is present. Multiple LRs: `"A1, A2"` | `serializeLrFieldValues` / `parseLrFieldValues` in `features/trips/services/lrDocumentOcr.util.ts` |
| `lr` (generated eLR) | eLR snapshot | `serializeElrDocumentNumber` / `readStoredElrSnapshot` |
| `invoice` | Plain invoice number (one per file) | `readStoredInvoiceNumber` in [tripDocTypes.ts](../features/trips/components/trip-detail/tripDocTypes.ts) |
| `eway_bill` | JSON `{ewayNo, createdDate, validTill, docNo, entries:[…]}` | `serializeEwayFieldEntries` in `features/trips/services/ewayBillFields.util.ts` |

### 2.4 Related tables

| Table | Role |
|---|---|
| `document_audit_log` | Written on **replace** (client-side, `action='replaced'`) and on **verify/reject** (`verify_trip_document` RPC). `entity_type='trip_document'`, `entity_id = trip_documents.id` |
| `trip_workflow_events` | `pod.uploaded` milestone on every POD upload |
| `ocr_jobs` | LR OCR jobs; joined back through `ocr_job_id` |
| `trips.pod_*` columns | **Hard-copy** POD state (physical receipt). Separate from the digital POD rows in `trip_documents` |
| `entity_documents` + bucket `vehicle-documents` | Vehicle RC / Insurance / Fitness / PUC shown in the vault (not stored in `trip_documents`) |
| Bucket `compliance-documents` | Driver licence / Aadhaar shown in the vault (not stored in `trip_documents`) |

---

## 3. Access control

### 3.1 App-level gates

| Gate | Where | Rule |
|---|---|---|
| See the Vault tab | `canTripDocsTab` | surface `tripops.trips.docs` |
| Upload / delete in the vault | `canUploadTripDocs` ([TripDetailScreen.tsx:4009](../features/trips/components/trip-detail/TripDetailScreen.tsx#L4009)) | viewer's current org **=** `trip.organization_id`, and for `ground_ops` members the org toggle `groundOpsDocUploadEnabled` must be on |
| Per-card mutate | `canMutateTripVaultDoc()` ([tripDocTypes.ts](../features/trips/components/trip-detail/tripDocTypes.ts)) | `canUploadTripDocs` only. Trip completion does **not** lock it |
| Hard-copy POD | `canManageHardCopyPod` | surface `trip_compliance.pod.manage` |
| Compliance verify/reject | `verify_trip_document` RPC | surface `trip_compliance.documents.verify` |

### 3.2 RLS on `public.trip_documents`

| Policy | Cmd | Rule |
|---|---|---|
| `trip_documents_select_fast` | SELECT | `can_read_trip_document(trip_id)` |
| `trip_documents_org_member_insert` | INSERT | `can_insert_trip_document(trip_id)` |
| `trip_documents_driver_insert` | INSERT | The trip's assigned driver (`drivers.user_id = auth.uid()`) |
| `trip_documents_org_member_manage` | ALL | Active member of the trip's org with `role IN (owner, admin, member, dispatcher, finance)` |

Helper functions (all `SECURITY DEFINER`):

- **`can_read_trip_document(p_trip_id)`** — `is_org_member(trip.organization_id)` OR caller is the trip's driver.
- **`can_insert_trip_document(p_trip_id)`** — any active non-ground-ops member → true. Ground-ops member → needs `organizations.settings.groundOpsDocUploadEnabled = true` **and** a warehouse assignment matching the trip's indent / sales order / execution plan.

### 3.3 Storage policies (`storage.objects`, bucket `trip-documents`)

| Policy | Cmd | Rule |
|---|---|---|
| Allow authenticated reads to trip-documents | SELECT | `bucket_id = 'trip-documents'` only |
| Suppliers can list storage folders | SELECT | `bucket_id = 'trip-documents'` only |
| trip-documents: org-member via security-definer | SELECT | `fn_storage_trip_doc_access(name)` (first folder = trip id, caller is an active org member) |
| Allow authenticated uploads to trip-documents | INSERT | `bucket_id = 'trip-documents'` only |
| Allow authenticated users to update their files | UPDATE | `auth.uid() = owner` |
| Allow authenticated users to delete their files | DELETE | `auth.uid() = owner` |
| Trip access can delete trip-documents objects in trip folder | DELETE | Trip's driver, or active org member, where folder 1 = trip id |

**Storage access is broader than table access.** The two read policies that only check the bucket mean any signed-in user can read or list any trip's files, and the upload policy lets any signed-in user write anywhere in the bucket (§11).

**Cross-org previews currently depend on that.** The bundle RPC (§7.1) gives document rows to supplier-linked and client-linked orgs, but `fn_storage_trip_doc_access` only allows members of the trip's own org, and drivers aren't covered by it either. Today, supplier, client and driver previews work **only because of the open read policy**. Any tightening has to account for this (§12).

### 3.4 Who can upload, from where, and at which trip status

**At the database level there is no trip-status rule anywhere.** None of the RLS policies (§3.2, §3.3) look at `trips.status`. Every status limit in the table below is enforced only by the app screen.

| Who | Where (screen) | What they can upload | Permission check (app) | Trip status allowed |
|---|---|---|---|---|
| Org member of the **trip's own org** (owner, admin, dispatcher, finance, member) | Trip Detail → **Asset Vault / Vault** | LR, Invoice, Memo, Other, Bank Docs, E-way bill, Driver POD (plus vehicle and driver ID docs, which go to other stores) | Surface `tripops.trips.docs` to see the tab. To upload, the viewer's current org must equal `trip.organization_id` (`canUploadTripDocs`). | **Any.** There is no lock: `canMutateTripVaultDoc` ignores `tripCompleted`, so completed trips are open too. Cancelled trips are not blocked in code. |
| Ground-ops member | Trip Detail → Vault | Same as above | As above, **plus** the org setting `groundOpsDocUploadEnabled` must be on. `can_insert_trip_document` also needs a warehouse match, **but the database doesn't enforce it**: the manage policy lets ground-ops members (role `member`) write to every trip in the org (§11, finding 2). | Any |
| Viewer from **another org** (supplier or client viewing a shared trip) | Trip Detail → Vault | Nothing. Read-only. | `canUploadTripDocs` is false because the org doesn't match. | — |
| **Driver** assigned to the trip | Driver app job card (`DriverTripFlowCard`) → **LR / pickup proof** page | `lr` (with LR number) | Logged-in driver on the trip. RLS policy `trip_documents_driver_insert`. | Only at the app's **LR sub-step**. The driver reaches it by tapping "Package collected" while the trip status is `picked_up` / `pickup` / `in_progress`; it ends when they tap "start transit" (status → `in_transit`). The driver can skip it. |
| Driver | Driver app job card → **POD** page | `pod` | Same | Only when the trip status is **`at_drop`** ("Reached"). Skippable. There is no upload button once the trip is `completed`. |
| Driver | Driver app job card → camera button | Chat photo (`{tripId}/chat/…`, **not** a `trip_documents` row) | Same | `accepted`, `pickup`, `transit` stages |
| Driver | Multi-stop job card (`persistStopDeliveryProof`) | `pod` with `stop_id` | Same | At each pickup or delivery stop |
| Driver | Driver control (`app/(driver)/control.tsx` → `DriverControlScreen`) | `pod`, `lr` | Same | No status check in the hook |
| Ops with surface **`trip_compliance.pod.manage`** | Trip Detail sidebar / Trips hub / Compliance → **Log Hard Copy POD** → POD photos | `pod` | `canManageHardCopyPod` | No status check in `HardCopyPodPhotoUpload` |
| Ops with **`finance_view`**, **`finance_manage`**, **`dispatch`**, or **`dispatch_for_own_fleet`** capability (not drivers) | **Log Incoming PODs** (`/log-incoming-pods`) → `PodAttachmentModal` | `pod` (direct insert) | `canAccessLogPods()` | Whatever trips the screen lists (its status filter was not checked) |
| Same capabilities | **POD Reconciliation** (`/pod-reconciliation`) → `PodLrNumberEditor` | LR numbers only (a metadata row, no file) | `canAccessPodManagement()` | Not checked in the editor |
| Ops in the trip's org, Compliance product active | **Compliance** (`/compliance` workspace and the panel in Trip Detail) | Required trip doc types (LR, invoice, e-way, POD, …), plus vehicle and driver docs to other stores | Varies by surface:<br>• **Trip Detail compliance table** (`ComplianceDocumentTable`): "Add" for a missing doc needs `trip_compliance.documents.verify` (`canVerify`).<br>• **Trip Detail reuse section** (`VehicleDocumentReuseSection`): uploading a new file needs `trip_compliance.documents.verify` (`canUploadFresh`).<br>• **`/compliance` workspace** (`ComplianceDocumentWorkspace`): Upload/Add needs only page access (Compliance product active + `trip_compliance.tab`) and sign-in. **No verify surface is checked.**<br>• Reusing a vehicle doc: `trip_compliance.documents.verify`, enforced in the `use_vehicle_document_for_trip` RPC.<br>The database insert itself is decided by the RLS in §3.2. | Any compliance stage. Verify/reject is gated separately. |
| Anyone who opens Trip Detail (no separate permission found in `ElrTripDetailAction`) | Trip Detail → **E-LR** action | Generated `lr` PDF (replaces the existing one) | A vehicle or driver must be assigned | Only **after loading**. It is blocked for `draft`, `cancelled`, `unassigned`, `assigned`, `confirmed`, `in_progress`, `pickup`, `s_in`, `source_in`, `loading`, `picked_up`. |
| Trip chat participant | Trip chat → document hub (`DocumentShareSheet`) | Default `loading_slip` | No app check found. RLS decides. | Not checked |
| Ops with `tripops.trips.expenses` **and** `finance.expenses.view` | Trip Detail → Expenses → Fuel / Toll / Other / Maintenance entry | `fuel_bill_photo`, `toll_receipt_photo`, `trip_expense_receipt_photo`, `maintenance_invoice_photo` | `canTripExpensesTab` | Only on trips where the expense hub shows: asset-execution trips, or trips with a vehicle that are DCO or commerce (`shouldShowTripExpenseHub`) |
| Ops with `tripops.trips.verification` | Trip Detail → **Verification** (`/trip/[id]/verification`) | `odometer_start_photo`, `odometer_end_photo` | `canTripVerification` | Not checked |

---

## 4. Vault screen layout (Trip Detail)

**Routes:** `app/trip/[id]/index.tsx`, `app/trip/[id]/index.web.tsx` → `TripDetailScreen`.

`app/finance-pro/trip/[id].tsx` is **not** the vault. It renders `FinanceProTripDetailScreen`, which only reads the digital-POD flag (`useInvoiceDigitalPodTripIdsQuery`).

**Main files**

| File | Role |
|---|---|
| [TripDetailScreen.tsx](../features/trips/components/trip-detail/TripDetailScreen.tsx) | All upload/preview/delete handlers and modals |
| [hooks/useTripDetail.ts](../features/trips/components/trip-detail/hooks/useTripDetail.ts) | Loads `tripDocuments` (held in `useState`, not TanStack Query), builds `computedTripDocs` (the cards), signs preview URLs, subscribes to realtime (which never fires, §7.1) |
| [TripVaultCardGrid.tsx](../features/trips/components/trip-detail/TripVaultCardGrid.tsx) | Desktop/web card grid |
| [TripMobileVaultPanel.tsx](../features/trips/components/trip-detail/TripMobileVaultPanel.tsx) | Mobile vault panel |
| [EwayBillVaultTab.tsx](../features/trips/components/trip-detail/EwayBillVaultTab.tsx) | E-way bill strip (`EwayBillLrStrip`, `buildEwayBillStripRows`) |
| [TripVaultFilePreview.tsx](../features/trips/components/trip-detail/TripVaultFilePreview.tsx) | Inline image/PDF preview |
| [tripDocTypes.ts](../features/trips/components/trip-detail/tripDocTypes.ts) | `TripDocItem`, `TripDocFile`, slot list, size/type limits, card label formatters |

### 4.1 Cards (`computedTripDocs`, [useTripDetail.ts:1281](../features/trips/components/trip-detail/hooks/useTripDetail.ts#L1281))

Every trip shows the same cards, in this order:

| Card id | Label | Source | `document_type` / store |
|---|---|---|---|
| `trip-details` | **Trip Details** | `trip_documents` | groups 5 slots: `lr`, `invoice`, `memo`, `other`, `bank_docs` |
| `eway_bill` | **Eway Bill** (shown as a strip, not a card) | `trip_documents` | `eway_bill` |
| `vehicle-documents` | **Vehicle Document** | `entity_documents` / `vehicle-documents` bucket | RC, Fitness, Insurance, PUC, extras |
| `driver-documents` | **Driver Details** | `compliance-documents` bucket | Licence, Aadhaar |
| `pod` | **Driver POD** | `trip_documents` | `pod` |

Card face shows: label, type summary (e.g. `LR · INVOICE · MEMO`), status (`Pending` / `Uploaded` / `Verified`), LR number (`LR No. …`), LR date, invoice numbers joined with `/`, upload date (`04-Sep-26` format).

### 4.2 UI input areas

| UI area | Opened by | Inputs |
|---|---|---|
| **Add document** chooser modal | "Add" on the vault | Trip Details · Vehicle Document · Driver Details · Driver POD |
| **Trip Details** modal (`tripDetailsFields`) | Trip Details card / "Add" | One row per slot (LR Document, Invoice, Memo, Other Documents, Bank Docs), each with **Upload / Add another** and **Preview**. The Bank Docs row also shows the supplier's bank proof (`fetchSupplierBankProofBundle`) |
| **Driver POD** modal (`driverPodFields`) | Driver POD card | **Upload Driver POD** button and a preview per file |
| **Vehicle Documents** chooser | Vehicle Document card | RC / Fitness / Insurance / PUC / additional (needs a vehicle on the trip) |
| **Driver Details** chooser | Driver Details card | Licence / Aadhaar (needs a driver on the trip) |
| File picker | Any upload action | `expo-document-picker`, `multiple: true` (single for driver ID and for vehicle compliance types). Types: PDF, JPEG, PNG, WebP, HEIC/HEIF |
| **Confirm upload** modal (`pendingVaultUpload`) | After picking files | File preview, extra-file list, limit hint (`PDF, JPEG, PNG, WebP · 10 MB max per file`). For **LR**: `LR No.` text field + `LR DATE` calendar, live duplicate check. For **Invoice**: one `Invoice no.` field per file. Buttons: **Cancel** / **Save to vault** |
| **E-way bill strip** | Always under the cards | `12-digit e-way number`, created date picker, valid-till date picker, `E-way document number`, Add / Remove / Cancel / Save, plus upload/view of the e-way file |
| **Preview** modal (`detail.selectedDoc`) | Pressing a card with files | Gallery when there are several files. Buttons: **Add another**, **Open**, **Delete**, **Close** |
| **Delete document?** confirm | Delete button | "Remove "X" from the vault? This cannot be undone." |
| **LR already exists** alert | Duplicate LR number | `ORG_LR_DUPLICATE_MESSAGE` |

---

## 5. Upload flows

### 5.1 Canonical service: `uploadTripDocument()`

[tripDocuments.service.ts:577](../features/trips/services/tripDocuments.service.ts#L577)

```
uploadTripDocument(tripId, uploadedBy, file, documentType = 'pod', documentNumber?, {
  stopId?, replaceExistingOfType?, organizationId?
})
```

1. Reject an empty file, or one over `MAX_TRIP_DOC_BYTES` (10 MB).
2. If `lr` and an LR number was given → `findOrgDuplicateLrNumberForTrip()`. A duplicate in the org is an error.
   - The check runs entirely in the client (`orgLrDuplicate.service.ts`): it loads every trip id in the org, then scans their LR rows.
   - It **fails open**: on a query error, it reports "no duplicate".
   - No database constraint backs it up.
   - In the vault it runs while typing (debounced), again on Save, and again here.
3. `storage.from('trip-documents').upload('{tripId}/{type}/{uuid}.{ext}', body, { upsert: false })`. **The file is written first.** If the row write in step 4 or 5 fails, the file is not removed.
4. If `replaceExistingOfType` and a row of that type exists → **UPDATE** that row (see §6.2).
5. Otherwise **INSERT** into `trip_documents`.
   - If the table is missing or not in the schema cache, it returns a synthetic `storage-meta-…` row (the file is still in storage).
   - On a `storage_path` unique conflict, it returns the existing row.
6. For `pod` only: `publishPodUploadedEvent()` →
   - `recordTripWorkflowEvent({ eventType: 'pod.uploaded' })` (`trip_workflow_events`)
   - Platform event bus `PODUploaded` `{ tripId, documentId, storagePath, fileName, uploadedBy }`

### 5.2 Trip Detail vault: step by step

```
User taps card / Add
  → startAddMoreForDoc / handleVaultCardPress           (TripDetailScreen)
  → Trip Details modal / Driver POD modal / choosers
  → handleVaultUpload(doc) | handleLRUpload()           DocumentPicker.getDocumentAsync
      · vaultPickerRejectionMessage() → size / type check
      · map card → document_type:
          lr→lr, invoice→invoice, memo→memo, other→other, bank_docs→bank_docs,
          eway→eway_bill, driver→pod, trip→manifest
      · setPendingVaultUpload(...)                      (nothing uploaded yet)
  → Confirm modal: user types LR No./date or invoice nos → "Save to vault"
  → confirmPendingVaultUpload()                         TripDetailScreen.tsx:1550
      · LR duplicate re-check
      · for each file: readFileAsArrayBuffer → 10 MB check
          → tripDocumentsService.uploadTripDocument(...)
          → updateTripDocumentNumber() if the number was not saved
          → detail.upsertTripDocument(row)              (optimistic local state)
      · LR with no typed fields → extractLrFieldsFromUploadedDocument() (OCR, background)
      · success alert "Uploaded"
```

With several files, they are uploaded one at a time and the loop stops at the first failure. Files already saved stay saved, and the user sees "Partial upload". No TanStack queries are invalidated after an upload, so other screens (for example the Trips hub LR/POD chips) update only when their own queries refetch.

Vehicle and driver-identity uploads branch off in the same `confirmPendingVaultUpload`:

- **Vehicle compliance:** `uploadAndSaveVehicleDocumentForTrip()`
- **Vehicle extras:** `uploadAndSaveVehicleExtraDocuments()`
- **Driver identity:** `uploadComplianceDocument()` / `replaceComplianceDocument()`

None of these write to `trip_documents`.

### 5.3 LR OCR

- On upload (no typed number), and as a one-time backfill when an uploaded LR has no `document_number` (`shouldAutoRunHistoricalLrOcr`): `extractLrFieldsFromUploadedDocument()` in `features/trips/services/lrDocumentOcr.service.ts`.
- It creates an `ocr_jobs` row (`scanType: 'pod_document'`), parses the LR number and date, then calls `updateTripDocumentNumber()`.
- On read, `attachLrOcrFields()` merges the latest OCR job into LR rows (only when `includeOcr` is true).

### 5.4 Typed-number-only rows (no file)

| Function | Used by | Behaviour |
|---|---|---|
| `upsertEwayBillFields()` | E-way strip **Save** (`saveEwayBillFields`, [TripDetailScreen.tsx:2658](../features/trips/components/trip-detail/TripDetailScreen.tsx#L2658)) | Updates `document_number` on an existing `eway_bill` row; otherwise inserts a metadata row at `{tripId}/eway_bill/fields.json` |
| `upsertTripLrNumbers()` | POD Reconciliation `PodLrNumberEditor` | Expands ranges (`expandLR`), checks org duplicates, writes the LR list onto one `lr` row and clears it on sibling rows; otherwise inserts `{tripId}/lr/fields.json` |
| `updateTripDocumentNumber()` | Vault confirm, OCR | Updates `document_number` (LR duplicate check) |

### 5.5 Other upload entry points (all through `uploadTripDocument` unless noted)

| UI | File | `document_type` | Notes |
|---|---|---|---|
| Driver app job card: POD (camera/library) | `features/driver/components/DriverTripFlowCard.tsx` (`uploadPod`) via `DriverPodCompletionPage` | `pod` | Image compressed (`optimizeImageForUpload`), 5 MB cap (`MAX_POD_IMAGE_BYTES`). Then shared into trip chat (`sendDocumentShareMessage`) |
| Driver app: LR | same (`uploadLr`) | `lr` | With LR number + duplicate check |
| Driver app: progress photo | same | — | `uploadTripChatImage()` → `{tripId}/chat/…`, **no table row** |
| Multi-stop pickup/delivery proof | `features/driver/job-card/persistStopDeliveryProof.ts` | `pod` | Sets `stop_id` |
| Driver control screen | `features/drivers/hooks/useTripDocumentsByType.ts` (`usePodDocuments`, `useLrDocuments`) → `DriverControlScreen.tsx` | `pod`, `lr` | |
| Hard-copy POD photos | `HardCopyPodPhotoUpload.tsx` inside `LogHardCopyPodModal.tsx` | `pod` | |
| Trip chat document hub | `features/chat/services/chatDocumentHub.service.ts` (`uploadChatHubTripDocument`) | default `loading_slip` | |
| Generated eLR PDF | `features/trips/services/elrGenerate.service.ts` (via `ElrTripDetailAction` / `ElrCompletionForm`) | `lr` | `replaceExistingOfType: true` when an LR exists |
| Compliance workspace / table | `complianceVaultUpload.service.ts`, `ComplianceDocumentTable.tsx`, `VehicleDocumentReuseSection.tsx` | per requirement | Table and reuse section use `replaceExistingOfType: true` |
| Odometer verification | `features/trips/verification/uploads/odometerUploads.ts` | `odometer_start_photo` / `odometer_end_photo` | |
| Fuel / Toll / Other / Maintenance expenses | `features/trips/operations/{fuel,toll,other,maintenance}/*.service.ts` | `fuel_bill_photo`, `toll_receipt_photo`, `trip_expense_receipt_photo`, `maintenance_invoice_photo` | |
| Log Incoming PODs → attachments | `features/log-pods/components/PodAttachmentModal.tsx` | `pod` | **Bypasses the service** — see §5.6 |

### 5.6 Direct (non-service) writer: `PodAttachmentModal`

This modal uploads to `{tripId}/pod/{random}-{ts}.{ext}` and batch-inserts `trip_documents` rows itself. Compared with `uploadTripDocument`, it:

- does **not** set `uploaded_by`
- does **not** check file size
- does **not** fire `PODUploaded` or `pod.uploaded`

---

## 6. Update / replace

### 6.1 Number edits

`document_number` is updated in place (§5.4). No audit row is written for number edits.

### 6.2 Replace (`replaceExistingOfType: true`)

1. The new file is uploaded to a **new** path. The old object is **not deleted**.
2. The latest row of that type is **UPDATEd**: new `file_name`, `storage_path`, `mime_type`, `size_bytes`, `uploaded_by`, `document_number`. It is reset to `status='pending'`, with `verified_by`, `verified_at` and `rejection_reason` cleared.
3. `recordTripDocumentReplacedAudit()` inserts `document_audit_log` with `action='replaced'` and the old values in `metadata` (`old_storage_path`, `old_file_name`, `old_verified_*`, …). This is best-effort; errors are swallowed.

**Who uses it:** eLR regenerate, Compliance table, vehicle-doc reuse fallback.
**Who doesn't:** the Trip Detail vault never replaces. "Add another" always **adds** a row, so one slot can hold many files.

### 6.3 Compliance status

`verify_trip_document(p_document_id, p_status, p_rejection_reason)` (`tripComplianceWrite.service.ts`):

- Sets `status`, `verified_by`, `verified_at`, `rejection_reason`.
- Writes `document_audit_log`.
- Requires surface `trip_compliance.documents.verify`.

---

## 7. Retrieval

### 7.1 Trip Detail load path

1. **Bundle:** `get_trip_detail_bundle(p_trip_id, p_viewer_org_id)` RPC (`lib/queries/useTripDetailBundleQuery.ts`) returns a `documents` array from `trip_documents`.
   - It is security definer and checks the viewer: the caller must be an active member of `p_viewer_org_id`, and that org must be the trip's org, its linked supplier org, or its linked client org.
   - It returns **at most 20 rows**, without `document_number`, `status` or `ocr_job_id`.
   - Rows are seeded through `tripDocumentsFromBundle()`. The light bundle ships `documents: []`, and an empty bundle never wipes rows that are already loaded.
   - A **non-empty** bundle **replaces** the list held in state ([useTripDetail.ts:2841-2853](../features/trips/components/trip-detail/hooks/useTripDetail.ts#L2841-L2853)), keeping only `document_number` from matching rows. If the bundle arrives after the direct load, a trip with more than 20 documents would show only 20. No trip has more than 9 today.
2. **Direct:** `loadTripDocuments()` ([useTripDetail.ts:2199](../features/trips/components/trip-detail/hooks/useTripDetail.ts#L2199)) → `getDocumentsByTripId(tripId, { includeOcr: false, includeStorageFallback: forViewer })`. It runs under table RLS, so viewers from supplier or client orgs get no rows from it; they only see what the bundle gives them.
3. **Realtime (currently inactive):** `useRealtimeTripDocuments(tripId, …)` (`features/trips/hooks/useRealtimeTrips.ts:61`) subscribes to `postgres_changes` on `trip_documents`. But **`trip_documents` is not in the `supabase_realtime` publication** (confirmed on preprod and prod), so it never fires. New uploads, including a driver's POD, appear on Trip Detail only after a reload or refresh.

### 7.2 `getDocumentsByTripId()`

[tripDocuments.service.ts:305](../features/trips/services/tripDocuments.service.ts#L305)

- `SELECT … FROM trip_documents WHERE trip_id = ? ORDER BY uploaded_at DESC`. It retries without `source_entity_document_id` if that column is missing.
- **Storage fallback** (when there are no rows and `includeStorageFallback`): `storage.list('{tripId}')` plus each known type subfolder, at most 3 lists running at once (`runWithConcurrencyLimit`). That's up to 16 list calls. It builds synthetic rows with id `storage-…`, and treats top-level files as `pod`.
  - It treats whatever is in the trip folder as a document, so a file written there by any signed-in user (§3.3) would appear.
  - The driver app calls this function with the defaults (storage fallback **and** OCR join on), fetches every document type, and filters on the client.
- The "table missing" branches (`isTripDocumentsMetaTableUnavailable`, `storage-meta-…` ids) are unreachable now that the table exists.

### 7.3 Viewing and downloading

| Function | Behaviour |
|---|---|
| `getDocumentViewUrl(path)` | Signed URL (cached by `createStorageSignedUrlCache`), falls back to `getPublicUrl` (which won't work on a private bucket) |
| `tryGetDocumentViewUrl(path)` | Signed URL or `null` (for galleries) |
| `getDocumentViewUrls(paths[])` | One batch `createSignedUrls` call |
| `resolveChatDocumentStorageUrl(path)` (`features/chat/utils/resolveChatDocumentUrl.util.ts`) | Used by the vault's single-file preview (`openVaultDocLikeChat` → `useDocumentPreview`). Strips stray `trip-documents/` prefixes |

- **Signed URLs last 60 minutes.** The trip-doc cache (`lib/storageSignedUrlCache.ts`) keeps them for 58 minutes; the chat resolver has its own 50-minute cache.
- Vehicle and driver cards sign from their own buckets: `getVehicleDocumentViewUrl`, `getComplianceDocumentSignedUrl`.
- `PodValidationView.getFileUrl()` (POD Reconciliation, lines 343 and 362) uses `getPublicUrl` on this private bucket, so those links don't load.
- **"Open"** in the preview modal calls `openPreviewExternally(url)`. On web that is `window.open(url, '_blank')`, on native `Linking.openURL`. This is the only download/open-externally path in the vault. There is no dedicated "Download" button.
- POD Validation has an explicit download link: `${url}?download=${file_name}`.

### 7.4 Reused vehicle documents

`use_vehicle_document_for_trip(p_trip_id, p_entity_document_id, p_document_type)`:

- Only `rc` / `insurance`.
- Inserts or updates a `trip_documents` row with `storage_path = 'ref:vehicle-document:…'` and `source_entity_document_id` set.
- The view helpers return empty/null for these paths. The preview resolves the real file through `entity_documents` (`vehicleDocumentReuse.service.ts`).

### 7.5 Batch / list reads (no file URLs)

| Reader | Source | Used by |
|---|---|---|
| `get_trip_documents_lr_pod_batch(p_trip_ids)` RPC (REST fallback) | `trip_id, document_type, document_number` for `lr, pod, soft_pod, pod_soft, eway_bill` | `features/trips/services/tripDocumentLrPod.service.ts` → `loadLrPodIndexByTripIds`, `loadHubPodReceiptFlags`, `loadTripEwayExpiryLabel`. Used by the Trips hub (`TripsScreen`, `TripsHubViews`, `TripCompletionFilterBar`, `tripHubMetrics`), POD reconciliation, Log PODs, Invoicing, Finance Pro |
| `hasPodDocument` / `hasLrDocument` | `trip_documents` existence | Informational; trip completion does **not** require a POD |
| `ground_ops_missing_mandatory_documents(p_trip_id, p_org_id)` | Required types from `organizations.settings.groundOpsMandatoryDocumentTypes` (default `['lr']`) | Ground-ops pre-transit gate (`20270919100000_ground_ops_pickup_simulation.sql`) |
| `tripComplianceRead.service.ts`, `ComplianceSection.tsx` | Direct `trip_documents` selects (status/verified columns) | Compliance checklist |

---

## 8. Every screen that shows or uses trip documents

| Screen / component | Route / host | What it does |
|---|---|---|
| Trip Detail → **Asset Vault / Vault** | `/trip/[id]` | Full upload / preview / open / delete UI (§4) |
| Finance Pro trip detail (`FinanceProTripDetailScreen`) | `/finance-pro/trip/[id]` | Shows the digital-POD flag only (no vault) |
| Trip Detail → Manifest Assets → `HardCopyPodStatusCard` → `LogHardCopyPodModal` → `HardCopyPodPhotoUpload` | Trip Detail sidebar | POD photo upload, preview, delete. Hard-copy state lives in `trips.pod_*` (`record_trip_hard_copy_pod`, `log_trip_hard_copy_pod_courier`) |
| `TripPodStatusSection` | Trip Detail | POD status |
| Compliance (`ComplianceSection` in Trip Detail; `ComplianceDocumentWorkspace` at `/compliance`) | `app/compliance/index.tsx` | Checklist, upload/replace, verify/reject, reuse vehicle docs, preview (`ComplianceDocumentPreviewModal`) |
| POD Reconciliation (`PodReconciliationScreen`, `PodValidationView`, `PodTripDetailDrawer`, `PodLrNumberEditor`) | `/pod-reconciliation` | List POD files, view, download, edit LR numbers |
| Log Incoming PODs (`LogIncomingPodsModal`, `PodAttachmentModal`) | `LogIncomingPodsScreen`; also opened from POD Reconciliation and Invoicing | Attach POD files to LRs |
| Driver app (`DriverTripFlowCard`, `DriverPodCompletionPage`, `DriverDocumentGalleryPreview`) | Driver home / job card; `/driver-trip/[tripId]` | Driver POD and LR capture, preview, remove |
| Driver trip history (`DriverTripHistoryDetailScreen`) | stack route | View past POD |
| `DriverControlScreen` | drivers feature | POD / LR via `usePodDocuments` / `useLrDocuments` |
| Trip chat (`ChatScreen`, `DocumentShareSheet`, `SmartChatImage`, `chatMediaGallery.util.ts`) | Trip conversations | Share vault docs in-thread; upload from the hub. `soft_delete_trip_chat_by_storage_path` RPC |
| Expense entry screens (`FuelEntryScreen`, `TollEntryScreen`, `OtherExpenseEntryScreen`, `ExpensePreviewSheet`, `ExpenseEntryDetailPanel`) | `/trip/[id]/operations` | Bill photos |
| Trip verification (`TripVerificationSummary`, `useTripVerification`, `useHydrateOdometerPhotos`) | `/trip/[id]/verification` | Odometer photos |
| Trips hub | Home → Trips | LR / POD / e-way chips and filters (batch RPC) |
| Invoicing (`InvoicingExecuteScreen`, `invoicePodRequired.util.ts`) | Invoicing | "POD Required" gate. Physical receipt is `trips.pod_received_at`; digital `pod` rows are a separate gate |
| Trip audit log (`TripAuditLogPanel`, `lib/trips/buildTripAuditLog.util.ts`) | Trip Detail | Document events in the timeline |

---

## 9. Deletion

**Vault:** Preview modal → **Delete** → `requestDeleteCurrentPreview()` → confirm → `executeVaultDelete()` ([TripDetailScreen.tsx:1938](../features/trips/components/trip-detail/TripDetailScreen.tsx#L1938)).

`deleteTripDocument(row)` ([tripDocuments.service.ts:819](../features/trips/services/tripDocuments.service.ts#L819)):

1. `storage.from('trip-documents').remove([storage_path])`. **The file is removed first.**
2. `DELETE FROM trip_documents WHERE id = ?`. Skipped for synthetic `storage-…` ids. If this step fails, the row is left pointing to a file that no longer exists.
3. Invalidates the signed-URL cache.

Then the screen refreshes the trip and compliance data.

**The vault delete can remove only the file.** If the row isn't in local state, `executeVaultDelete` builds a fake `storage-…` row ([TripDetailScreen.tsx:1997-2026](../features/trips/components/trip-detail/TripDetailScreen.tsx#L1997-L2026)). That removes the file but leaves the database row.

**A driver's "remove" probably leaves the row** (code and policy finding, **not runtime-tested**).

- Drivers have no DELETE policy on `trip_documents`, only an INSERT policy. So the row delete in `deleteTripDocument` would match nothing, and Postgres doesn't raise an error for that.
- The file delete would still succeed through the storage owner policy, because the driver owns the file they uploaded.
- Separately, the driver branch of the "trip folder" storage-delete policy compares against the wrong field and never matches (§11, finding 4).
- This is consistent with the prod data: all 6 rows whose file is missing were uploaded by driver users. But no actual driver delete was run to confirm it.

**Chat links survive.** Vault delete doesn't call `soft_delete_trip_chat_by_storage_path`, so chat messages that shared the file keep a link to a file that's gone.

Other places that delete:

- The driver app (remove POD/LR, or a cancelled upload)
- `HardCopyPodPhotoUpload`
- `driverKycDocuments.service.ts`

What delete does **not** do:

- There is **no soft delete** and **no `document_audit_log` row** on delete.
- Deleting a trip cascades to its `trip_documents` rows, but **storage objects are left behind**.
- Replaced files (§6.2) are never removed from storage.

---

## 10. Lifecycle summary

```
          pick file(s)            Save to vault
 [none] ───────────────► [pending preview] ───────────► storage object + trip_documents row
                                                              status = 'pending'
                                                              │
     LR without number ─► OCR job ─► document_number ◄────────┤ typed / edited numbers
                                                              │
                    Compliance verify/reject ─► status = verified | rejected (+ audit)
                                                              │
       replace (eLR / compliance) ─► same row, new path, status reset to pending (+ audit)
                                                              │
               view ─► signed URL (preview modal / Open / chat preview)
                                                              │
               delete ─► storage.remove + row DELETE (no audit)
```

Writing the file and writing the row are separate, non-transactional steps (file first in both upload and delete), and nothing reconciles them later. §11 has the measured drift.

---

## 11. Confirmed findings (current behaviour)

Verified 2026-10-06, read-only.

- **Prod:** confirmed against prod's own catalog, policies and data.
- **Code:** confirmed by reading the source.
- **Preprod:** confirmed on preprod only.

### 11.1 Security

| # | Finding | Evidence |
|---|---|---|
| 1 | **Storage read and upload are open to every signed-in user.** Two read policies ("Allow authenticated reads to trip-documents", "Suppliers can list storage folders") and the upload policy only check `bucket_id = 'trip-documents'`. Permissive policies are OR-combined, so the scoped `fn_storage_trip_doc_access` read policy has no effect. Any signed-in user, in any org, can list, sign and read any trip's files, and can upload into any trip folder. | Prod: policy fingerprints identical to preprod |
| 2 | **Ground-ops authorization is bypassed in the database.** `trip_documents_org_member_manage` (ALL) allows active members with role `owner/admin/member/dispatcher/finance`. Ground-ops members have role `member`. On prod, the one ground-ops member's org has 76 trips: `can_insert_trip_document` (warehouse rule) allows **6**, and the manage policy allows **all 76**. That's **70 trips** this member can insert into, update and delete documents on, outside the intended boundary. The `groundOpsDocUploadEnabled` toggle and warehouse scoping are enforced only in the app. | Prod: policy fingerprint plus membership and trip data. Not tested with an actual insert |
| 3 | **Every trip-status rule is UI-only.** No table or storage policy checks `trips.status` (see §3.4). | Code + prod policy definitions |
| 4 | **The driver branch of the storage delete policy never matches.** "Trip access can delete … in trip folder" uses `storage.foldername(d.name)`, where `d` is `drivers`, so it compares against the driver's name. Drivers can still delete files they uploaded through the owner policy. | Prod: policy fingerprint identical to preprod |
| 5 | **No server-side size or file-type limit.** The bucket has `file_size_limit` and `allowed_mime_types` set to NULL, and prod already holds `text/plain` and `image/svg+xml` document files. The 10 MB limit exists only in the app; the comment in `tripDocTypes.ts` saying it "matches bucket limits" is wrong. | Prod: bucket config |

### 11.2 Data and storage consistency (prod counts, 2026-10-06)

| Measure | Prod | Notes |
|---|---:|---|
| `trip_documents` rows | 1,138 | |
| Metadata-only rows (`…/fields.json`, no file) | 244 | |
| **Rows whose file is missing** | **6** | All 6 uploaded by driver users. The cause is not runtime-confirmed (§9) |
| Files in `trip-documents` | 1,116 | |
| **Files with no `trip_documents` row** (excluding chat) | **182** | |
| Files under trips that no longer exist | 165 | Trip delete cascades rows, not files |
| Legacy top-level files (`{tripId}/{file}`) | 95 | The storage fallback (§7.2) still serves these |
| Chat files (`/chat/` and `trip_chat/`) | 46 | No rows, by design |
| Legacy `pod-documents` bucket files | 1 | |

### 11.3 Behaviour and architecture

| # | Finding | Evidence |
|---|---|---|
| 6 | Realtime for `trip_documents` is inactive: the table is not in `supabase_realtime` (§7.1). | Prod |
| 7 | Upload writes the file before the row and doesn't clean up if the row write fails. Delete removes the file before the row (§5.1, §9). | Code |
| 8 | Vault delete can remove only the file when the row isn't in local state (§9). | Code |
| 9 | A driver's "remove" likely deletes the file but leaves the row (§9). | Code + policy analysis. Consistent with prod data. **Not runtime-tested** |
| 10 | Replaced files are never removed, and vault delete leaves chat links to the deleted file (§6.2, §9). | Code |
| 11 | `PodAttachmentModal` bypasses the service: no `uploaded_by`, no size check, no `PODUploaded` / `pod.uploaded` event (§5.6). | Code |
| 12 | `PodValidationView.getFileUrl()` uses `getPublicUrl` on a private bucket (§7.3). | Code |
| 13 | The LR duplicate check runs only in the client, fails open, and scans the whole org (§5.1). | Code |
| 14 | The bundle replaces the document list with at most 20 rows (§7.1). This is latent; no trip has more than 9 today. | Code + preprod |
| 15 | Trip documents are held in `useState`, not TanStack Query, and uploads don't invalidate related queries (§4, §5.2). | Code |
| 16 | Five components call Supabase directly instead of going through the service: `PodAttachmentModal`, `PodValidationView`, `PodTripDetailDrawer`, `ComplianceSection`, `VehicleDocumentReuseSection`. | Code |
| 17 | The POD size cap is 5 MB in the driver app and 10 MB everywhere else. | Code |
| 18 | **Prod schema drift:** prod is missing 5 trip-document migrations (54 of 59), and its `document_type` constraint lacks `bank_docs`, so Bank Docs inserts fail on prod (§2.1). Reconciliation is planned through the migration and merge process; nothing has been fixed. | Prod |

---

## 12. Planned fixes (NOT implemented)

None of this exists in the code or the database yet. It's an outline from the audit and needs its own reviewed plan before any work starts.

- **Phase 1 (security):**
  - Scope storage read to everyone who can legitimately see the trip: owner-org members, the trip's driver, and supplier- and client-linked orgs. This keeps the previews in §3.3 working.
  - Scope storage upload to people allowed to write to that trip folder.
  - Stop the manage policy from bypassing the ground-ops rule.
  - Fix the driver branch of the storage delete policy, and decide whether drivers may delete their own rows.
  - Set bucket size and file-type limits.
  - Restrict or retire the storage-listing fallback.
- **Phase 2 (consistency):**
  - Turn realtime on, or remove the dead subscription.
  - Clean up after a failed upload; make deletes remove the row first or do both atomically; drop the fake-row delete path.
  - Route `PodAttachmentModal` through the service, and use signed URLs in `PodValidationView`.
  - Make the direct load the single source for vault rows.
  - Enforce LR uniqueness on the server.
  - Clean up chat links on delete.
- **Phase 3 (data hygiene):** a reviewed, dry-run-first cleanup of the files and rows in §11.2.
- **Phase 4 (architecture):** a TanStack query hook with proper invalidation, all direct Supabase calls moved into the service, and a single document-type registry.
