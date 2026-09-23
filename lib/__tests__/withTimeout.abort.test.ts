jest.mock("@/lib/crashReporter", () => ({
  captureMessage: jest.fn(),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { TimeoutError, withTimeout } from "@/lib/authEngine";
import {
  currentFetchAbortSignals,
  runWithFetchAbortScope,
} from "@/lib/supabaseAbort.util";

describe("withTimeout abort", () => {
  it("aborts the scoped signal when the deadline fires", async () => {
    let seen: AbortSignal | undefined;
    const work = (signal: AbortSignal) =>
      new Promise<string>((_resolve, reject) => {
        seen = signal;
        signal.addEventListener("abort", () => {
          const err = new Error("Request cancelled");
          err.name = "AbortError";
          reject(err);
        });
      });

    await expect(withTimeout(work, 20, { jitter: false })).rejects.toBeInstanceOf(
      TimeoutError,
    );
    expect(seen?.aborted).toBe(true);
    expect(currentFetchAbortSignals()).toHaveLength(0);
  });

  it("exposes the signal to fetch scope while work is running", async () => {
    await runWithFetchAbortScope(new AbortController().signal, async () => {
      expect(currentFetchAbortSignals()).toHaveLength(1);
    });
    expect(currentFetchAbortSignals()).toHaveLength(0);
  });

  it("does not abort when work finishes in time", async () => {
    const result = await withTimeout(
      (signal) => {
        expect(signal.aborted).toBe(false);
        return Promise.resolve("ok");
      },
      1_000,
      { jitter: false },
    );
    expect(result).toBe("ok");
  });
});
