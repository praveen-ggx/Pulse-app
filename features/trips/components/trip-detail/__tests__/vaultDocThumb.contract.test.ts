import { readFileSync } from "fs";
import { join } from "path";

const thumb = readFileSync(
  join(process.cwd(), "features/trips/components/trip-detail/VaultDocThumb.tsx"),
  "utf8",
);
const viewer = readFileSync(join(process.cwd(), "components/PdfViewer.web.tsx"), "utf8");

describe("Vault PDF thumb contract", () => {
  it("rasters page 1 without native PDF chrome", () => {
    expect(thumb).toContain('previewTier="thumb"');
    expect(thumb).toContain("showToolbar={false}");
    expect(thumb).toContain("interactive={false}");
    expect(thumb).toContain("Retry");
  });

  it("keeps the iframe hash toolbar off unless the caller asks for chrome", () => {
    expect(viewer).toContain('toolbar=${toolbar}');
    expect(viewer).toContain("Cached first-page JPEG");
    // Only thumbs raster page 1; a reading preview (full tier or scrollbar) keeps the iframe.
    expect(viewer).toMatch(/useBitmapPage\s*=\s*!showToolbar && previewTier !== "full" && !scrollbar/);
    expect(viewer).toContain("if (useBitmapPage)");
  });

  it("lets Compliance scroll PDF pages unless the app owns rotate/pan", () => {
    const workspace = readFileSync(
      join(process.cwd(), "features/tripCompliance/components/ComplianceDocumentWorkspace.tsx"),
      "utf8",
    );
    expect(workspace).toContain('previewTier={pdfViewOwned ? "thumb" : "full"}');
    expect(workspace).toContain("scrollbar={!pdfViewOwned}");
  });
});

describe("full-preview surfaces that still need native chrome", () => {
  const modal = readFileSync(
    join(process.cwd(), "features/tripCompliance/components/ComplianceDocumentPreviewModal.tsx"),
    "utf8",
  );
  const pod = readFileSync(
    join(process.cwd(), "features/trips/components/trip-detail/HardCopyPodPhotoUpload.tsx"),
    "utf8",
  );

  it("asks for the iframe toolbar on the compliance inspect modal", () => {
    expect(modal).toContain("<PdfViewer pdfUri={url} showToolbar />");
  });

  it("keeps POD lightbox chrome only while keepPdfChrome is set", () => {
    expect(pod).toContain("showToolbar={keepPdfChrome}");
    expect(pod).toContain("showToolbar={false}");
  });
});
