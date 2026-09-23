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

  it("releases the slot in finally after rejection", async () => {
    await expect(
      runSingleflight("tx-cleanup", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(singleflightInflightCountForTests()).toBe(0);
  });
});
