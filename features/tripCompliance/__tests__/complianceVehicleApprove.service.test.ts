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

describe("approveComplianceVehicleDocument", () => {
  beforeEach(() => {
    mockMarkVehicle.mockReset();
    mockVerifyDocument.mockReset();
    mockGetDocumentsByEntity.mockReset();
  });

  it("writes the owned vault when the vehicle row is visible", async () => {
    mockMarkVehicle.mockResolvedValue({ documents: {}, error: null });
    const result = await approveComplianceVehicleDocument({
      orgId: "org-trip",
      vehicleId: ENTITY.entity_id,
      docType: "insurance",
      actorId: "user-1",
      vehicleDocuments: [ENTITY],
    });
    expect(result.error).toBeNull();
    expect(mockVerifyDocument).not.toHaveBeenCalled();
  });

  it("approves the viewer-org entity copy when the partner vehicle row is hidden", async () => {
    mockMarkVehicle.mockResolvedValue({
      documents: null,
      error: new Error("Could not approve this vehicle document. The vehicle record was not found."),
    });
    mockVerifyDocument.mockResolvedValue({ error: null });
    const result = await approveComplianceVehicleDocument({
      orgId: "org-trip",
      vehicleId: ENTITY.entity_id,
      docType: "insurance",
      actorId: "user-1",
      vehicleDocuments: [ENTITY],
    });
    expect(result.error).toBeNull();
    expect(mockVerifyDocument).toHaveBeenCalledWith(ENTITY.id, "user-1");
  });

  it("keeps the vault error when there is no viewer-org entity copy", async () => {
    const vaultError = new Error("Could not approve this vehicle document. The vehicle record was not found.");
    mockMarkVehicle.mockResolvedValue({ documents: null, error: vaultError });
    mockGetDocumentsByEntity.mockResolvedValue({ error: null, documents: [] });
    const result = await approveComplianceVehicleDocument({
      orgId: "org-trip",
      vehicleId: ENTITY.entity_id,
      docType: "rc",
      actorId: "user-1",
      vehicleDocuments: [],
    });
    expect(result.error).toBe(vaultError);
  });
});
