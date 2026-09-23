import {
  noteSupabaseOriginDown,
  resetSupabaseCircuit,
} from "@/lib/supabaseHttp.util";
import {
  createStorageSignedUrlCache,
  SIGNED_URL_CACHE_TTL_MS,
} from "../storageSignedUrlCache";

describe("createStorageSignedUrlCache", () => {
  function createHarness() {
    const signOne = jest.fn(
      async (path: string): Promise<{ signedUrl: string | null }> => ({
        signedUrl: `https://signed.example/${path}`,
      }),
    );
    const signMany = jest.fn(async (paths: string[]) =>
      paths.map((path) => ({
        path,
        signedUrl: `https://signed.example/${path}`,
      })),
    );
    const cache = createStorageSignedUrlCache({ signOne, signMany });
    return { cache, signOne, signMany };
  }

  it("does not sign empty paths", async () => {
    const { cache, signOne, signMany } = createHarness();
    await expect(cache.getUrl("  ")).resolves.toBeNull();
    expect(signOne).not.toHaveBeenCalled();
    expect(signMany).not.toHaveBeenCalled();
  });

  it("shares one in-flight signOne for the same path", async () => {
    const { cache, signOne, signMany } = createHarness();
    const [a, b, c] = await Promise.all([
      cache.getUrl("org/v1/rc.jpg"),
      cache.getUrl("org/v1/rc.jpg"),
      cache.getUrl("org/v1/rc.jpg"),
    ]);
    expect(signOne).toHaveBeenCalledTimes(1);
    expect(signMany).not.toHaveBeenCalled();
    expect(a).toBe("https://signed.example/org/v1/rc.jpg");
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("batches distinct uncached paths in one createSignedUrls call", async () => {
    const { cache, signOne, signMany } = createHarness();
    const result = await cache.getUrls([
      "org/v1/rc.jpg",
      "org/v1/fitness.jpg",
      "org/v1/insurance.jpg",
      "org/v1/pollution.jpg",
    ]);
    expect(signMany).toHaveBeenCalledTimes(1);
    expect(signMany.mock.calls[0]?.[0]).toEqual([
      "org/v1/rc.jpg",
      "org/v1/fitness.jpg",
      "org/v1/insurance.jpg",
      "org/v1/pollution.jpg",
    ]);
    expect(signOne).not.toHaveBeenCalled();
    expect(result["org/v1/rc.jpg"]).toBe("https://signed.example/org/v1/rc.jpg");
    expect(result["org/v1/fitness.jpg"]).toBe(
      "https://signed.example/org/v1/fitness.jpg",
    );
  });

  it("only signs uncached files on a mixed gallery", async () => {
    const { cache, signOne, signMany } = createHarness();
    await cache.getUrl("org/v1/rc.jpg");
    signOne.mockClear();
    const result = await cache.getUrls([
      "org/v1/rc.jpg",
      "org/v1/fitness.jpg",
    ]);
    expect(signOne).toHaveBeenCalledTimes(1);
    expect(signOne.mock.calls[0]?.[0]).toBe("org/v1/fitness.jpg");
    expect(signMany).not.toHaveBeenCalled();
    expect(result["org/v1/rc.jpg"]).toBe("https://signed.example/org/v1/rc.jpg");
    expect(result["org/v1/fitness.jpg"]).toBe(
      "https://signed.example/org/v1/fitness.jpg",
    );
  });

  it("does not cache failed signing attempts", async () => {
    const signOne = jest.fn(async () => ({ signedUrl: null, error: "missing" }));
    const signMany = jest.fn(async () => []);
    const cache = createStorageSignedUrlCache({ signOne, signMany });
    await expect(cache.getUrl("org/v1/rc.jpg")).resolves.toBeNull();
    await expect(cache.getUrl("org/v1/rc.jpg")).resolves.toBeNull();
    expect(signOne).toHaveBeenCalledTimes(2);
  });

  it("invalidates a replaced file so the next preview re-signs", async () => {
    const { cache, signOne } = createHarness();
    await cache.getUrl("org/v1/rc.jpg");
    cache.invalidate("org/v1/rc.jpg");
    await cache.getUrl("org/v1/rc.jpg");
    expect(signOne).toHaveBeenCalledTimes(2);
  });

  it("does not store a stale in-flight URL after invalidate", async () => {
    let finishFirst: (url: string) => void = () => {};
    const signOne = jest.fn((path: string) => {
      if (signOne.mock.calls.length === 1) {
        return new Promise<{ signedUrl: string | null }>((resolve) => {
          finishFirst = (url) => resolve({ signedUrl: url });
        });
      }
      return Promise.resolve({ signedUrl: `https://fresh.example/${path}` });
    });
    const cache = createStorageSignedUrlCache({
      signOne,
      signMany: async () => [],
    });

    const first = cache.getUrl("org/v1/rc.jpg");
    cache.invalidate("org/v1/rc.jpg");
    const second = cache.getUrl("org/v1/rc.jpg");
    finishFirst("https://stale.example/org/v1/rc.jpg");

    await expect(first).resolves.toBe("https://stale.example/org/v1/rc.jpg");
    await expect(second).resolves.toBe("https://fresh.example/org/v1/rc.jpg");
    expect(cache.peek("org/v1/rc.jpg")).toBe(
      "https://fresh.example/org/v1/rc.jpg",
    );
  });

  it("refreshes after the cache TTL", async () => {
    const { cache, signOne } = createHarness();
    await cache.getUrl("org/v1/rc.jpg");
    const nowSpy = jest.spyOn(Date, "now");
    const frozen = Date.now();
    nowSpy.mockReturnValue(frozen + SIGNED_URL_CACHE_TTL_MS + 1);
    await cache.getUrl("org/v1/rc.jpg");
    expect(signOne).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it("does not issue new sign requests while the origin circuit is open", async () => {
    const { cache, signOne, signMany } = createHarness();
    await cache.getUrl("org/v1/rc.jpg");
    signOne.mockClear();
    noteSupabaseOriginDown();
    await expect(cache.getUrl("org/v1/fitness.jpg")).resolves.toBeNull();
    const batch = await cache.getUrls(["org/v1/rc.jpg", "org/v1/fitness.jpg"]);
    expect(batch["org/v1/rc.jpg"]).toBe("https://signed.example/org/v1/rc.jpg");
    expect(batch["org/v1/fitness.jpg"]).toBeNull();
    expect(signOne).not.toHaveBeenCalled();
    expect(signMany).not.toHaveBeenCalled();
    resetSupabaseCircuit();
  });
});
