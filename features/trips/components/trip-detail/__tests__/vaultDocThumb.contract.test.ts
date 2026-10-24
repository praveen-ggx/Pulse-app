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
    expect(viewer).toContain("if (!showToolbar)");
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
