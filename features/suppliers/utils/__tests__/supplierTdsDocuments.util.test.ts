import type { SupplierKycDocument } from "@/features/suppliers/types/supplierManagement.types";
import {
  TDS_DOC_TYPE,
  getTdsDocumentRule,
  hasTdsDocForYear,
  tdsDocLabelForYear,
  tdsDocsForYear,
} from "@/features/suppliers/utils/supplierTdsDocuments.util";

function doc(partial: Partial<SupplierKycDocument>): SupplierKycDocument {
  return {
    id: "d1",
    organization_id: "org",
    supplier_id: "sup",
    doc_type: TDS_DOC_TYPE,
    doc_label: tdsDocLabelForYear("TDS supporting document", "2026-27"),
    storage_path: "org/supplier/sup/tds_supporting_document_1.pdf",
    status: "pending",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...partial,
  } as SupplierKycDocument;
}

describe("getTdsDocumentRule", () => {
  it("returns null when no valid rate is entered", () => {
    for (const rate of [null, undefined, Number.NaN, -1, 101]) {
      expect(getTdsDocumentRule(rate)).toBeNull();
    }
  });

  it("only 0% is mandatory", () => {
    expect(getTdsDocumentRule(0)).toEqual({ required: true });
  });

  it.each([0.01, 0.1, 0.5, 1, 2, 5, 10, 20, 25, 30, 100])("%s%% is optional", (rate) => {
    expect(getTdsDocumentRule(rate)).toEqual({ required: false });
  });
});

describe("tdsDocsForYear / hasTdsDocForYear", () => {
  it("labels uploads with the financial year", () => {
    expect(tdsDocLabelForYear("TDS supporting document", "2026-27")).toBe(
      "TDS supporting document · FY 2026-27",
    );
  });

  it("lists every file for the year, oldest first, so several can be uploaded", () => {
    const first = doc({ id: "a", created_at: "2026-10-01T00:00:00Z" });
    const second = doc({ id: "b", created_at: "2026-10-05T00:00:00Z" });
    expect(tdsDocsForYear([second, first], "2026-27").map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("keeps each financial year separate", () => {
    const fy26 = doc({ id: "fy26" });
    const fy25 = doc({ id: "fy25", doc_label: tdsDocLabelForYear("TDS supporting document", "2025-26") });
    expect(tdsDocsForYear([fy26, fy25], "2026-27").map((d) => d.id)).toEqual(["fy26"]);
    expect(tdsDocsForYear([fy26, fy25], "2025-26").map((d) => d.id)).toEqual(["fy25"]);
    expect(hasTdsDocForYear([fy26, fy25], "2027-28")).toBe(false);
  });

  it("ignores rows without a stored file and other document types", () => {
    expect(hasTdsDocForYear([doc({ storage_path: null })], "2026-27")).toBe(false);
    expect(hasTdsDocForYear([doc({ doc_type: "pan" })], "2026-27")).toBe(false);
    expect(hasTdsDocForYear([doc({})], "2026-27")).toBe(true);
  });
});
