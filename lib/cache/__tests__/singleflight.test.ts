import {
  resetSingleflightForTests,
  runSingleflight,
  singleflightInflightCountForTests,
} from "@/lib/cache/singleflight";

describe("runSingleflight", () => {
  beforeEach(() => {
    resetSingleflightForTests();
  });

  it("dedupes identical concurrent work to one execution", async () => {
    let started = 0;
    const work = () =>
      new Promise<string>((resolve) => {
        started += 1;
        setTimeout(() => resolve("ok"), 20);
      });

    const [a, b, c] = await Promise.all([
      runSingleflight("k", work),
      runSingleflight("k", work),
      runSingleflight("k", work),
    ]);

    expect([a, b, c]).toEqual(["ok", "ok", "ok"]);
    expect(started).toBe(1);
    expect(singleflightInflightCountForTests()).toBe(0);
  });

  it("does not share keys across different flights", async () => {
    let started = 0;
    const work = (label: string) => async () => {
      started += 1;
      return label;
    };

    const [a, b] = await Promise.all([
      runSingleflight("a", work("A")),
      runSingleflight("b", work("B")),
    ]);
    expect(a).toBe("A");
    expect(b).toBe("B");
    expect(started).toBe(2);
  });

  it("allows a later call after the first flight settles", async () => {
    let started = 0;
    const work = () => {
      started += 1;
      return Promise.resolve(started);
    };
    await runSingleflight("k", work);
    await runSingleflight("k", work);
    expect(started).toBe(2);
  });

  it("wraps a thenable that has no finally (PostgREST builder)", async () => {
    const thenable = {
      then(
        onFulfilled?: (value: string) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve("rpc-ok").then(onFulfilled, onRejected);
      },
    };
    await expect(
      runSingleflight("rpc", () => thenable as Promise<string>),
    ).resolves.toBe("rpc-ok");
    expect(singleflightInflightCountForTests()).toBe(0);
  });

  it("does not let a failed flight satisfy the retry", async () => {
    let started = 0;
    const work = async () => {
      started += 1;
      if (started === 1) throw new Error("down");
      return "recovered";
    };
    await expect(runSingleflight("retry", work)).rejects.toThrow("down");
    await expect(runSingleflight("retry", work)).resolves.toBe("recovered");
    expect(started).toBe(2);
    expect(singleflightInflightCountForTests()).toBe(0);
  });

  it("shares an in-flight result and still runs a later refresh", async () => {
    let release: (value: string) => void = () => undefined;
    const first = runSingleflight(
      "org-a",
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const joined = runSingleflight("org-a", () => Promise.resolve("newer"));
    const otherOrg = runSingleflight("org-b", () => Promise.resolve("other"));
    await Promise.resolve();
    release("current");
    await expect(first).resolves.toBe("current");
    await expect(joined).resolves.toBe("current");
    await expect(otherOrg).resolves.toBe("other");
    await expect(runSingleflight("org-a", () => Promise.resolve("refreshed"))).resolves.toBe(
      "refreshed",
    );
  });

  it("releases the slot in finally after rejection", async () => {
    await expect(
      runSingleflight("tx-cleanup", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(singleflightInflightCountForTests()).toBe(0);
  });
});
