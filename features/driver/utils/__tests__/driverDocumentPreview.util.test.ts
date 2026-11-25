import {
  canOpenPreviewExternally,
  isDriverDocImage,
  isDriverDocPdf,
} from "@/features/driver/utils/driverDocumentPreview.util";

describe("driverDocumentPreview.util", () => {
  it("detects PDF by mime and extension", () => {
    expect(
      isDriverDocPdf({ mime_type: "application/pdf", file_name: "a.jpg" }),
    ).toBe(true);
    expect(
      isDriverDocPdf({
        mime_type: "image/jpeg",
        file_name: "proof.pdf",
      }),
    ).toBe(false);
    expect(
      isDriverDocPdf({
        mime_type: null,
        file_name: "pod.pdf",
        storage_path: "t/pod/x.pdf",
      }),
    ).toBe(true);
  });

  it("detects images and rejects pdfs", () => {
    expect(
      isDriverDocImage({ mime_type: "image/jpeg", file_name: "a.jpg" }),
    ).toBe(true);
    expect(
      isDriverDocImage({ mime_type: "application/pdf", file_name: "a.pdf" }),
    ).toBe(false);
  });

  it("only allows https for external open", () => {
    expect(canOpenPreviewExternally("https://x.example/pod.jpg")).toBe(true);
    expect(canOpenPreviewExternally("blob:https://x/1")).toBe(false);
    expect(canOpenPreviewExternally(null)).toBe(false);
  });
});
