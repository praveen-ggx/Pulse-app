import { act, renderHook } from "@testing-library/react-native";
import { useCoalescedLoader } from "../useCoalescedLoader";

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useCoalescedLoader", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("joins an in-flight unforced load instead of starting another", async () => {
    const gate = deferred();
    let runs = 0;
    const { result } = renderHook(() =>
      useCoalescedLoader(
        async () => {
          runs += 1;
          await gate.promise;
        },
        { minIntervalMs: 15_000 },
      ),
    );

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current();
      second = result.current();
    });
    expect(runs).toBe(1);
    await act(async () => {
      gate.resolve();
      await first;
      await second;
    });
    expect(runs).toBe(1);
  });

  it("skips an unforced load inside the interval and runs a forced one", async () => {
    let runs = 0;
    const { result } = renderHook(() =>
      useCoalescedLoader(
        async () => {
          runs += 1;
        },
        { minIntervalMs: 15_000 },
      ),
    );

    await act(async () => {
      await result.current();
    });
    expect(runs).toBe(1);
    await act(async () => {
      await result.current();
    });
    expect(runs).toBe(1);
    await act(async () => {
      await result.current({ force: true });
    });
    expect(runs).toBe(2);
  });

  it("queues one follow-up when a forced load arrives during a load", async () => {
    const gate = deferred();
    let runs = 0;
    const { result } = renderHook(() =>
      useCoalescedLoader(
        async () => {
          runs += 1;
          if (runs === 1) await gate.promise;
        },
        { minIntervalMs: 15_000 },
      ),
    );

    let first!: Promise<void>;
    let forced!: Promise<void>;
    act(() => {
      first = result.current();
      forced = result.current({ force: true });
    });
    expect(runs).toBe(1);
    await act(async () => {
      gate.resolve();
      await first;
      await forced;
    });
    expect(runs).toBe(2);
  });

  it("queues one follow-up when several forced loads arrive during a load", async () => {
    const gate = deferred();
    let runs = 0;
    const { result } = renderHook(() =>
      useCoalescedLoader(
        async () => {
          runs += 1;
          if (runs === 1) await gate.promise;
        },
        { minIntervalMs: 15_000 },
      ),
    );

    let first!: Promise<void>;
    let forcedA!: Promise<void>;
    let forcedB!: Promise<void>;
    act(() => {
      first = result.current();
      forcedA = result.current({ force: true });
      forcedB = result.current({ force: true });
    });
    expect(forcedA).toBe(forcedB);
    expect(runs).toBe(1);
    await act(async () => {
      gate.resolve();
      await first;
      await forcedA;
      await forcedB;
    });
    expect(runs).toBe(2);
  });

  it("does not treat a failed load as fresh", async () => {
    let fail = true;
    let runs = 0;
    const { result } = renderHook(() =>
      useCoalescedLoader(
        async () => {
          runs += 1;
          if (fail) throw new Error("wallet load failed");
        },
        { minIntervalMs: 15_000 },
      ),
    );

    await act(async () => {
      await result.current().catch(() => undefined);
    });
    expect(runs).toBe(1);
    await act(async () => {
      await result.current().catch(() => undefined);
    });
    expect(runs).toBe(2);
    fail = false;
    await act(async () => {
      await result.current().catch(() => undefined);
    });
    expect(runs).toBe(3);
    await act(async () => {
      await result.current();
    });
    expect(runs).toBe(3);
  });

  it("does not start the queued follow-up after unmount", async () => {
    const gate = deferred();
    let runs = 0;
    const { result, unmount } = renderHook(() =>
      useCoalescedLoader(
        async () => {
          runs += 1;
          if (runs === 1) await gate.promise;
        },
        { minIntervalMs: 15_000 },
      ),
    );

    let first!: Promise<void>;
    let forced!: Promise<void>;
    act(() => {
      first = result.current();
      forced = result.current({ force: true });
    });
    unmount();
    await act(async () => {
      gate.resolve();
      await first.catch(() => undefined);
      await forced.catch(() => undefined);
    });
    expect(runs).toBe(1);
  });

  it("ignores a superseded load that resolves before the replacement", async () => {
    const gates = [deferred(), deferred()];
    let runs = 0;
    const applied: number[] = [];
    const { result } = renderHook(() =>
      useCoalescedLoader(
        async ({ isCurrent }) => {
          const id = runs;
          runs += 1;
          await gates[id].promise;
          if (isCurrent()) applied.push(id);
        },
        { minIntervalMs: 15_000 },
      ),
    );

    let first!: Promise<void>;
    let replacement!: Promise<void>;
    act(() => {
      first = result.current();
    });
    await act(async () => {
      replacement = result.current({ supersede: true });
      await Promise.resolve();
    });
    expect(runs).toBe(2);
    await act(async () => {
      gates[0].resolve();
      await first;
    });
    expect(applied).toEqual([]);
    await act(async () => {
      gates[1].resolve();
      await replacement;
    });
    expect(applied).toEqual([1]);
  });

  it("ignores a superseded load that resolves after the replacement", async () => {
    const gates = [deferred(), deferred()];
    let runs = 0;
    const applied: number[] = [];
    const { result } = renderHook(() =>
      useCoalescedLoader(
        async ({ isCurrent }) => {
          const id = runs;
          runs += 1;
          await gates[id].promise;
          if (isCurrent()) applied.push(id);
        },
        { minIntervalMs: 15_000 },
      ),
    );

    let first!: Promise<void>;
    let replacement!: Promise<void>;
    act(() => {
      first = result.current();
    });
    await act(async () => {
      replacement = result.current({ supersede: true });
      await Promise.resolve();
    });
    await act(async () => {
      gates[1].resolve();
      await replacement;
    });
    expect(applied).toEqual([1]);
    await act(async () => {
      gates[0].resolve();
      await first;
    });
    expect(applied).toEqual([1]);
  });

  it("ignores a superseded load that fails after the replacement succeeds", async () => {
    const gates = [deferred(), deferred()];
    let runs = 0;
    const applied: string[] = [];
    const { result } = renderHook(() =>
      useCoalescedLoader(
        async ({ isCurrent }) => {
          const id = runs;
          runs += 1;
          try {
            await gates[id].promise;
            if (!isCurrent()) return;
            applied.push(id === 0 ? "stale" : "fresh");
          } catch (err) {
            if (!isCurrent()) return;
            applied.push("stale-error");
            throw err;
          }
        },
        { minIntervalMs: 15_000 },
      ),
    );

    let first!: Promise<void>;
    let replacement!: Promise<void>;
    act(() => {
      first = result.current();
    });
    await act(async () => {
      replacement = result.current({ supersede: true });
      await Promise.resolve();
    });
    await act(async () => {
      gates[1].resolve();
      await replacement;
      gates[0].reject(new Error("stale connection"));
      await first.catch(() => undefined);
    });
    expect(applied).toEqual(["fresh"]);
    expect(runs).toBe(2);
  });

  it("starts one replacement when the connection changes more than once", async () => {
    const gate = deferred();
    let runs = 0;
    const { result } = renderHook(() =>
      useCoalescedLoader(
        async () => {
          runs += 1;
          if (runs === 1) await gate.promise;
        },
        { minIntervalMs: 15_000 },
      ),
    );

    act(() => {
      result.current();
      result.current({ supersede: true });
      result.current({ supersede: true });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(runs).toBe(2);
    await act(async () => {
      gate.resolve();
    });
    expect(runs).toBe(2);
  });

  it("does not apply a load that resolves in the same turn as unmount", async () => {
    const gate = deferred();
    const applied: string[] = [];
    const { result, unmount } = renderHook(() =>
      useCoalescedLoader(
        async ({ isCurrent }) => {
          await gate.promise;
          if (isCurrent()) applied.push("painted");
        },
        { minIntervalMs: 15_000 },
      ),
    );

    let first!: Promise<void>;
    act(() => {
      first = result.current();
    });
    unmount();
    await act(async () => {
      gate.resolve();
      await first.catch(() => undefined);
    });
    expect(applied).toEqual([]);
  });
});
