const mockUploadAndSaveVehicleDocumentForTrip = jest.fn();
const mockUploadComplianceDocument = jest.fn();
const mockUploadTripDocument = jest.fn();
const mockInvalidate = jest.fn();

jest.mock("@/features/vehicles/services/vehicleDocuments.service", () => ({
  uploadAndSaveVehicleDocumentForTrip: (...args: unknown[]) =>
    mockUploadAndSaveVehicleDocumentForTrip(...args),
}));

jest.mock("@/features/compliance/services/documents.service", () => ({
  uploadComplianceDocument: (...args: unknown[]) => mockUploadComplianceDocument(...args),
}));

jest.mock("@/features/trips/services/tripDocuments.service", () => ({
  uploadTripDocument: (...args: unknown[]) => mockUploadTripDocument(...args),
  isTripDocumentsStoragePathConflict: () => false,
}));

jest.mock("@/features/tripCompliance/services/complianceDocumentView.service", () => ({
  invalidateCompliancePreviewCache: (...args: unknown[]) => mockInvalidate(...args),
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock("@/features/trips/components/trip-detail/vaultPickerFile.util", () => ({
  readVaultPickerAsset: jest.fn(),
}));

import { uploadComplianceVaultFile } from "@/features/tripCompliance/services/complianceVaultUpload.service";

const FILE = {
  arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
  fileName: "rc.pdf",
  mimeType: "application/pdf",
};

describe("uploadComplianceVaultFile Ground Ops", () => {
  beforeEach(() => {
    mockUploadAndSaveVehicleDocumentForTrip.mockReset();
    mockUploadComplianceDocument.mockReset();
    mockUploadTripDocument.mockReset();
    mockInvalidate.mockReset();
    mockUploadComplianceDocument.mockResolvedValue({
      error: null,
      document: { storage_path: "org/vehicle/v1/rc_new.pdf" },
    });
  });

  it("writes RC/FC to entity_documents and never touches the vehicle vault", async () => {
    await uploadComplianceVaultFile({
      scope: "vehicle",
      type: "rc",
      tripId: "trip-1",
      organizationId: "org-1",
      actorId: "user-1",
      vehicleId: "veh-1",
      entityId: "veh-1",
      existing: null,
      skipVehicleVault: true,
      file: FILE,
      expiryDate: null,
    });
    expect(mockUploadAndSaveVehicleDocumentForTrip).not.toHaveBeenCalled();
    expect(mockUploadComplianceDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        entityType: "vehicle",
        entityId: "veh-1",
        docType: "rc",
      }),
    );
  });
});
