import {
  hardCopyPodPhotoRejectionMessage,
  isHardCopyPodPhoto,
  shortHardCopyPodPhotoName,
} from "../hardCopyPodPhotos.util";

describe("hard copy POD photos", () => {
  it("accepts jpg, jpeg, png, and webp", () => {
    expect(isHardCopyPodPhoto({ name: "pod.jpg", mimeType: "image/jpeg" })).toBe(true);
    expect(isHardCopyPodPhoto({ name: "pod.jpeg" })).toBe(true);
    expect(isHardCopyPodPhoto({ name: "pod.png", mimeType: "image/png" })).toBe(true);
    expect(isHardCopyPodPhoto({ name: "pod.webp", mimeType: "image/webp" })).toBe(true);
  });

  it("rejects unsupported types", () => {
    expect(isHardCopyPodPhoto({ name: "notes.pdf", mimeType: "application/pdf" })).toBe(false);
    expect(
      hardCopyPodPhotoRejectionMessage([{ name: "notes.pdf", mimeType: "application/pdf" }]),
    ).toMatch(/not supported/);
  });

  it("rejects files over the existing 100 MB limit and does not cap photo count", () => {
    const huge = { name: "scan.jpg", mimeType: "image/jpeg", size: 101 * 1024 * 1024 };
    expect(hardCopyPodPhotoRejectionMessage([huge])).toMatch(/100 MB/);
    const many = Array.from({ length: 12 }, (_, index) => ({
      name: `pod-${index}.jpg`,
      mimeType: "image/jpeg",
      size: 200_000,
    }));
    expect(hardCopyPodPhotoRejectionMessage(many)).toBeNull();
  });

  it("shortens long file names without dropping the extension", () => {
    expect(shortHardCopyPodPhotoName("very-long-physical-pod-scan.jpg")).toMatch(/\.jpg$/);
    expect(shortHardCopyPodPhotoName("pod.jpg")).toBe("pod.jpg");
  });
});
