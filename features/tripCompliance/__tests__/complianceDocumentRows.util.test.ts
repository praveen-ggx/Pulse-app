import {
  deriveComplianceDocumentRows,
  deriveEntityComplianceRows,
  deriveFinanceDocumentRows,
  deriveTripVaultReviewRows,
  financeVaultDetailLine,
  mergeFinanceBankDocsFromSupplier,
  complianceProgress,
  labelForDocType,
  requirementScopeLabel,
} from "@/features/tripCompliance/utils/complianceDocumentRows.util";
import {
  COMPLIANCE_DRIVER_DOCUMENT_TYPES,
  COMPLIANCE_VEHICLE_DOCUMENT_TYPES,
  type ComplianceDocumentRow,
  type ComplianceEntityDocument,
} from "@/features/tripCompliance/tripCompliance.types";

function doc(overrides: Partial<ComplianceDocumentRow>): ComplianceDocumentRow {
  return {
    id: overrides.id ?? "doc-1",
    trip_id: "trip-1",
    document_type: "lr",
    file_name: "f.pdf",
    storage_path: "path",
    uploaded_at: "2026-09-14",
    status: "pending",
    verified_by: null,
    verified_at: null,
    rejection_reason: null,
    ...overrides,
  };
}

describe("deriveTripVaultReviewRows", () => {
  it("lists only LR / E-way Bill / Invoice, even when POD or Memo are on file", () => {
    const rows = deriveTripVaultReviewRows([
      doc({ id: "pod-1", document_type: "pod" }),
      doc({ id: "memo-1", document_type: "memo" }),
    ]);
    expect(rows.map((r) => r.type)).toEqual(["lr", "eway_bill", "invoice"]);
    expect(rows.every((r) => r.required)).toBe(true);
  });

  it("keeps every extra LR / Invoice / E-way file on the Trip tab", () => {
    const rows = deriveTripVaultReviewRows([
      doc({ id: "lr-1", document_type: "lr", uploaded_at: "2026-09-01" }),
      doc({ id: "lr-2", document_type: "lr", uploaded_at: "2026-09-02" }),
      doc({ id: "pod-1", document_type: "pod" }),
    ]);
    expect(rows.filter((r) => r.type === "lr")).toHaveLength(2);
    expect(rows.some((r) => r.type === "pod")).toBe(false);
    expect(rows.filter((r) => r.required).map((r) => r.type).sort()).toEqual([
      "eway_bill",
      "invoice",
      "lr",
    ]);
  });
});

describe("deriveComplianceDocumentRows", () => {
  it("synthesizes required trip types plus other options", () => {
    const rows = deriveComplianceDocumentRows([]);
    expect(rows.map((r) => r.type)).toEqual(["lr", "eway_bill", "invoice", "pod", "memo"]);
    expect(rows.filter((r) => r.required).map((r) => r.type)).toEqual(["lr", "eway_bill", "invoice"]);
    expect(rows.every((r) => r.status === "missing")).toBe(true);
  });

  it("uses the real document's status when one exists for a required type", () => {
    const rows = deriveComplianceDocumentRows([doc({ document_type: "lr", status: "verified" })]);
    const lrRow = rows.find((r) => r.type === "lr");
    expect(lrRow?.status).toBe("verified");
    expect(lrRow?.doc?.status).toBe("verified");
  });

  it("lists every uploaded file of the same type, with extras optional", () => {
    const rows = deriveComplianceDocumentRows([
      doc({ id: "lr-1", document_type: "lr", status: "verified", uploaded_at: "2026-09-01" }),
      doc({ id: "lr-2", document_type: "lr", status: "pending", uploaded_at: "2026-09-02", file_name: "lr-2.pdf" }),
      doc({ id: "inv-1", document_type: "invoice", status: "verified" }),
      doc({ id: "ew-1", document_type: "eway_bill", status: "verified" }),
    ]);
    const lrs = rows.filter((r) => r.type === "lr");
    expect(lrs).toHaveLength(2);
    expect(lrs.filter((r) => r.required)).toHaveLength(1);
    expect(lrs.some((r) => r.doc?.id === "lr-1")).toBe(true);
    expect(lrs.some((r) => r.doc?.id === "lr-2")).toBe(true);
    expect(complianceProgress(rows)).toEqual({ verified: 3, total: 3 });
  });

  it("ignores an e-way number row that has no uploaded file", () => {
    const rows = deriveComplianceDocumentRows([
      doc({
        id: "eway-meta",
        document_type: "eway_bill",
        file_name: "eway-fields.json",
        storage_path: "trip-1/eway_bill/fields.json",
        status: "pending",
      }),
      doc({ id: "lr-file", document_type: "lr", status: "pending", file_name: "lr.pdf" }),
      doc({ id: "inv-file", document_type: "invoice", status: "pending", file_name: "invoice.pdf" }),
    ]);
    expect(rows.find((r) => r.type === "eway_bill")?.status).toBe("missing");
    expect(rows.find((r) => r.type === "lr")?.status).toBe("pending");
    expect(rows.find((r) => r.type === "invoice")?.status).toBe("pending");
  });

  it("keeps POD as an other option, not a required trip doc", () => {
    const rows = deriveComplianceDocumentRows([doc({ id: "pod-1", document_type: "pod", status: "pending" })]);
    const podRow = rows.find((r) => r.type === "pod");
    expect(podRow?.required).toBe(false);
    expect(podRow?.status).toBe("pending");
    expect(rows.filter((r) => r.required)).toHaveLength(3);
  });

  it("uses the latest file when several rows share a document type", () => {
    const rows = deriveComplianceDocumentRows([
      doc({ id: "old", document_type: "memo", status: "pending", uploaded_at: "2026-09-20T19:00:00.000Z" }),
      doc({
        id: "new",
        document_type: "memo",
        status: "verified",
        uploaded_at: "2026-09-20T19:27:01.000Z",
        file_name: "memo.pdf",
      }),
    ]);
    const memo = rows.find((r) => r.type === "memo");
    expect(memo?.status).toBe("verified");
    expect(memo?.doc?.id).toBe("new");
  });

  it("hides vehicle types that were uploaded against the trip", () => {
    const rows = deriveComplianceDocumentRows([doc({ id: "rc-1", document_type: "rc", status: "pending" })]);
    expect(rows.find((r) => r.type === "rc")).toBeUndefined();
  });
});

