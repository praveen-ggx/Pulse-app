import {
  compliancePreviewSourceForRow,
  compliancePreviewSourceForVaultFile,
} from "../compliancePreviewSource.util";
import type { ComplianceDocRow } from "../complianceDocumentRows.util";

function row(
  overrides: Partial<ComplianceDocRow> & {
    entityDoc?: ComplianceDocRow["entityDoc"];
  },
): ComplianceDocRow {
  return {
    key: "k",
    type: "rc",
    required: true,
    status: "verified",
    doc: null,
    entityDoc: null,
    ...overrides,
  };
}

describe("compliancePreviewSourceForRow", () => {
  it("signs trip uploads from the trip vault even on the All tab", () => {
    expect(
      compliancePreviewSourceForRow(
        row({
          type: "lr",
          doc: {
            id: "1",
            trip_id: "t",
            document_type: "lr",
            file_name: "lr.pdf",
            storage_path: "org/t/lr.pdf",
            uploaded_at: "2026-01-01",
            status: "verified",
            verified_by: null,
            verified_at: null,
            rejection_reason: null,
          },
        }),
      ),
    ).toBe("trip");
  });

  it("signs vehicle vault files as vehicle-vault, not as trip", () => {
    expect(
      compliancePreviewSourceForRow(
        row({
          entityDoc: {
            id: "rc1",
            entity_type: "vehicle",
            entity_id: "v1",
            doc_type: "rc",
            status: "verified",
            storage_path: "org/v1/rc.pdf",
            expiry_date: null,
            verified_at: "2026-01-01",
            notes: null,
            created_at: "2026-01-01",
            source: "vehicle-vault",
          },
        }),
      ),
    ).toBe("vehicle-vault");
  });

  it("signs driver KYC and supplier bank proof from their own buckets", () => {
    expect(
      compliancePreviewSourceForRow(
        row({
          type: "license",
          entityDoc: {
            id: "dl1",
            entity_type: "driver",
            entity_id: "d1",
            doc_type: "license",
            status: "verified",
            storage_path: "org/d1/dl.pdf",
            expiry_date: null,
            verified_at: "2026-01-01",
            notes: null,
            created_at: "2026-01-01",
            source: "driver-kyc",
          },
        }),
      ),
    ).toBe("driver-kyc");
    expect(
      compliancePreviewSourceForRow(
        row({
          type: "bank_docs",
          entityDoc: {
            id: "bank1",
            entity_type: "supplier",
            entity_id: "s1",
            doc_type: "bank_docs",
            status: "verified",
            storage_path: "org/s1/cheque.jpg",
            expiry_date: null,
            verified_at: "2026-01-01",
            notes: "Cheque",
            created_at: "2026-01-01",
            source: "supplier-kyc",
          },
        }),
      ),
    ).toBe("supplier-kyc");
  });

  it("signs a trip memo from the trip vault, not compliance-documents", () => {
    expect(
      compliancePreviewSourceForVaultFile({
        category: "memo",
        deleteKind: "trip",
      }),
    ).toBe("trip");
  });
});
