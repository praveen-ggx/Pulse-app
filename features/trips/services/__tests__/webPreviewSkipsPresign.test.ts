/**
 * On web a document preview is painted from a downloaded Blob; a signed URL is
 * only fetched if that download fails. Compliance signed every file first anyway
 * (prod: 12 sign + 11 download Storage calls per Compliance load, every file both).
 * Web now skips the up-front sign; native, which paints the signed URL, keeps it.
 */
const mockCreateSignedUrl = jest.fn();
const mockCreateSignedUrls = jest.fn();
const mockPreview = jest.fn();
let mockWeb = true;

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    storage: {
      from: () => ({
        createSignedUrl: (...a: unknown[]) => mockCreateSignedUrl(...a),
        createSignedUrls: (...a: unknown[]) => mockCreateSignedUrls(...a),
      }),
    },
  }),
}));

jest.mock("@/features/trips/utils/storagePreviewObjectUrl.util", () => ({
  canMaterializeStoragePreview: () => mockWeb,
  previewPrivateObject: (...a: unknown[]) => mockPreview(...a),
  storagePreviewFailureMessage: (kind: string) => `failure:${kind}`,
  invalidateStoragePreviewPath: jest.fn(),
  invalidateStoragePreviewPrefix: jest.fn(),
}));

import { getComplianceDocumentSignedUrl } from "@/features/compliance/services/documents.service";
import { getDocumentViewUrls, tryGetDocumentViewUrl } from "@/features/trips/services/tripDocuments.service";

beforeEach(() => {
  mockCreateSignedUrl.mockReset().mockResolvedValue({ data: { signedUrl: "https://signed/x" }, error: null });
  mockCreateSignedUrls
    .mockReset()
    .mockImplementation(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}`, error: null })),
      error: null,
    }));
  mockPreview.mockReset().mockResolvedValue({ url: "blob:painted", kind: null });
});

describe("web", () => {
  beforeEach(() => {
    mockWeb = true;
  });

  test("trip document preview does not sign first", async () => {
    await expect(tryGetDocumentViewUrl("org/trip/lr/a.jpeg")).resolves.toBe("blob:painted");
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
    expect(mockCreateSignedUrls).not.toHaveBeenCalled();
    expect(mockPreview).toHaveBeenCalledWith("trip-documents", "org/trip/lr/a.jpeg", null);
  });

  test("batch trip previews do not sign first", async () => {
    await getDocumentViewUrls(["org/t/a.jpeg", "org/t/b.pdf"]);
    expect(mockCreateSignedUrls).not.toHaveBeenCalled();
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
    expect(mockPreview).toHaveBeenCalledTimes(2);
  });

  test("compliance document preview does not sign first and keeps failure messages", async () => {
    await expect(getComplianceDocumentSignedUrl("org/vehicle/rc.pdf")).resolves.toEqual({
      url: "blob:painted",
      error: null,
    });
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
    mockPreview.mockResolvedValueOnce({ url: null, kind: "missing" });
    const res = await getComplianceDocumentSignedUrl("org/vehicle/gone.pdf");
    expect(res.url).toBeNull();
    expect(res.error?.message).toBe("failure:missing");
  });
});

describe("native", () => {
  beforeEach(() => {
    mockWeb = false;
  });

  test("trip document preview still passes a signed URL", async () => {
    await tryGetDocumentViewUrl("org/trip/lr/n.jpeg");
    expect(mockCreateSignedUrl.mock.calls.length + mockCreateSignedUrls.mock.calls.length).toBeGreaterThan(0);
    expect(mockPreview.mock.calls[0][2]).toEqual(expect.stringContaining("https://signed/"));
  });

  test("compliance document preview still signs first", async () => {
    await getComplianceDocumentSignedUrl("org/vehicle/rc-native.pdf");
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
    expect(mockPreview).toHaveBeenCalledWith("compliance-documents", "org/vehicle/rc-native.pdf", "https://signed/x");
  });
});
