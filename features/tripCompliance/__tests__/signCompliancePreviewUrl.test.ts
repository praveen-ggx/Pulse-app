const mockSignedBuckets: string[] = [];
const mockPaintedBuckets: string[] = [];

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

import {
  invalidateCompliancePreviewCache,
  signCompliancePreviewUrl,
} from "@/features/tripCompliance/services/complianceDocumentView.service";

describe("signCompliancePreviewUrl", () => {
  beforeEach(() => {
    mockSignedBuckets.length = 0;
    mockPaintedBuckets.length = 0;
  });

  it("signs a supplier cancelled cheque from compliance-documents even if tagged trip", async () => {
    await signCompliancePreviewUrl({
      storagePath: "org/supplier/s1/cancelled_cheque.jpg",
      source: "trip",
    });
    expect(mockSignedBuckets).toEqual(["compliance-documents"]);
    expect(mockPaintedBuckets).not.toContain("trip-documents");
  });

  it("signs a Driver License from compliance-documents, not the trip bucket", async () => {
    await signCompliancePreviewUrl({
      storagePath: "org/driver/driver-1/license_abc.jpg",
      source: "compliance",
    });
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
});
