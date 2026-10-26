import { pdfEmbedCacheKey, previewEdgeForBox } from "@/components/pdfEmbedCache.util";
import { documentPreviewIdentity } from "@/components/documentPreviewPipeline.util";

describe("pdfEmbedCache identity", () => {
  it("buckets vault cards separately from full-page preview", () => {
    expect(previewEdgeForBox(148, 148)).toBe(480);
    expect(previewEdgeForBox(40, 48)).toBe(480);
    expect(previewEdgeForBox(640, 420)).toBe(1200);
  });

  it("does not treat an expiring signed URL as the document key", () => {
    const identity = documentPreviewIdentity({
      storagePath: "org/trip/lr.pdf",
      documentId: "abc",
      fileId: "https://example.com/lr.pdf?token=1",
    });
    expect(identity?.documentKey).toBe("org/trip/lr.pdf");
    expect(pdfEmbedCacheKey("https://example.com/lr.pdf#toolbar=0", 1, 480)).toContain("thumb");
  });
});
