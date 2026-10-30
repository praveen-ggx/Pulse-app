import {
  compliancePreviewSourceForEntityDoc,
  compliancePreviewSourceForRow,
  compliancePreviewSourceForVaultFile,
  vaultChooserSourceForComplianceRow,
  vaultChooserSourceForEntityDoc,
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

describe("compliancePreviewSourceForVaultFile", () => {
  it("signs a trip memo from the trip vault, not compliance-documents", () => {
    expect(
      compliancePreviewSourceForVaultFile({
        category: "memo",
        deleteKind: "trip",
      }),
    ).toBe("trip");
  });

  it("signs Bank Docs from supplier KYC even when only the label is set", () => {
    expect(
      compliancePreviewSourceForVaultFile({
        categoryLabel: "Bank Docs",
      }),
    ).toBe("supplier-kyc");
  });

  it("signs compliance-page vehicle uploads (entity path) from compliance-documents", () => {
    expect(
      compliancePreviewSourceForRow(
        row({
          entityDoc: {
            id: "rc-entity",
            entity_type: "vehicle",
            entity_id: "v1",
            doc_type: "rc",
            status: "pending",
            storage_path: "org/vehicle/v1/rc_abc.jpeg",
            expiry_date: null,
            verified_at: null,
            notes: "TS34T1786 RC.jpeg",
            created_at: "2026-10-29",
            source: "entity",
          },
        }),
      ),
    ).toBe("entity");
    expect(
      vaultChooserSourceForComplianceRow(
        row({
          entityDoc: {
            id: "rc-entity",
            entity_type: "vehicle",
            entity_id: "v1",
            doc_type: "rc",
            status: "pending",
            storage_path: "org/vehicle/v1/rc_abc.jpeg",
            expiry_date: null,
            verified_at: null,
            notes: "TS34T1786 RC.jpeg",
            created_at: "2026-10-29",
            source: "entity",
          },
        }),
      ),
    ).toBe("entity");
  });

  it("keeps Asset Vault vehicle files on the vehicle-vault signer", () => {
    expect(
      compliancePreviewSourceForEntityDoc({
        source: "vehicle-vault",
        entity_type: "vehicle",
        doc_type: "insurance",
        storage_path: "org/v1/insurance.jpeg",
      }),
    ).toBe("vehicle-vault");
    expect(
      vaultChooserSourceForEntityDoc({
        source: "vehicle-vault",
        doc_type: "rc",
        storage_path: "org/v1/Screenshot.png",
      }),
    ).toBe("vehicle-vault");
    expect(
      compliancePreviewSourceForVaultFile({
        complianceType: "rc",
        deleteKind: "vehicle_compliance",
        storagePath: "org/v1/rc.jpeg",
      }),
    ).toBe("vehicle-vault");
    expect(
      compliancePreviewSourceForVaultFile({
        complianceType: "rc",
        deleteKind: "vehicle_compliance",
        storagePath: "org/vehicle/v1/rc_abc.jpeg",
      }),
    ).toBe("entity");
  });
});
