import {
  complianceStoragePathCandidates,
  mergeComplianceEntityDocs,
  normalizeTripDocumentType,
  normalizeVaultVehicleNumber,
  parseComplianceStorageRef,
  vehicleVaultDocumentsToEntityDocs,
} from "@/features/tripCompliance/utils/complianceVaultDocuments.util";
import type { ComplianceEntityDocument } from "@/features/tripCompliance/tripCompliance.types";
import type { VehicleDocuments } from "@/features/vehicles/utils/vehicleDocuments.util";

describe("vehicleVaultDocumentsToEntityDocs", () => {
  it("maps Asset Vault RC/insurance/FC/PUC files onto compliance vehicle slots", () => {
    const documents: VehicleDocuments = {
      rc: { url: "org/v1/rc.pdf", expiryDate: "2027-01-01", uploadedAt: "2026-09-01" },
      insurance: { url: "org/v1/insurance.pdf", expiryDate: "2027-01-01" },
      extras: [{ id: "e1", url: "org/v1/extras/e1.pdf", expiryDate: "2027-01-01", fileName: "national-permit.pdf" }],
    };
    const rows = vehicleVaultDocumentsToEntityDocs("v1", documents);
    expect(rows.map((row) => row.doc_type).sort()).toEqual(["insurance", "permit", "rc"]);
    expect(rows.every((row) => row.source === "vehicle-vault")).toBe(true);
    expect(rows.find((row) => row.doc_type === "rc")?.storage_path).toBe("org/v1/rc.pdf");
    expect(rows.find((row) => row.doc_type === "rc")?.status).toBe("pending");
  });

  it("keeps extra pages of the same type instead of dropping them", () => {
    const rows = vehicleVaultDocumentsToEntityDocs("v1", {
      rc: { url: "org/v1/rc.pdf", expiryDate: "2027-01-01", uploadedAt: "2026-09-01" },
      extras: [
        {
          id: "e-rc-2",
          url: "org/v1/extras/rc-2.jpg",
          expiryDate: "",
          fileName: "RC · back.jpg",
          docType: "rc",
        },
      ],
    });
    expect(rows.filter((row) => row.doc_type === "rc").map((row) => row.storage_path)).toEqual([
      "org/v1/rc.pdf",
      "org/v1/extras/rc-2.jpg",
    ]);
  });

  it("keeps an uploaded RC pending until Compliance approval is stored", () => {
    const pending = vehicleVaultDocumentsToEntityDocs("v1", {
      rc: { url: "org/v1/rc.pdf", expiryDate: "", uploadedAt: "2026-09-24" },
    });
    expect(pending[0]?.status).toBe("pending");
    expect(pending[0]?.verified_at).toBeNull();

    const approved = vehicleVaultDocumentsToEntityDocs("v1", {
      rc: { url: "org/v1/rc.pdf", expiryDate: "", uploadedAt: "2026-09-24", verifiedAt: "2026-09-24T12:00:00Z" },
    });
    expect(approved[0]?.status).toBe("verified");
    expect(approved[0]?.verified_at).toBe("2026-09-24T12:00:00Z");
  });

  it("returns nothing when the vault JSON is empty", () => {
    expect(vehicleVaultDocumentsToEntityDocs("v1", {})).toEqual([]);
    expect(vehicleVaultDocumentsToEntityDocs("v1", null)).toEqual([]);
  });

  it("maps road-tax extras from filename", () => {
    const rows = vehicleVaultDocumentsToEntityDocs("v1", {
      extras: [{ id: "e2", url: "org/v1/tax.pdf", expiryDate: "2027-01-01", fileName: "Road Tax token.pdf" }],
    });
    expect(rows.map((row) => row.doc_type)).toEqual(["road_tax"]);
  });
});

describe("normalizeTripDocumentType", () => {
  it("maps vault aliases onto compliance trip types", () => {
    expect(normalizeTripDocumentType("eway")).toBe("eway_bill");
    expect(normalizeTripDocumentType("e-way bill")).toBe("eway_bill");
    expect(normalizeTripDocumentType("tax_invoice")).toBe("invoice");
    expect(normalizeTripDocumentType("lr")).toBe("lr");
  });
});

