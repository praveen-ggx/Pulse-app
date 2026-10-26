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
}));

import { signCompliancePreviewUrl } from "@/features/tripCompliance/services/complianceDocumentView.service";

describe("signCompliancePreviewUrl", () => {
  beforeEach(() => {
    mockSignedBuckets.length = 0;
    mockPaintedBuckets.length = 0;
  });

  it("signs a Driver License from compliance-documents, not the trip bucket", async () => {
    await signCompliancePreviewUrl({
      storagePath: "org/driver/driver-1/license_abc.jpg",
      source: "compliance",
    });
    expect(mockSignedBuckets).toEqual(["compliance-documents"]);
    expect(mockPaintedBuckets).not.toContain("trip-documents");
  });
});
