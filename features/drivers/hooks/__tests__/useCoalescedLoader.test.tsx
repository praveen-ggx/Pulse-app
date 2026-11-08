import { act, renderHook } from "@testing-library/react-native";
import { useCoalescedLoader } from "../useCoalescedLoader";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
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
});
