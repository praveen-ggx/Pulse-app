import type { DocumentRow } from "@/features/compliance/services/documents.service";
import type { ComplianceDocumentRow } from "@/features/tripCompliance/tripCompliance.types";
import {
  buildComplianceChecklist,
  checklistGroupStatusLabel,
  checklistTone,
  ensureComplianceChecklist,
  isEntityDocumentSlotVerified,
} from "@/features/tripCompliance/utils/complianceChecklist.util";

function tripDoc(type: string, status: ComplianceDocumentRow["status"] = "verified"): ComplianceDocumentRow {
  return {
    id: type,
    trip_id: "t1",
    document_type: type,
    file_name: `${type}.pdf`,
    storage_path: type,
    uploaded_at: "2026-09-01",
    status,
    verified_by: null,
    verified_at: null,
    rejection_reason: null,
  };
}

function entityDoc(overrides: Partial<DocumentRow> & Pick<DocumentRow, "doc_type" | "entity_id" | "entity_type">): DocumentRow {
  return {
    id: overrides.id ?? overrides.doc_type,
    organization_id: "org",
    entity_type: overrides.entity_type,
    entity_id: overrides.entity_id,
    doc_type: overrides.doc_type,
    doc_label: null,
    doc_number: null,
    issued_date: null,
    expiry_date: overrides.expiry_date === undefined ? "2027-01-01" : overrides.expiry_date,
    issued_by: null,
    status: overrides.status ?? "active",
    storage_path: "path",
    notes: null,
    verified_by: null,
    verified_at: null,
    created_by: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };
}

describe("buildComplianceChecklist", () => {
  it("counts only mandatory vehicle (RC/Insurance/FC) and driver (DL) slots toward totals", () => {
    const checklist = buildComplianceChecklist({
      tripDocuments: [],
      vehicleDocuments: [],
      driverDocuments: [],
    });
    expect(checklist.groups[0].slots.map((s) => s.type)).toEqual(["lr", "eway_bill", "invoice"]);
    expect(checklist.groups[1].slots.map((s) => s.type)).toEqual([
      "rc",
      "insurance",
      "fitness",
      "permit",
      "pollution",
      "road_tax",
    ]);
    expect(checklist.groups[2].slots.map((s) => s.type)).toEqual(["license", "aadhaar"]);
    expect(checklist.groups[1].total).toBe(3);
    expect(checklist.groups[2].total).toBe(1);
    expect(checklist.total).toBe(7);
    expect(checklist.verified).toBe(0);
    expect(checklist.tone).toBe("danger");
  });

  it("counts verified trip docs and active mandatory vehicle/driver docs into groups", () => {
    const checklist = buildComplianceChecklist({
      tripDocuments: [
        tripDoc("lr"),
        tripDoc("invoice"),
        tripDoc("eway_bill", "pending"),
        tripDoc("pod"),
      ],
      vehicleDocuments: [
        entityDoc({ entity_type: "vehicle", entity_id: "v1", doc_type: "rc", status: "verified", expiry_date: null }),
        entityDoc({ entity_type: "vehicle", entity_id: "v1", doc_type: "insurance", status: "active" }),
        entityDoc({ entity_type: "vehicle", entity_id: "v1", doc_type: "fitness", status: "active" }),
      ],
      driverDocuments: [
        entityDoc({ entity_type: "driver", entity_id: "d1", doc_type: "license", status: "verified" }),
      ],
      now: new Date("2026-09-01T00:00:00Z"),
    });
    expect(checklist.groups[0]).toMatchObject({ verified: 3, total: 3, tone: "success" });
    expect(checklist.groups[1]).toMatchObject({ verified: 3, total: 3, tone: "success" });
    expect(checklist.groups[2]).toMatchObject({ verified: 1, total: 1, tone: "success" });
    expect(checklist.verified).toBe(7);
    expect(checklist.tone).toBe("success");
  });

  it("does not count expired entity documents as verified", () => {
    const checklist = buildComplianceChecklist({
      tripDocuments: [],
      vehicleDocuments: [
        entityDoc({ entity_type: "vehicle", entity_id: "v1", doc_type: "rc", status: "active", expiry_date: "2025-01-01" }),
      ],
      driverDocuments: [],
      now: new Date("2026-09-01T00:00:00Z"),
    });
    expect(checklist.groups[1].verified).toBe(0);
  });

  it("does not count insurance/FC/DL without expiry as verified", () => {
    expect(
      isEntityDocumentSlotVerified(
        { status: "active", storage_path: "p", expiry_date: null },
        new Date("2026-09-01"),
        "insurance",
      ),
    ).toBe(false);
    expect(
      isEntityDocumentSlotVerified(
        { status: "active", storage_path: "p", expiry_date: null },
        new Date("2026-09-01"),
        "rc",
      ),
    ).toBe(true);
  });

  it("is success when every mandatory slot is verified (optional docs ignored)", () => {
    const tripDocuments = ["lr", "eway_bill", "invoice"].map((type) => tripDoc(type));
    const vehicleDocuments = ["rc", "insurance", "fitness"].map((doc_type) =>
      entityDoc({
        entity_type: "vehicle",
        entity_id: "v1",
        doc_type,
        status: "verified",
        expiry_date: doc_type === "rc" ? null : "2027-01-01",
      }),
    );
    const driverDocuments = [
      entityDoc({ entity_type: "driver", entity_id: "d1", doc_type: "license", status: "verified" }),
    ];
    const checklist = buildComplianceChecklist({ tripDocuments, vehicleDocuments, driverDocuments });
    expect(checklist.verified).toBe(7);
    expect(checklist.tone).toBe("success");
    expect(checklist.groups.every((group) => group.tone === "success")).toBe(true);
  });
});