describe("deriveFinanceDocumentRows", () => {
  it("always includes Memo, Other Documents, and Bank Docs slots", () => {
    const rows = deriveFinanceDocumentRows([]);
    expect(rows.map((r) => r.type)).toEqual(["memo", "other", "bank_docs"]);
    expect(rows.filter((r) => r.required).map((r) => r.type)).toEqual(["memo"]);
    expect(rows.every((r) => r.status === "missing")).toBe(true);
  });

  it("merges uploaded memo, other, and bank_docs vault files into the fixed slots", () => {
    const rows = deriveFinanceDocumentRows([
      doc({ id: "memo-1", document_type: "memo", status: "pending", file_name: "memo.pdf" }),
      doc({ id: "other-1", document_type: "other", status: "verified", file_name: "extra.pdf" }),
      doc({ id: "bank-1", document_type: "bank_docs", status: "pending", file_name: "bank.pdf" }),
      doc({ id: "slip-1", document_type: "loading_slip", status: "verified", file_name: "slip.pdf" }),
      doc({ id: "man-1", document_type: "manifest", status: "pending", file_name: "manifest.pdf" }),
      doc({ id: "lr-1", document_type: "lr", status: "pending", file_name: "lr.pdf" }),
      doc({ id: "inv-1", document_type: "invoice", status: "pending", file_name: "inv.pdf" }),
    ]);
    expect(rows.map((r) => r.type)).toEqual(["memo", "other", "bank_docs"]);
    expect(rows.find((r) => r.type === "memo")?.status).toBe("pending");
    expect(rows.find((r) => r.type === "other")?.status).toBe("verified");
    expect(rows.find((r) => r.type === "bank_docs")?.status).toBe("pending");
    expect(rows.find((r) => r.type === "lr")).toBeUndefined();
    expect(rows.find((r) => r.type === "invoice")).toBeUndefined();
    expect(rows.find((r) => r.type === "manifest")).toBeUndefined();
  });

  it("does not surface vehicle or driver KYC types as finance rows", () => {
    const rows = deriveFinanceDocumentRows([
      doc({ id: "rc-1", document_type: "rc", status: "pending" }),
      doc({ id: "lic-1", document_type: "license", status: "pending" }),
    ]);
    expect(rows.map((r) => r.type)).toEqual(["memo", "other", "bank_docs"]);
  });
});

