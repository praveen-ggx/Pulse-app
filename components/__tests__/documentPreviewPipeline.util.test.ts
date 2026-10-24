import {
  createDocumentPreviewPipeline,
  documentPreviewCacheKey,
  documentPreviewIdentity,
  isLikelyExpiredSignedUrlError,
  previewTierForBox,
} from "@/components/documentPreviewPipeline.util";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("documentPreviewPipeline", () => {
  it("versions cache keys so a replaced document misses", () => {
    const first = documentPreviewCacheKey({
      documentKey: "trips/a/lr.pdf",
      version: "doc-1",
      page: 1,
      tier: "thumb",
    });
    const replaced = documentPreviewCacheKey({
      documentKey: "trips/a/lr.pdf",
      version: "doc-2",
      page: 1,
      tier: "thumb",
    });
    expect(first).not.toBe(replaced);
    expect(first).toContain("trips/a/lr.pdf");
  });

  it("does not use a signed URL as identity when a storage path exists", () => {
    const identity = documentPreviewIdentity({
      storagePath: "trips/a/lr.pdf",
      documentId: "row-9",
      fileId: "https://x.supabase.co/storage/v1/object/sign/trips/a/lr.pdf?token=exp",
    });
    expect(identity).toEqual({ documentKey: "trips/a/lr.pdf", version: "row-9" });
  });

  it("separates thumbnail and full-preview tiers", () => {
    expect(previewTierForBox(40, 48)).toBe("thumb");
    expect(previewTierForBox(148, 148)).toBe("thumb");
    expect(previewTierForBox(640, 400)).toBe("full");
    expect(
      documentPreviewCacheKey({
        documentKey: "p",
        version: "1",
        tier: "thumb",
      }),
    ).not.toBe(
      documentPreviewCacheKey({
        documentKey: "p",
        version: "1",
        tier: "full",
      }),
    );
  });

  it("deduplicates concurrent requests for the same document version", async () => {
    let renders = 0;
    const pipeline = createDocumentPreviewPipeline({
      async render() {
        renders += 1;
        await delay(20);
        return "jpeg-a";
      },
    });
    const request = { documentKey: "p", version: "v1", tier: "thumb" as const };
    const [a, b, c] = await Promise.all([
      pipeline.get(request),
      pipeline.get(request),
      pipeline.get(request),
    ]);
    expect([a, b, c]).toEqual(["jpeg-a", "jpeg-a", "jpeg-a"]);
    expect(renders).toBe(1);
    expect(pipeline.stats().hits).toBeGreaterThanOrEqual(2);
  });

  it("bounds concurrent renders", async () => {
    let current = 0;
    let peak = 0;
    const pipeline = createDocumentPreviewPipeline({
      concurrency: 2,
      async render(request) {
        current += 1;
        peak = Math.max(peak, current);
        await delay(25);
        current -= 1;
        return request.documentKey;
      },
    });
    await Promise.all(
      ["a", "b", "c", "d"].map((key) =>
        pipeline.get({ documentKey: key, version: "1", tier: "thumb" }),
      ),
    );
    expect(peak).toBeLessThanOrEqual(2);
    expect(pipeline.stats().queuePeak).toBeGreaterThanOrEqual(1);
  });

  it("evicts a rejected render so retry is not stuck", async () => {
    let attempt = 0;
    const pipeline = createDocumentPreviewPipeline({
      async render() {
        attempt += 1;
        if (attempt === 1) throw new Error("403 expired");
        return "ok";
      },
    });
    const request = { documentKey: "p", version: "v1", tier: "thumb" as const };
    await expect(pipeline.get(request)).rejects.toThrow(/expired/);
    await expect(pipeline.get(request)).resolves.toBe("ok");
    expect(attempt).toBe(2);
    expect(isLikelyExpiredSignedUrlError(new Error("403 expired"))).toBe(true);
  });

  it("invalidates the previous version after replacement", async () => {
    const disposed: string[] = [];
    const pipeline = createDocumentPreviewPipeline({
      async render(request) {
        return `${request.version}-bitmap`;
      },
      dispose: (value) => disposed.push(value),
    });
    await pipeline.get({ documentKey: "p", version: "old", tier: "thumb" });
    pipeline.invalidateDocument("p");
    expect(disposed).toEqual(["old-bitmap"]);
    expect(pipeline.peek({ documentKey: "p", version: "old", tier: "thumb" })).toBeNull();
    await expect(pipeline.get({ documentKey: "p", version: "new", tier: "thumb" })).resolves.toBe(
      "new-bitmap",
    );
  });

  it("cancels obsolete queued work and does not cache it", async () => {
    const pipeline = createDocumentPreviewPipeline({
      concurrency: 1,
      async render(request, ctx) {
        await delay(30);
        if (ctx.signal.aborted) throw new Error("cancelled");
        return request.documentKey;
      },
    });
    const first = pipeline.get({ documentKey: "visible", version: "1", tier: "thumb" }, { priority: 2 });
    const controller = new AbortController();
    const queued = pipeline.get(
      { documentKey: "offscreen", version: "1", tier: "thumb" },
      { priority: 0, signal: controller.signal },
    );
    controller.abort();
    await expect(queued).rejects.toBeTruthy();
    await expect(first).resolves.toBe("visible");
    expect(pipeline.peek({ documentKey: "offscreen", version: "1", tier: "thumb" })).toBeNull();
  });

  it("disposes evicted bitmaps when the cache is bounded", async () => {
    const disposed: string[] = [];
    const pipeline = createDocumentPreviewPipeline({
      maxEntries: 4,
      async render(request) {
        return request.documentKey;
      },
      dispose: (value) => disposed.push(value),
    });
    for (const key of ["a", "b", "c", "d", "e"]) {
      await pipeline.get({ documentKey: key, version: "1", tier: "thumb" });
    }
    expect(pipeline.size()).toBe(4);
    expect(disposed).toContain("a");
  });
});
