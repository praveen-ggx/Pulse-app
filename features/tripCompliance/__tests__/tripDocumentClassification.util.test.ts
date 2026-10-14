/**
 * Phase 1 — `classifyTripDocument` is the single source of truth for what a
 * trip_documents row holds. Fixtures mirror the real preprod row shapes for
 * every intake path (file upload, typed E-way / LR details, file + details,
 * vault reference, URL) plus empty / invalid / rejected rows.
 *
 * The agreement block proves rows, checklist presence and stage derivation all
 * read the same classification.
 */
function mockMakeThenable<T>(result: { data: T; error: null }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.in = chain;
  builder.is = chain;
  builder.then = (resolve: (v: typeof result) => void) => resolve(result);
  return builder;
}

let mockTripDocsResult: { data: unknown[]; error: null };

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => {
      if (table === "trip_documents") return mockMakeThenable(mockTripDocsResult);
      if (table === "trips") return mockMakeThenable({ data: [], error: null });
      if (table === "transactions") return mockMakeThenable({ data: [], error: null });
      if (table === "trip_workflow_events") return mockMakeThenable({ data: [], error: null });
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

jest.mock("@/features/compliance/services/documents.service", () => ({
  getDocumentsForEntities: jest.fn().mockResolvedValue({ error: null, documents: [] }),
}));

import { buildComplianceTripSummaries } from "@/features/tripCompliance/services/tripComplianceRead.service";
import type { ComplianceDocumentRow } from "@/features/tripCompliance/tripCompliance.types";
import { isTripVaultDocumentOnFile } from "@/features/tripCompliance/utils/complianceChecklist.util";
import { deriveComplianceDocumentRows } from "@/features/tripCompliance/utils/complianceDocumentRows.util";
import {
  classifyTripDocument,
  hasTypedDetails,
  readTypedDetails,
} from "@/features/tripCompliance/utils/tripDocumentClassification.util";
import type { TripRow } from "@/features/trips/services/trips.service";

function doc(overrides: Partial<ComplianceDocumentRow>): ComplianceDocumentRow {
  return {
    id: overrides.id ?? "doc-1",
    trip_id: "trip-1",
    document_type: "lr",
    file_name: "lr.pdf",
    storage_path: "trip-1/lr/4a362827.pdf",
    uploaded_at: "2026-09-20T10:00:00.000Z",
    status: "pending",
    verified_by: null,
    verified_at: null,
    rejection_reason: null,
    document_number: null,
    source_entity_document_id: null,
    ...overrides,
  };
}

// Real shape written by upsertEwayBillFields (preprod TRP397).
const EWAY_JSON =
  '{"ewayNo":"522077070707","createdDate":"24-Sep-26","validTill":"05-Oct-26","docNo":"216403558","entries":[{"ewayNo":"522077070707","createdDate":"24-Sep-26","validTill":"05-Oct-26","docNo":"216403558"}]}';

const fixtures = {
  file: doc({ id: "file" }),
  ewayDetails: doc({
    id: "eway-details",
    document_type: "eway_bill",
    file_name: "eway-fields.json",
    storage_path: "trip-1/eway_bill/fields.json",
    mime_type: "application/json",
    document_number: EWAY_JSON,
  }),
  lrDetailsJson: doc({
    id: "lr-details-json",
    file_name: "lr-fields.json",
    storage_path: "trip-1/lr/fields.json",
    mime_type: "application/json",
    document_number: '{"lrNumber":"AI3756","date":"08-Sep-26","invoice":""}',
  }),
  lrDetailsPlain: doc({
    id: "lr-details-plain",
    file_name: "lr-fields.json",
    storage_path: "trip-1/lr/fields.json",
    document_number: "AI3756",
  }),
  filePlusDetails: doc({
    id: "file-plus-details",
    document_number: '{"lrNumber":"AI3756","date":"08-Sep-26","invoice":"22026"}',
  }),
  reference: doc({
    id: "reference",
    document_type: "rc",
    storage_path: "ref:vehicle-document:trip-1:rc:ent-1",
    source_entity_document_id: "ent-1",
    status: "verified",
  }),
  referenceByIdOnly: doc({ id: "reference-id", storage_path: "anything", source_entity_document_id: "ent-2" }),
  url: doc({ id: "url", storage_path: "https://cdn.example.com/lr.pdf" }),
};

describe("classifyTripDocument — every intake shape", () => {
  it("1. Storage-backed file → file", () => {
    expect(classifyTripDocument(fixtures.file)).toEqual({
      kind: "file",
      hasBinary: true,
      hasDetails: false,
      present: true,
    });
  });

  it("2. typed E-way details-only → details, never a binary", () => {
    expect(classifyTripDocument(fixtures.ewayDetails)).toEqual({
      kind: "details",
      hasBinary: false,
      hasDetails: true,
      present: true,
    });
  });

  it("3. typed LR details-only (JSON and plain-string shapes) → details", () => {
    expect(classifyTripDocument(fixtures.lrDetailsJson).kind).toBe("details");
    expect(classifyTripDocument(fixtures.lrDetailsPlain).kind).toBe("details");
    expect(classifyTripDocument(fixtures.lrDetailsPlain).hasBinary).toBe(false);
  });

  it("4. file + typed details on one row → file, details metadata preserved", () => {
    expect(classifyTripDocument(fixtures.filePlusDetails)).toEqual({
      kind: "file",
      hasBinary: true,
      hasDetails: true,
      present: true,
    });
    expect(readTypedDetails(fixtures.filePlusDetails.document_number)).toEqual([
      { label: "Lr number", value: "AI3756" },
      { label: "Date", value: "08-Sep-26" },
      { label: "Invoice", value: "22026" },
    ]);
  });

  it("5. vehicle/entity reference → reference (marker path or source id)", () => {
    expect(classifyTripDocument(fixtures.reference).kind).toBe("reference");
    expect(classifyTripDocument(fixtures.referenceByIdOnly).kind).toBe("reference");
    expect(classifyTripDocument(fixtures.reference).hasBinary).toBe(true);
  });

  it("external URL → url", () => {
    expect(classifyTripDocument(fixtures.url)).toMatchObject({ kind: "url", hasBinary: true, present: true });
  });

  it("6. empty/invalid details markers → empty", () => {
    const blanks = [null, "", "   ", "{}", "[]", "null", '{"ewayNo":"","entries":[{"ewayNo":"","docNo":""}]}'];
    for (const value of blanks) {
      const row = doc({ storage_path: "trip-1/eway_bill/fields.json", file_name: "eway-fields.json", document_number: value });
      expect(classifyTripDocument(row)).toMatchObject({ kind: "empty", present: false, hasBinary: false });
    }
    expect(classifyTripDocument(null).kind).toBe("empty");
  });

  it("7. rejected document keeps its content kind; status is judged by consumers", () => {
    const rejected = doc({ id: "rejected", status: "rejected", rejection_reason: "blurry" });
    expect(classifyTripDocument(rejected).kind).toBe("file");
    expect(isTripVaultDocumentOnFile(rejected)).toBe(false);
    expect(deriveComplianceDocumentRows([rejected]).find((r) => r.type === "lr")?.status).toBe("rejected");
  });

  it("8. missing/invalid storage path → empty, unless typed details exist", () => {
    for (const path of ["", "   ", "trip-1/lr/", "trip-1/../secret.pdf"]) {
      expect(classifyTripDocument(doc({ storage_path: path })).kind).toBe("empty");
    }
    expect(classifyTripDocument(doc({ storage_path: "", document_number: "AI3756" })).kind).toBe("details");
  });

  it("does not depend on document_type", () => {
    const asInvoice = { ...fixtures.ewayDetails, document_type: "invoice" };
    expect(classifyTripDocument(asInvoice)).toEqual(classifyTripDocument(fixtures.ewayDetails));
  });
});

describe("typed details helpers", () => {
  it("hasTypedDetails treats malformed JSON as user text", () => {
    expect(hasTypedDetails("{not json")).toBe(true);
  });

  it("readTypedDetails renders E-way entries by shape, not by type", () => {
    expect(readTypedDetails(EWAY_JSON)).toEqual([
      { label: "Eway no", value: "522077070707" },
      { label: "Created date", value: "24-Sep-26" },
      { label: "Valid till", value: "05-Oct-26" },
      { label: "Doc no", value: "216403558" },
    ]);
  });

  it("readTypedDetails numbers multiple entries and handles plain strings", () => {
    const two = '{"entries":[{"ewayNo":"1"},{"ewayNo":"2"}]}';
    expect(readTypedDetails(two)).toEqual([
      { label: "Eway no 1", value: "1" },
      { label: "Eway no 2", value: "2" },
    ]);
    expect(readTypedDetails("AI3756")).toEqual([{ label: "Value", value: "AI3756" }]);
    expect(readTypedDetails("{}")).toEqual([]);
  });
});

describe("rows / checklist / stage agree on the classification", () => {
  function makeTrip(): TripRow {
    return {
      id: "trip-1",
      organization_id: "org-1",
      status: "in_transit",
      vehicle_id: null,
      owner_vehicle_id: null,
      driver_id: null,
      vehicle_display_number: null,
    } as TripRow;
  }

  const invoiceFile = doc({ id: "inv", document_type: "invoice", file_name: "inv.pdf", storage_path: "trip-1/invoice/a.pdf" });
  const lrFile = doc({ id: "lr", storage_path: "trip-1/lr/b.pdf" });

  async function stageFor(docs: ComplianceDocumentRow[]) {
    mockTripDocsResult = { data: docs, error: null };
    const [summary] = await buildComplianceTripSummaries([makeTrip()], "org-1");
    return summary;
  }

  it("typed E-way details: row present (not missing), on checklist; stage stays Pending Docs without vehicle and driver files", async () => {
    const docs = [lrFile, invoiceFile, fixtures.ewayDetails];
    const ewayRow = deriveComplianceDocumentRows(docs).find((r) => r.type === "eway_bill");
    expect(ewayRow?.status).toBe("pending");
    expect(ewayRow?.doc?.id).toBe("eway-details");
    expect(classifyTripDocument(ewayRow?.doc).hasBinary).toBe(false);
    expect(isTripVaultDocumentOnFile(fixtures.ewayDetails)).toBe(true);
    const summary = await stageFor(docs);
    expect(summary.stage).toBe("pending_for_docs");
    expect(summary.documentCounts.total).toBe(3);
  });

  it("empty details marker: row missing, not on checklist, stage Pending Docs, not counted", async () => {
    const emptyEway = { ...fixtures.ewayDetails, id: "eway-empty", document_number: "{}" };
    const docs = [lrFile, invoiceFile, emptyEway];
    expect(deriveComplianceDocumentRows(docs).find((r) => r.type === "eway_bill")?.status).toBe("missing");
    expect(isTripVaultDocumentOnFile(emptyEway)).toBe(false);
    const summary = await stageFor(docs);
    expect(summary.stage).toBe("pending_for_docs");
    expect(summary.documentCounts.total).toBe(2);
  });

  it("file wins over a newer details-only row of the same type", () => {
    const olderFile = doc({ id: "lr-file", uploaded_at: "2026-09-01T00:00:00.000Z" });
    const newerDetails = { ...fixtures.lrDetailsJson, uploaded_at: "2026-09-25T00:00:00.000Z" };
    const lrRow = deriveComplianceDocumentRows([newerDetails, olderFile]).find((r) => r.type === "lr");
    expect(lrRow?.doc?.id).toBe("lr-file");
  });
});