describe("mergeFinanceBankDocsFromSupplier", () => {
  it("fills bank_docs from supplier KYC when trip slot is empty", () => {
    const rows = deriveFinanceDocumentRows([]);
    const merged = mergeFinanceBankDocsFromSupplier(rows, {
      previewPath: "org/supplier/s1/cancelled_cheque_x.pdf",
      detailLine: "HDFC · XXXX1234 · HDFC0001234",
      kycDocId: "kyc-1",
      supplierId: "s1",
      status: "verified",
      fileName: "cheque.pdf",
      createdAt: "2026-09-01T00:00:00Z",
    });
    const bank = merged.find((r) => r.type === "bank_docs")!;
    expect(bank.status).toBe("verified");
    expect(bank.entityDoc?.storage_path).toBe("org/supplier/s1/cancelled_cheque_x.pdf");
    expect(bank.entityDoc?.source).toBe("supplier-kyc");
    expect(financeVaultDetailLine(bank)).toBe("HDFC · XXXX1234 · HDFC0001234");
  });

  it("keeps trip bank_docs upload ahead of supplier KYC file", () => {
    const rows = deriveFinanceDocumentRows([
      doc({
        id: "bank-trip",
        document_type: "bank_docs",
        status: "pending",
        file_name: "trip-bank.pdf",
        storage_path: "trip/bank_docs/a.pdf",
      }),
    ]);
    const merged = mergeFinanceBankDocsFromSupplier(rows, {
      previewPath: "org/supplier/s1/cheque.pdf",
      detailLine: "HDFC · XXXX9999",
      supplierId: "s1",
    });
    const bank = merged.find((r) => r.type === "bank_docs")!;
    expect(bank.doc?.id).toBe("bank-trip");
    expect(financeVaultDetailLine(bank)).toContain("trip-bank.pdf");
    expect(financeVaultDetailLine(bank)).toContain("HDFC");
  });
});

describe("financeVaultDetailLine", () => {
  it("prefers file names for memo, other, and bank_docs", () => {
    const rows = deriveFinanceDocumentRows([
      doc({
        id: "memo-1",
        document_type: "memo",
        status: "pending",
        file_name: "memo-scan.pdf",
      }),
      doc({
        id: "other-1",
        document_type: "other",
        status: "verified",
        file_name: "extra.pdf",
      }),
      doc({
        id: "bank-1",
        document_type: "bank_docs",
        status: "pending",
        file_name: "neft-slip.pdf",
      }),
    ]);
    expect(financeVaultDetailLine(rows.find((r) => r.type === "memo")!)).toBe("memo-scan.pdf");
    expect(financeVaultDetailLine(rows.find((r) => r.type === "other")!)).toBe("extra.pdf");
    expect(financeVaultDetailLine(rows.find((r) => r.type === "bank_docs")!)).toBe("neft-slip.pdf");
  });

  it("returns null when the slot has no file", () => {
    const rows = deriveFinanceDocumentRows([]);
    expect(financeVaultDetailLine(rows.find((r) => r.type === "memo")!)).toBeNull();
    expect(financeVaultDetailLine(rows.find((r) => r.type === "bank_docs")!)).toBeNull();
  });
});

describe("complianceProgress", () => {
  it("counts only required rows, ignoring extras", () => {
    const rows = deriveComplianceDocumentRows([
      doc({ id: "1", document_type: "lr", status: "verified" }),
      doc({ id: "2", document_type: "invoice", status: "verified" }),
      doc({ id: "3", document_type: "pod", status: "verified" }),
    ]);
    expect(complianceProgress(rows)).toEqual({ verified: 2, total: 3 });
  });

  it("is 0/3 when nothing is uploaded", () => {
    expect(complianceProgress(deriveComplianceDocumentRows([]))).toEqual({ verified: 0, total: 3 });
  });

  it("is 3/3 once every required trip type is verified", () => {
    const rows = deriveComplianceDocumentRows(
      ["lr", "invoice", "eway_bill"].map((t, i) =>
        doc({ id: String(i), document_type: t, status: "verified" }),
      ),
    );
    expect(complianceProgress(rows)).toEqual({ verified: 3, total: 3 });
  });
});

