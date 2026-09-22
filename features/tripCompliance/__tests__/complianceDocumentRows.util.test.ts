import {
  deriveComplianceDocumentRows,
  deriveEntityComplianceRows,
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

describe("deriveComplianceDocumentRows", () => {
  it("synthesizes required trip types plus other options", () => {
    const rows = deriveComplianceDocumentRows([]);
    expect(rows.map((r) => r.type)).toEqual(["lr", "eway_bill", "invoice", "pod", "loading_slip", "manifest"]);
    expect(rows.filter((r) => r.required).map((r) => r.type)).toEqual(["lr", "eway_bill", "invoice"]);
    expect(rows.every((r) => r.status === "missing")).toBe(true);
  });

  it("uses the real document's status when one exists for a required type", () => {
    const rows = deriveComplianceDocumentRows([doc({ document_type: "lr", status: "verified" })]);
    const lrRow = rows.find((r) => r.type === "lr");
    expect(lrRow?.status).toBe("verified");
    expect(lrRow?.doc?.status).toBe("verified");
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
      doc({ id: "old", document_type: "loading_slip", status: "pending", uploaded_at: "2026-09-20T19:00:00.000Z" }),
      doc({
        id: "new",
        document_type: "loading_slip",
        status: "verified",
        uploaded_at: "2026-09-20T19:27:01.000Z",
        file_name: "slip.jpg",
      }),
    ]);
    const slip = rows.find((r) => r.type === "loading_slip");
    expect(slip?.status).toBe("verified");
    expect(slip?.doc?.id).toBe("new");
  });

  it("hides vehicle types that were uploaded against the trip", () => {
    const rows = deriveComplianceDocumentRows([doc({ id: "rc-1", document_type: "rc", status: "pending" })]);
    expect(rows.find((r) => r.type === "rc")).toBeUndefined();
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

  it("treats active unexpired entity docs as verified; Aadhaar stays optional", () => {
    const rows = deriveEntityComplianceRows(COMPLIANCE_DRIVER_DOCUMENT_TYPES, [
      entityDoc({ id: "d1", entity_type: "driver", entity_id: "dr1", doc_type: "license", status: "active" }),
    ]);
    expect(rows.find((r) => r.type === "license")?.status).toBe("verified");
    expect(rows.find((r) => r.type === "license")?.required).toBe(true);
    expect(rows.find((r) => r.type === "aadhaar")?.status).toBe("missing");
    expect(rows.find((r) => r.type === "aadhaar")?.required).toBe(false);
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