describe("parseComplianceStorageRef", () => {
  it("extracts a storage path from a signed URL", () => {
    expect(
      parseComplianceStorageRef(
        "https://x.supabase.co/storage/v1/object/sign/vehicle-documents/org/v1/rc.pdf?token=1",
      ),
    ).toEqual({ kind: "path", value: "org/v1/rc.pdf" });
  });

  it("passes through an already-open https file", () => {
    expect(parseComplianceStorageRef("https://cdn.example.com/rc.pdf")).toEqual({
      kind: "url",
      value: "https://cdn.example.com/rc.pdf",
    });
  });

  it("strips a bucket prefix from a vault path", () => {
    expect(parseComplianceStorageRef("vehicle-documents/org/v1/rc.pdf")).toEqual({
      kind: "path",
      value: "org/v1/rc.pdf",
    });
  });
});

describe("complianceStoragePathCandidates", () => {
  it("uses only the stored object path when it already has a file extension", () => {
    expect(
      complianceStoragePathCandidates({
        rawPath: "org/v1/rc.pdf",
        organizationId: "org",
        entityId: "v1",
        docType: "rc",
      }).paths,
    ).toEqual(["org/v1/rc.pdf"]);
  });

  it("guesses vault-style files only when no stored path is present", () => {
    expect(
      complianceStoragePathCandidates({
        rawPath: "",
        organizationId: "org",
        entityId: "v1",
        docType: "rc",
      }).paths,
    ).toEqual([
      "org/v1/rc.pdf",
      "org/v1/rc.jpg",
      "org/v1/rc.jpeg",
      "org/v1/rc.png",
      "org/v1/rc.webp",
    ]);
  });
});

describe("normalizeVaultVehicleNumber", () => {
  it("matches trip display numbers to vehicle records", () => {
    expect(normalizeVaultVehicleNumber("TN 16 YO 25800")).toBe("TN16YO25800");
    expect(normalizeVaultVehicleNumber("tn16yo25800")).toBe("TN16YO25800");
  });
});

describe("mergeComplianceEntityDocs", () => {
  it("lets preferred (first arg) win over fallback of the same type", () => {
    const vault: ComplianceEntityDocument[] = [
      {
        id: "vault-rc",
        entity_type: "vehicle",
        entity_id: "v1",
        doc_type: "rc",
        status: "active",
        storage_path: "vault/rc.pdf",
        expiry_date: null,
        verified_at: null,
        notes: null,
        created_at: "2026-09-01",
        source: "vehicle-vault",
      },
    ];
    const entity: ComplianceEntityDocument[] = [
      {
        id: "entity-rc",
        entity_type: "vehicle",
        entity_id: "v1",
        doc_type: "rc",
        status: "pending",
        storage_path: "entity/rc.pdf",
        expiry_date: null,
        verified_at: null,
        notes: null,
        created_at: "2026-01-01",
        source: "entity",
      },
    ];
    const merged = mergeComplianceEntityDocs(vault, entity);
    expect(merged.map((row) => row.id).sort()).toEqual(["entity-rc", "vault-rc"]);
    expect(merged.find((row) => row.id === "vault-rc")?.storage_path).toBe("vault/rc.pdf");
  });

  it("inherits expiry from fallback when preferred has none", () => {
    const entity: ComplianceEntityDocument[] = [
      {
        id: "entity-ins",
        entity_type: "vehicle",
        entity_id: "v1",
        doc_type: "insurance",
        status: "verified",
        storage_path: "entity/ins.pdf",
        expiry_date: "2027-08-15",
        verified_at: null,
        notes: null,
        created_at: "2026-09-24",
        source: "entity",
      },
    ];
    const vault: ComplianceEntityDocument[] = [
      {
        id: "vault-ins",
        entity_type: "vehicle",
        entity_id: "v1",
        doc_type: "insurance",
        status: "active",
        storage_path: "vault/ins.pdf",
        expiry_date: "",
        verified_at: null,
        notes: null,
        created_at: "2026-09-01",
        source: "vehicle-vault",
      },
    ];
    // Production: preferred = entity, fallback = vault
    const merged = mergeComplianceEntityDocs(entity, vault);
    expect(merged.find((row) => row.id === "entity-ins")?.expiry_date).toBe("2027-08-15");
    expect(merged.find((row) => row.id === "vault-ins")?.storage_path).toBe("vault/ins.pdf");
  });
});
