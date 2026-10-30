const mockSignedBuckets: string[] = [];
const mockPaintedBuckets: string[] = [];
const mockVehicleViewUrl = jest.fn<Promise<string | null>, [string]>();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async () => {
          mockSignedBuckets.push(bucket);
          return { data: { signedUrl: "https://signed.example/license" }, error: null };
        },
      }),
    },
  }),
}));

jest.mock("@/features/trips/utils/storagePreviewObjectUrl.util", () => ({
  isInlinePreviewUri: jest.requireActual("@/features/trips/utils/storagePreviewObjectUrl.util")
    .isInlinePreviewUri,
  // Native path: the bucket is chosen by signing (web skips the up-front sign).
  canMaterializeStoragePreview: () => false,
  previewPrivateObject: async (bucket: string, _path: string, signed?: string | null) => {
    mockPaintedBuckets.push(bucket);
    return { url: signed ? "blob:license" : null, kind: signed ? null : "missing" };
  },
  storagePreviewFailureMessage: () => "failed",
  invalidateStoragePreviewPath: jest.fn(),
  invalidateStoragePreviewPrefix: jest.fn(),
}));

jest.mock("@/components/pdfEmbedCache.util", () => ({
  invalidatePdfPreview: jest.fn(),
}));

jest.mock("@/features/vehicles/services/vehicleDocuments.service", () => ({
  getVehicleDocumentViewUrl: (path: string) => mockVehicleViewUrl(path),
  getVehicleDocumentViewUrls: async () => ({}),
}));

jest.mock("@/features/compliance/services/documents.service", () => ({
  getComplianceDocumentSignedUrl: async (path: string) => {
    mockSignedBuckets.push("compliance-documents");
    mockPaintedBuckets.push("compliance-documents");
    return {
      url: path.includes("/vehicle/") ? "blob:compliance-entity" : "blob:license",
      error: null,
    };
  },
}));

import {
  invalidateCompliancePreviewCache,
  signCompliancePreviewUrl,
} from "@/features/tripCompliance/services/complianceDocumentView.service";

describe("signCompliancePreviewUrl", () => {
  beforeEach(() => {
    mockSignedBuckets.length = 0;
    mockPaintedBuckets.length = 0;
    mockVehicleViewUrl.mockReset();
    mockVehicleViewUrl.mockResolvedValue(null);
  });

  it("signs a supplier cancelled cheque from compliance-documents even if tagged trip", async () => {
    const url = await signCompliancePreviewUrl({
      storagePath: "org/supplier/s1/cancelled_cheque.jpg",
      source: "trip",
    });
    expect(url).toBe("blob:license");
    expect(mockSignedBuckets).toEqual(["compliance-documents"]);
    expect(mockPaintedBuckets).not.toContain("trip-documents");
  });

  it("signs a Driver License from compliance-documents, not the trip bucket", async () => {
    const url = await signCompliancePreviewUrl({
      storagePath: "org/driver/driver-1/license_abc.jpg",
      source: "compliance",
    });
    expect(url).toBe("blob:license");
    expect(mockSignedBuckets).toEqual(["compliance-documents"]);
    expect(mockPaintedBuckets).not.toContain("trip-documents");
  });

  it("re-signs after invalidate so an overwritten PDF is not served from cache", async () => {
    const path = "org/vehicle/v1/rc.pdf";
    await signCompliancePreviewUrl({ storagePath: path, source: "compliance" });
    const signedBefore = mockSignedBuckets.length;
    invalidateCompliancePreviewCache([path]);
    await signCompliancePreviewUrl({ storagePath: path, source: "compliance" });
    expect(mockSignedBuckets.length).toBeGreaterThan(signedBefore);
    expect(mockSignedBuckets).toContain("compliance-documents");
  });

  it("keeps a blob URL from the vehicle helper instead of re-painting under the wrong bucket", async () => {
    mockVehicleViewUrl.mockResolvedValue("blob:vehicle-already-painted");
    const path = "org/v1/insurance.jpeg";
    invalidateCompliancePreviewCache([path]);
    const url = await signCompliancePreviewUrl({
      storagePath: path,
      source: "vehicle-vault",
      organizationId: "org",
      entityId: "v1",
      docType: "insurance",
    });
    expect(url).toBe("blob:vehicle-already-painted");
    expect(mockPaintedBuckets).toEqual([]);
  });

  it("signs compliance-page vehicle uploads from compliance-documents first", async () => {
    const path = "org/vehicle/v1/insurance_abc.jpeg";
    invalidateCompliancePreviewCache([path]);
    const url = await signCompliancePreviewUrl({
      storagePath: path,
      source: "entity",
      organizationId: "org",
      entityId: "v1",
      docType: "insurance",
    });
    expect(url).toBe("blob:compliance-entity");
    expect(mockSignedBuckets).toContain("compliance-documents");
    expect(mockVehicleViewUrl).not.toHaveBeenCalled();
  });
});
