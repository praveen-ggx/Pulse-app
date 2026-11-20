const mockMarkVehicle = jest.fn();
const mockVerifyDocument = jest.fn();
const mockGetDocumentsByEntity = jest.fn();

jest.mock("@/features/vehicles/services/vehicleDocuments.service", () => ({
  markVehicleDocumentVerified: (...args: unknown[]) => mockMarkVehicle(...args),
}));
jest.mock("@/features/compliance/services/documents.service", () => ({
  verifyDocument: (...args: unknown[]) => mockVerifyDocument(...args),
  getDocumentsByEntity: (...args: unknown[]) => mockGetDocumentsByEntity(...args),
}));

import { approveComplianceVehicleDocument } from "@/features/tripCompliance/services/complianceVehicleApprove.service";
import type { ComplianceEntityDocument } from "@/features/tripCompliance/tripCompliance.types";

const ENTITY: ComplianceEntityDocument = {
  id: "44f3d73f-2e91-4196-b1a5-d8d17518b38d",
  entity_type: "vehicle",
  entity_id: "a71140ff-aebf-4aa5-9fd0-bc562a1cec4d",
  doc_type: "insurance",
  status: "pending",
  storage_path: "viewer/ins.jpeg",
  expiry_date: "2027-03-30",
  verified_at: null,
  notes: null,
  created_at: "2026-10-26T13:21:11.000Z",
  source: "entity",
};

const SLOT_ROW_ID = `${ENTITY.entity_id}-insurance`;
const HIDDEN = new Error("Could not approve this vehicle document. The vehicle record was not found.");

describe("approveComplianceVehicleDocument", () => {
  beforeEach(() => {
    mockMarkVehicle.mockReset();
    mockVerifyDocument.mockReset();
    mockGetDocumentsByEntity.mockReset();
  });

  it("writes the owned vault when the displayed file is the slot's main file", async () => {
    mockMarkVehicle.mockResolvedValue({ documents: {}, error: null });
    const result = await approveComplianceVehicleDocument({
      orgId: "org-trip",
      vehicleId: ENTITY.entity_id,
      docType: "insurance",
      actorId: "user-1",
      displayedDocumentId: SLOT_ROW_ID,
      displayedStoragePath: "owner/ins.jpeg",
      vehicleDocuments: [ENTITY],
    });
    expect(result.error).toBeNull();
    expect(mockMarkVehicle).toHaveBeenCalledWith("org-trip", ENTITY.entity_id, "insurance");
    expect(mockVerifyDocument).not.toHaveBeenCalled();
  });

  it("partner truck: approves the viewer-org row holding the displayed file (dated)", async () => {
    mockMarkVehicle.mockResolvedValue({ documents: null, error: HIDDEN });
    mockVerifyDocument.mockResolvedValue({ error: null });
    const result = await approveComplianceVehicleDocument({
      orgId: "org-trip",
      vehicleId: ENTITY.entity_id,
      docType: "insurance",
      actorId: "user-1",
      displayedDocumentId: SLOT_ROW_ID,
      displayedStoragePath: ENTITY.storage_path,
      vehicleDocuments: [ENTITY],
    });
    expect(result.error).toBeNull();
    expect(mockVerifyDocument).toHaveBeenCalledWith(ENTITY.id, "user-1");
  });

  it("partner truck: approves the matching file even when it is undated", async () => {
    mockMarkVehicle.mockResolvedValue({ documents: null, error: HIDDEN });
    mockVerifyDocument.mockResolvedValue({ error: null });
    const undated = { ...ENTITY, expiry_date: null };
    const result = await approveComplianceVehicleDocument({
      orgId: "org-trip",
      vehicleId: ENTITY.entity_id,
      docType: "insurance",
      actorId: "user-1",
      displayedDocumentId: SLOT_ROW_ID,
      displayedStoragePath: undated.storage_path,
      vehicleDocuments: [undated],
    });
    expect(result.error).toBeNull();
    expect(mockVerifyDocument).toHaveBeenCalledWith(ENTITY.id, "user-1");
  });

  it("never approves a different copy of the slot (older dated or newer undated)", async () => {
    mockMarkVehicle.mockResolvedValue({ documents: null, error: HIDDEN });
    mockGetDocumentsByEntity.mockResolvedValue({ error: null, documents: [] });
    const olderDated = { ...ENTITY, storage_path: "viewer/ins-2025.jpeg", expiry_date: "2025-01-01" };
    const newerUndated = {
      ...ENTITY,
      id: "c1d2e3f4-14b6-4948-a167-a6126203c992",
      storage_path: "viewer/ins-new.jpeg",
      expiry_date: null,
      created_at: "2026-11-19T00:00:00.000Z",
    };
    const result = await approveComplianceVehicleDocument({
      orgId: "org-trip",
      vehicleId: ENTITY.entity_id,
      docType: "insurance",
      actorId: "user-1",
      displayedDocumentId: SLOT_ROW_ID,
      displayedStoragePath: "owner/ins.jpeg",
      vehicleDocuments: [olderDated, newerUndated],
    });
    expect(result.error?.message).toMatch(/truck owner's records/);
    expect(mockVerifyDocument).not.toHaveBeenCalled();
  });

  it("an extra page on the vault does not mark the slot's main file", async () => {
    mockGetDocumentsByEntity.mockResolvedValue({ error: null, documents: [] });
    const result = await approveComplianceVehicleDocument({
      orgId: "org-trip",
      vehicleId: ENTITY.entity_id,
      docType: "insurance",
      actorId: "user-1",
      displayedDocumentId: "extra-123",
      displayedStoragePath: "owner/extras/extra-123.jpeg",
      vehicleDocuments: [],
    });
    expect(mockMarkVehicle).not.toHaveBeenCalled();
    expect(mockVerifyDocument).not.toHaveBeenCalled();
    expect(result.error).not.toBeNull();
  });

  it("finds the matching viewer-org row from the database when not in the summary", async () => {
    mockMarkVehicle.mockResolvedValue({ documents: null, error: HIDDEN });
    mockVerifyDocument.mockResolvedValue({ error: null });
    mockGetDocumentsByEntity.mockResolvedValue({
      error: null,
      documents: [{ ...ENTITY, entity_type: "vehicle", storage_path: "viewer/ins.jpeg" }],
    });
    const result = await approveComplianceVehicleDocument({
      orgId: "org-trip",
      vehicleId: ENTITY.entity_id,
      docType: "insurance",
      actorId: "user-1",
      displayedDocumentId: SLOT_ROW_ID,
      displayedStoragePath: "viewer/ins.jpeg",
      vehicleDocuments: [],
    });
    expect(result.error).toBeNull();
    expect(mockVerifyDocument).toHaveBeenCalledWith(ENTITY.id, "user-1");
  });
});
