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
});