describe("checklistTone", () => {
  it("maps none / some / all", () => {
    expect(checklistTone(0, 5)).toBe("danger");
    expect(checklistTone(3, 5)).toBe("warning");
    expect(checklistTone(5, 5)).toBe("success");
  });
});

describe("checklistGroupStatusLabel", () => {
  it("returns Verified or Pending from group progress", () => {
    const empty = buildComplianceChecklist({ tripDocuments: [], vehicleDocuments: [], driverDocuments: [] });
    expect(checklistGroupStatusLabel(empty.groups[0])).toBe("Pending");
    const full = buildComplianceChecklist({
      tripDocuments: ["lr", "eway_bill", "invoice"].map((type) => tripDoc(type)),
      vehicleDocuments: [],
      driverDocuments: [],
    });
    expect(checklistGroupStatusLabel(full.groups[0])).toBe("Verified");
  });
});

describe("ensureComplianceChecklist", () => {
  it("rebuilds from trip documents when persisted cache has no checklist", () => {
    const checklist = ensureComplianceChecklist({
      documents: [tripDoc("lr"), tripDoc("invoice")],
    });
    expect(checklist.tone).toBe("warning");
    expect(checklist.groups[0].verified).toBe(2);
    expect(checklist.total).toBe(7);
  });

  it("rebuilds the old 15-slot mock checklist into the current types", () => {
    const stale = buildComplianceChecklist({ tripDocuments: [], vehicleDocuments: [], driverDocuments: [] });
    stale.groups[0].slots.push({ type: "insurance", verified: false }, { type: "rc", verified: false });
    const checklist = ensureComplianceChecklist({ checklist: stale, documents: [tripDoc("lr")] });
    expect(checklist.groups[0].slots.map((s) => s.type)).toEqual(["lr", "eway_bill", "invoice"]);
    expect(checklist.groups[0].verified).toBe(1);
  });

  it("rebuilds vehicle and driver slots from entity documents", () => {
    const checklist = ensureComplianceChecklist({
      documents: [tripDoc("lr")],
      vehicleDocuments: [
        entityDoc({ doc_type: "rc", entity_id: "v1", entity_type: "vehicle", status: "verified", expiry_date: null }),
      ],
      driverDocuments: [entityDoc({ doc_type: "license", entity_id: "d1", entity_type: "driver", status: "active" })],
    });
    expect(checklist.groups[0].verified).toBe(1);
    expect(checklist.groups[1].verified).toBe(1);
    expect(checklist.groups[2].verified).toBe(1);
  });

  it("returns the current slot counts when summary is empty", () => {
    const checklist = ensureComplianceChecklist(undefined);
    expect(checklist.tone).toBe("danger");
    expect(checklist.groups).toHaveLength(3);
    expect(checklist.total).toBe(7);
  });
});
