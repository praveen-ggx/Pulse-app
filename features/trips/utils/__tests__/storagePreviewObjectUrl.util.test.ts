import {
  openStoragePreview,
  previewPrivateObject,
  releaseStoragePreviewUrl,
  resetStoragePreviewCacheForTests,
  storagePreviewFailureMessage,
} from "../storagePreviewObjectUrl.util";

const mockDownload = jest.fn();
const mockCreateSignedUrl = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    storage: {
      from: () => ({
        download: mockDownload,
        createSignedUrl: mockCreateSignedUrl,
      }),
    },
  }),
}));

function blob(contents = "file"): Blob {
  return new Blob([contents], { type: "image/jpeg" });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetStoragePreviewCacheForTests();
  const urls = ["blob:1", "blob:2", "blob:3"];
  let created = 0;
  (globalThis as { document?: object }).document = {};
  URL.createObjectURL = jest.fn(() => urls[created++] ?? `blob:${created}`);
  URL.revokeObjectURL = jest.fn();
  mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/file" }, error: null });
  globalThis.fetch = jest.fn();
});

afterEach(() => {
  resetStoragePreviewCacheForTests();
  delete (globalThis as { document?: object }).document;
});

describe("openStoragePreview", () => {
  it("paints a local picker URI without calling Storage", async () => {
    const opened = await openStoragePreview({
      bucket: "trip-documents",
      path: "blob:http://localhost:8081/preview-1",
    });
    expect(opened).toEqual({
      ok: true,
      url: "blob:http://localhost:8081/preview-1",
      release: expect.any(Function),
    });
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("previews an authenticated download as a blob URL", async () => {
    mockDownload.mockResolvedValue({ data: blob(), error: null });
    const opened = await openStoragePreview({ bucket: "trip-documents", path: "trip/lr/a.jpg" });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.url).toBe("blob:1");
    expect(mockDownload).toHaveBeenCalledWith("trip/lr/a.jpg");
    expect(String(opened.url)).not.toContain("signed");
  });

  it("does not report a signed URL when the download and the signed fetch both fail", async () => {
    mockDownload.mockResolvedValue({ data: null, error: { message: "Object not found", statusCode: 404 } });
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/missing" }, error: null });
    (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" });

    const opened = await openStoragePreview({
      bucket: "trip-documents",
      path: "trip/lr/missing.jpg",
      signedUrl: "https://signed.example/missing",
    });

    expect(opened).toEqual({ ok: false, kind: "missing" });
    expect(storagePreviewFailureMessage("missing")).toMatch(/missing/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it("classifies unauthorized and expired access separately from a preview failure", async () => {
    mockDownload.mockResolvedValueOnce({ data: null, error: { message: "Unauthorized", statusCode: 401 } });
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: "Unauthorized" } });
    const denied = await openStoragePreview({ bucket: "compliance-documents", path: "org/a.pdf" });
    expect(denied).toEqual({ ok: false, kind: "unauthorized" });

    mockDownload.mockResolvedValueOnce({ data: null, error: { message: "jwt expired", statusCode: 400 } });
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: "jwt expired" } });
    const expired = await openStoragePreview({ bucket: "vehicle-documents", path: "org/rc.pdf" });
    expect(expired).toEqual({ ok: false, kind: "expired" });
  });

  it("retries a failed preview instead of replaying the cached failure", async () => {
    mockDownload.mockResolvedValueOnce({ data: null, error: { message: "network", statusCode: 500 } });
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: "network" } });
    const failed = await openStoragePreview({ bucket: "driver-documents", path: "kyc/a.jpg" });
    expect(failed.ok).toBe(false);

    mockDownload.mockResolvedValueOnce({ data: blob("ok"), error: null });
    const retried = await openStoragePreview({ bucket: "driver-documents", path: "kyc/a.jpg" });
    expect(retried.ok).toBe(true);
    expect(mockDownload).toHaveBeenCalledTimes(2);
  });

  it("revokes a blob URL only after the last viewer releases it", async () => {
    mockDownload.mockResolvedValue({ data: blob(), error: null });
    const first = await openStoragePreview({ bucket: "trip-documents", path: "trip/pod/a.jpg" });
    const second = await openStoragePreview({ bucket: "trip-documents", path: "trip/pod/a.jpg" });
    expect(mockDownload).toHaveBeenCalledTimes(1);
    if (!first.ok || !second.ok) throw new Error("expected both previews");

    first.release();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    second.release();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
    second.release();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("revokes the replaced preview and keeps the new one", async () => {
    mockDownload
      .mockResolvedValueOnce({ data: blob("a"), error: null })
      .mockResolvedValueOnce({ data: blob("b"), error: null });
    const first = await openStoragePreview({ bucket: "trip-documents", path: "trip/lr/old.jpg" });
    const next = await openStoragePreview({ bucket: "trip-documents", path: "trip/lr/new.jpg" });
    if (!first.ok || !next.ok) throw new Error("expected both previews");

    first.release();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(first.url);
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(next.url);
    next.release();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(next.url);
  });

  it("does not return a native signed URL when the object is missing", async () => {
    delete (globalThis as { document?: object }).document;
    mockDownload.mockResolvedValue({ data: null, error: { message: "Object not found", statusCode: 404 } });
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/missing" }, error: null });
    (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" });

    const opened = await openStoragePreview({
      bucket: "trip-documents",
      path: "trip/lr/missing.jpg",
      signedUrl: "https://signed.example/missing",
    });

    expect(opened).toEqual({ ok: false, kind: "missing" });
  });

  it("returns a native signed URL only after the object download succeeds", async () => {
    delete (globalThis as { document?: object }).document;
    mockDownload.mockResolvedValue({ data: blob("native"), error: null });

    const opened = await openStoragePreview({
      bucket: "trip-documents",
      path: "trip/lr/native.jpg",
      signedUrl: "https://signed.example/native.jpg",
    });

    expect(opened).toEqual({
      ok: true,
      url: "https://signed.example/native.jpg",
      release: expect.any(Function),
    });
  });

  it("releases a held preview URL when the viewer unmounts", async () => {
    mockDownload.mockResolvedValue({ data: blob(), error: null });
    const preview = await previewPrivateObject("trip-documents", "trip/invoice/a.pdf");
    expect(preview.url).toBe("blob:1");
    releaseStoragePreviewUrl(preview.url);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });
});
