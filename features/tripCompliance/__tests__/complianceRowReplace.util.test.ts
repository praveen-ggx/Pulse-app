import type { ComplianceDocRow } from "@/features/tripCompliance/utils/complianceDocumentRows.util";
import type { ComplianceDocumentRow } from "@/features/tripCompliance/tripCompliance.types";
import {
  canShowSingleRowReplace,
  mustReplaceRejectedTripDocument,
  replaceTripFileOptions,
  singleComplianceRowReplaceId,
  singleComplianceRowReplaceIds,
} from "@/features/tripCompliance/utils/complianceRowReplace.util";

function tripDoc(
  overrides: Partial<ComplianceDocumentRow> & Pick<ComplianceDocumentRow, "id" | "document_type" | "status">,
): ComplianceDocumentRow {
  return {
    trip_id: "7a274fd0-9958-4274-b9c3-90130f64ca14",
    file_name: `${overrides.document_type}.png`,
    storage_path: `trip/${overrides.document_type}/old.png`,
    uploaded_at: "2026-10-29T17:00:00.000Z",
    verified_by: null,
    verified_at: null,
    rejection_reason: overrides.status === "rejected" ? "PR54 resubmit preview test" : null,
    ...overrides,
  };
}

function row(overrides: Partial<ComplianceDocRow> & Pick<ComplianceDocRow, "status" | "type">): ComplianceDocRow {
  const hasTripDoc = overrides.status !== "missing" && overrides.doc !== null;
  return {
    key: overrides.type,
    type: overrides.type,
    required: false,
    status: overrides.status,
    doc: hasTripDoc
      ? tripDoc({
          id: "b7cbfe36-b6df-4459-976d-1c7d6af7d40f",
          document_type: overrides.type,
          status:
            overrides.status === "verified" || overrides.status === "rejected" || overrides.status === "pending"
              ? overrides.status
              : "pending",
        })
      : null,
    entityDoc: null,
    ...overrides,
  };
}

const otherRejected = row({
  status: "rejected",
  type: "other",
  key: "other",
  doc: tripDoc({
    id: "b7cbfe36-b6df-4459-976d-1c7d6af7d40f",
    document_type: "other",
    status: "rejected",
    file_name: "RESUBMIT-TEST-1.png",
    storage_path: "7a274fd0-9958-4274-b9c3-90130f64ca14/other/823a9c10-b6c6-4195-abc6-5eea68c2b693.png",
  }),
});

const siblings: ComplianceDocRow[] = [
  row({
    status: "verified",
    type: "lr",
    key: "lr",
    required: true,
    doc: tripDoc({ id: "36b466d9-3b49-41d8-9db7-a65c6c6ed34e", document_type: "lr", status: "verified" }),
  }),
  row({
    status: "verified",
    type: "invoice",
    key: "invoice",
    required: true,
    doc: tripDoc({ id: "426f51a3-c132-4233-881f-4771195b9121", document_type: "invoice", status: "verified" }),
  }),
  row({
    status: "verified",
    type: "eway_bill",
    key: "eway_bill",
    required: true,
    doc: tripDoc({ id: "223e0992-5532-44c7-9308-f97016b71ce3", document_type: "eway_bill", status: "verified" }),
  }),
  row({
    status: "pending",
    type: "memo",
    key: "memo",
    required: true,
    doc: tripDoc({ id: "a20836e4-6c4f-4cef-a22f-2a2b204b4302", document_type: "memo", status: "pending" }),
  }),
  row({
    status: "verified",
    type: "bank_docs",
    key: "bank_docs",
    doc: null,
    entityDoc: {
      id: "bank-entity",
      entity_type: "supplier",
      entity_id: "sup-1",
      doc_type: "bank_docs",
      status: "verified",
      storage_path: "bank.png",
      created_at: "2026-10-01",
    },
  }),
];

describe("singleComplianceRowReplaceId", () => {
  it("targets only the rejected Other trip_documents.id", () => {
    expect(singleComplianceRowReplaceId(otherRejected)).toBe("b7cbfe36-b6df-4459-976d-1c7d6af7d40f");
    expect(singleComplianceRowReplaceIds(otherRejected, siblings)).toEqual([
      "b7cbfe36-b6df-4459-976d-1c7d6af7d40f",
    ]);
    expect(replaceTripFileOptions(otherRejected)).toEqual({
      replaceDocumentId: "b7cbfe36-b6df-4459-976d-1c7d6af7d40f",
    });
  });

  it("does not replace pending, verified, missing, or entity-only rows", () => {
    expect(singleComplianceRowReplaceId(row({ status: "pending", type: "other" }))).toBeNull();
    expect(singleComplianceRowReplaceId(row({ status: "verified", type: "other" }))).toBeNull();
    expect(singleComplianceRowReplaceId(row({ status: "missing", type: "other", doc: null }))).toBeNull();
    expect(
      singleComplianceRowReplaceId(
        row({
          status: "rejected",
          type: "insurance",
          key: "insurance",
          doc: null,
          entityDoc: {
            id: "ins-1",
            entity_type: "vehicle",
            entity_id: "veh-1",
            doc_type: "insurance",
            status: "rejected",
            storage_path: "ins.png",
            created_at: "2026-10-01",
          },
        }),
      ),
    ).toBeNull();
  });

  it("never expands the replace target to siblings", () => {
    const ids = singleComplianceRowReplaceIds(otherRejected, siblings);
    expect(ids).not.toEqual(expect.arrayContaining(siblings.map((item) => item.doc?.id).filter(Boolean)));
    expect(ids).toHaveLength(1);
  });
});

describe("canShowSingleRowReplace", () => {
  it("shows Replace only when files can be edited and the trip row is rejected", () => {
    expect(canShowSingleRowReplace({ canEditFiles: true, row: otherRejected })).toBe(true);
    expect(canShowSingleRowReplace({ canEditFiles: false, row: otherRejected })).toBe(false);
    expect(canShowSingleRowReplace({ canEditFiles: true, row: siblings[3] })).toBe(false);
  });

  it("forces Replace instead of Add so a second Other row is not created", () => {
    expect(mustReplaceRejectedTripDocument(otherRejected)).toBe(true);
    expect(mustReplaceRejectedTripDocument(row({ status: "pending", type: "other" }))).toBe(false);
  });
});
