import {
  nativePdfViewerHtml,
  shouldRasterizePdfForViewport,
  uint8ToBase64,
} from "@/components/mobilePdfPreview.util";

describe("shouldRasterizePdfForViewport", () => {
  it("rasters iPhone, Android phone, and narrow web", () => {
    expect(
      shouldRasterizePdfForViewport({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        width: 1200,
      }),
    ).toBe(true);
    expect(
      shouldRasterizePdfForViewport({
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari",
        width: 1200,
      }),
    ).toBe(true);
    expect(
      shouldRasterizePdfForViewport({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        maxTouchPoints: 0,
        width: 390,
      }),
    ).toBe(true);
  });

  it("rasters Safari and blob URLs — iframe PDF is blank there", () => {
    expect(
      shouldRasterizePdfForViewport({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        maxTouchPoints: 0,
        width: 1280,
      }),
    ).toBe(true);
    expect(
      shouldRasterizePdfForViewport({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0",
        maxTouchPoints: 0,
        width: 1280,
        uri: "blob:https://gogopulse.com/abc",
      }),
    ).toBe(true);
  });

  it("keeps the desktop iframe path on wide Chrome with an https file", () => {
    expect(
      shouldRasterizePdfForViewport({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0",
        maxTouchPoints: 0,
        width: 1280,
        uri: "https://example.com/file.pdf",
      }),
    ).toBe(false);
  });
});

describe("nativePdfViewerHtml", () => {
  it("embeds pdf.js and the file bytes", () => {
    const html = nativePdfViewerHtml(uint8ToBase64(new Uint8Array([1, 2, 3, 4])));
    expect(html).toContain("pdf.min.js");
    expect(html).toContain("getDocument");
    expect(html).toContain("canvas");
  });
});
