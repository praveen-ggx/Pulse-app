import {
  isPodVerificationFile,
  isPulseHardCopyFileName,
  podCopyWatermarkLabel,
  podVerificationKind,
  podVerificationFiles,
  pulseHardCopyFileName,
} from "@/features/tripCompliance/utils/podVerificationDocuments.util";

describe("podVerificationDocuments.util", () => {
  it("keeps soft and hard POD files and drops vault types", () => {
    const files = podVerificationFiles([
      { id: "1", document_type: "memo", storage_path: "m.pdf" },
      { id: "2", document_type: "pod", storage_path: "soft.pdf", mime_type: "application/pdf" },
      { id: "3", document_type: "pod", storage_path: "hard.jpg", mime_type: "image/jpeg" },
      { id: "4", document_type: "soft_pod", storage_path: "scan.png" },
      { id: "5", document_type: "lr", storage_path: "lr.pdf" },
    ]);
    expect(files.map((file) => file.id)).toEqual(["2", "3", "4"]);
  });

  it("labels pdf as soft and logged images as hard", () => {
    expect(
      podVerificationKind({
        id: "a",
        document_type: "pod",
        file_name: "pod.pdf",
        mime_type: "application/pdf",
      }),
    ).toBe("soft");
    expect(
      podVerificationKind({
        id: "b",
        document_type: "pod",
        file_name: "desk.jpg",
        mime_type: "image/jpeg",
      }),
    ).toBe("hard");
    expect(isPodVerificationFile({ id: "c", document_type: "invoice", storage_path: "i.pdf" })).toBe(
      false,
    );
  });

  it("treats Pulse hard-copy uploads as hard copy, including PDFs", () => {
    expect(pulseHardCopyFileName("scan.pdf")).toBe("pulse.hard-copy-scan.pdf");
    expect(isPulseHardCopyFileName("pulse.hard-copy-scan.pdf")).toBe(true);
    expect(
      podVerificationKind({
        id: "h",
        document_type: "pod",
        file_name: "pulse.hard-copy-scan.pdf",
        mime_type: "application/pdf",
      }),
    ).toBe("hard");
    expect(podCopyWatermarkLabel("hard")).toBe("pulse. hard copy");
    expect(podCopyWatermarkLabel("soft")).toBe("pulse. soft copy");
    expect(
      isPodVerificationFile({
        id: "bulk",
        document_type: "pod",
        file_name: "pulse.hard-copy-PHOTO-2026-10-25-13-41-27.jpg",
        storage_path: "trip/pod/file.jpg",
      }),
    ).toBe(true);
  });
});