describe("deriveEntityComplianceRows", () => {
  function entityDoc(overrides: Partial<ComplianceEntityDocument>): ComplianceEntityDocument {
    return {
      id: overrides.id ?? "e1",
      entity_type: overrides.entity_type ?? "vehicle",
      entity_id: overrides.entity_id ?? "v1",
      doc_type: overrides.doc_type ?? "rc",
      status: overrides.status ?? "pending",
      storage_path: overrides.storage_path ?? "path",
      expiry_date: overrides.expiry_date === undefined ? "2027-01-01" : overrides.expiry_date,
      verified_at: overrides.verified_at ?? null,
      notes: overrides.notes ?? null,
      created_at: overrides.created_at ?? "2026-09-01",
    };
  }

  it("lists vehicle RC/insurance/FC as required and permit/pollution/tax as optional", () => {
    const rows = deriveEntityComplianceRows(COMPLIANCE_VEHICLE_DOCUMENT_TYPES, []);
    expect(rows.map((r) => r.type)).toEqual(["rc", "insurance", "fitness", "permit", "pollution", "road_tax"]);
    expect(rows.filter((r) => r.required).map((r) => r.type)).toEqual(["rc", "insurance", "fitness"]);
    expect(rows.filter((r) => !r.required).map((r) => r.type)).toEqual(["permit", "pollution", "road_tax"]);
    expect(rows.every((r) => r.status === "missing")).toBe(true);
  });

  it("keeps an uploaded license pending until it is approved", () => {
    const rows = deriveEntityComplianceRows(COMPLIANCE_DRIVER_DOCUMENT_TYPES, [
      entityDoc({ id: "d1", entity_type: "driver", entity_id: "dr1", doc_type: "license", status: "active" }),
    ]);
    expect(rows.find((r) => r.type === "license")?.status).toBe("pending");
    expect(rows.find((r) => r.type === "license")?.required).toBe(true);
    expect(rows.find((r) => r.type === "aadhaar")?.status).toBe("missing");
    expect(rows.find((r) => r.type === "aadhaar")?.required).toBe(false);
  });

  it("keeps uploaded RC pending until it is approved", () => {
    const rows = deriveEntityComplianceRows(COMPLIANCE_VEHICLE_DOCUMENT_TYPES, [
      entityDoc({
        id: "rc-1",
        entity_type: "vehicle",
        entity_id: "v1",
        doc_type: "rc",
        status: "active",
        expiry_date: null,
      }),
    ]);
    expect(rows.find((r) => r.type === "rc")?.status).toBe("pending");
  });

  it("marks insurance without expiry as pending, not verified", () => {
    const rows = deriveEntityComplianceRows(COMPLIANCE_VEHICLE_DOCUMENT_TYPES, [
      entityDoc({
        id: "ins",
        entity_type: "vehicle",
        entity_id: "v1",
        doc_type: "insurance",
        status: "active",
        expiry_date: null,
      }),
    ]);
    expect(rows.find((r) => r.type === "insurance")?.status).toBe("pending");
  });

  it("marks past-expiry fitness as expired", () => {
    const rows = deriveEntityComplianceRows(
      COMPLIANCE_VEHICLE_DOCUMENT_TYPES,
      [
        entityDoc({
          id: "fc",
          entity_type: "vehicle",
          entity_id: "v1",
          doc_type: "fitness",
          status: "active",
          expiry_date: "2020-01-01",
        }),
      ],
      new Date("2026-09-01T00:00:00Z"),
    );
    expect(rows.find((r) => r.type === "fitness")?.status).toBe("expired");
  });

  it("prefers verified insurance with expiry over a newer pending row without expiry", () => {
    const rows = deriveEntityComplianceRows(COMPLIANCE_VEHICLE_DOCUMENT_TYPES, [
      entityDoc({
        id: "ins-old",
        entity_type: "vehicle",
        entity_id: "v1",
        doc_type: "insurance",
        status: "verified",
        expiry_date: "2027-08-15",
        created_at: "2026-09-24T06:00:00Z",
      }),
      entityDoc({
        id: "ins-new",
        entity_type: "vehicle",
        entity_id: "v1",
        doc_type: "insurance",
        status: "pending",
        expiry_date: null,
        created_at: "2026-09-24T07:00:00Z",
      }),
    ]);
    const insurance = rows.filter((r) => r.type === "insurance");
    expect(insurance).toHaveLength(2);
    expect(insurance[0]?.entityDoc?.id).toBe("ins-old");
    expect(insurance[0]?.required).toBe(true);
    expect(insurance[0]?.status).toBe("verified");
    expect(insurance[1]?.entityDoc?.id).toBe("ins-new");
    expect(insurance[1]?.required).toBe(false);
    expect(insurance[1]?.status).toBe("pending");
  });
});

describe("requirementScopeLabel", () => {
  it("labels extras as Optional", () => {
    expect(requirementScopeLabel(true)).toBe("Required");
    expect(requirementScopeLabel(false)).toBe("Optional");
  });
});

describe("labelForDocType", () => {
  it("maps known types to friendly labels", () => {
    expect(labelForDocType("eway_bill")).toBe("E-way Bill");
    expect(labelForDocType("fitness")).toBe("FC");
    expect(labelForDocType("road_tax")).toBe("Tax");
    expect(labelForDocType("license")).toBe("Driving License");
  });

  it("falls back to a humanized form of unknown types", () => {
    expect(labelForDocType("some_new_type")).toBe("some new type");
  });
});
