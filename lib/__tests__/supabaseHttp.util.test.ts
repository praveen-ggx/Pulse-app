import {
  admitSupabaseRequest,
  canRetryFetchAttempt,
  createConcurrencyGate,
  finishSupabaseCircuitProbe,
  isClientTimeoutError,
  isOriginDownError,
  isOriginDownErrorMessage,
  isOriginDownHttpStatus,
  isRetryableHttpResponse,
  isSupabaseCircuitOpen,
  noteSupabaseOriginDown,
  noteSupabaseOriginDownIfClientTimeout,
  resetSupabaseCircuit,
  shouldQueueDataFetch,
  SUPABASE_CIRCUIT_COOLDOWN_MS,
  TIMEOUT_MAX_RETRIES,
} from "@/lib/supabaseHttp.util";

function makeResponse(status: number, contentType = "application/json"): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? contentType : null) },
  } as unknown as Response;
}

afterEach(() => {
  resetSupabaseCircuit();
});

describe("supabaseHttp origin-down vs transient", () => {
  it("marks 503, 504, 521, and 544 as origin-down statuses", () => {
    expect(isOriginDownHttpStatus(503)).toBe(true);
    expect(isOriginDownHttpStatus(504)).toBe(true);
    expect(isOriginDownHttpStatus(502)).toBe(true);
    expect(isOriginDownHttpStatus(521)).toBe(true);
    expect(isOriginDownHttpStatus(544)).toBe(true);
    expect(isOriginDownHttpStatus(522)).toBe(false);
    expect(isOriginDownHttpStatus(500)).toBe(true);
  });

  it("does not retry origin-down HTTP responses", () => {
    expect(isRetryableHttpResponse(makeResponse(503))).toBe(false);
    expect(isRetryableHttpResponse(makeResponse(504))).toBe(false);
    expect(isRetryableHttpResponse(makeResponse(502))).toBe(false);
    expect(isRetryableHttpResponse(makeResponse(521))).toBe(false);
    expect(isRetryableHttpResponse(makeResponse(544))).toBe(false);
  });

  it("retries eligible transient statuses with backoff path", () => {
    expect(isRetryableHttpResponse(makeResponse(522))).toBe(true);
    expect(isRetryableHttpResponse(makeResponse(429))).toBe(true);
  });

  it("does not retry HTTP 500 (PostgREST Warp / statement timeout)", () => {
    expect(isRetryableHttpResponse(makeResponse(500))).toBe(false);
  });

  it("classifies origin-down messages including 57P03", () => {
    expect(isOriginDownErrorMessage("57P03 the database system is not accepting connections")).toBe(true);
    expect(isOriginDownErrorMessage("JWT expired")).toBe(false);
  });

  it("classifies plain objects by status/code even without digits in message", () => {
    expect(isOriginDownError({ message: "Service Unavailable", status: 503 })).toBe(true);
    expect(isOriginDownError({ message: "Web server is down", status: 521 })).toBe(true);
    expect(isOriginDownError({ message: "not accepting connections", code: "57P03" })).toBe(true);
    expect(isOriginDownError({ message: "JWT expired", code: "PGRST301", status: 401 })).toBe(false);
  });
});

describe("data fetch concurrency gate", () => {
  it("queues GET/HEAD data reads and skips auth + writes", () => {
    expect(shouldQueueDataFetch("https://x.supabase.co/rest/v1/trips")).toBe(true);
    expect(
      shouldQueueDataFetch("https://x.supabase.co/auth/v1/token", { method: "POST" }),
    ).toBe(false);
    expect(
      shouldQueueDataFetch("https://x.supabase.co/rest/v1/indents", { method: "POST" }),
    ).toBe(false);
  });

  it("queues PostgREST RPC POSTs so hub screens cannot stampede the pool", () => {
    expect(
      shouldQueueDataFetch(
        "https://x.supabase.co/rest/v1/rpc/get_mutual_connections",
        { method: "POST" },
      ),
    ).toBe(true);
    expect(
      shouldQueueDataFetch(
        "https://x.supabase.co/rest/v1/rpc/get_integrated_partners",
        { method: "POST" },
      ),
    ).toBe(true);
  });

  it("never runs more than max acquires at once", async () => {
    const gate = createConcurrencyGate(2);
    let concurrent = 0;
    let maxConcurrent = 0;
    const job = async () => {
      await gate.acquire();
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 8));
      concurrent -= 1;
      gate.release();
    };
    await Promise.all([job(), job(), job(), job()]);
    expect(maxConcurrent).toBe(2);
    expect(gate.activeCount).toBe(0);
  });

  it("drops a queued acquire when the signal aborts", async () => {
    const gate = createConcurrencyGate(1);
    await gate.acquire();
    const controller = new AbortController();
    const pending = gate.acquire(controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(gate.queuedCount).toBe(0);
    gate.release();
  });
});

describe("supabase origin-down circuit", () => {
  it("opens after an origin-down and classifies later errors as origin-down", () => {
    expect(isSupabaseCircuitOpen()).toBe(false);
    noteSupabaseOriginDown();
    expect(isSupabaseCircuitOpen()).toBe(true);
    expect(isOriginDownError({})).toBe(true);
    expect(isOriginDownError(new Error("Failed to fetch"))).toBe(true);
    resetSupabaseCircuit();
    expect(isSupabaseCircuitOpen()).toBe(false);
    expect(isOriginDownError({})).toBe(false);
  });
});

describe("isClientTimeoutError", () => {
  it("recognizes our own client-side request timeout", () => {
    const err = new Error("Request timed out");
    err.name = "TimeoutError";
    expect(isClientTimeoutError(err)).toBe(true);
  });

  it("does not treat a caller-initiated abort as a timeout", () => {
    const err = new Error("Request cancelled");
    err.name = "AbortError";
    expect(isClientTimeoutError(err)).toBe(false);
  });

  it("does not treat a generic network error as a timeout", () => {
    expect(isClientTimeoutError(new Error("Network request failed"))).toBe(false);
    expect(isClientTimeoutError(null)).toBe(false);
    expect(isClientTimeoutError(undefined)).toBe(false);
  });

  it("a timed-out request opens the circuit for subsequent origin-down checks", () => {
    const timeout = new Error("Request timed out");
    timeout.name = "TimeoutError";
    expect(isSupabaseCircuitOpen()).toBe(false);
    expect(noteSupabaseOriginDownIfClientTimeout(timeout)).toBe(true);
    expect(isSupabaseCircuitOpen()).toBe(true);
    resetSupabaseCircuit();
  });

  it("does not open the circuit for AbortError (request-level cancel ≠ origin-down)", () => {
    const abort = new Error("Request cancelled");
    abort.name = "AbortError";
    expect(noteSupabaseOriginDownIfClientTimeout(abort)).toBe(false);
    expect(isSupabaseCircuitOpen()).toBe(false);
  });
});

describe("request-level vs origin-level protections stay separate", () => {
  it("does not retry a TimeoutError at the fetch wrapper (TIMEOUT_MAX_RETRIES = 0)", () => {
    const timeout = new Error("Request timed out");
    timeout.name = "TimeoutError";
    expect(TIMEOUT_MAX_RETRIES).toBe(0);
    expect(
      canRetryFetchAttempt({
        attempt: 0,
        maxRetries: 2,
        timeoutMaxRetries: TIMEOUT_MAX_RETRIES,
        error: timeout,
      }),
    ).toBe(false);
  });

  it("does not retry a 504 via HTTP status (request-level) even before the circuit opens", () => {
    expect(isRetryableHttpResponse(makeResponse(504))).toBe(false);
    expect(isSupabaseCircuitOpen()).toBe(false);
  });

  it("keeps the circuit closed until an origin-down signal (503/504/timeout) is recorded", () => {
    expect(isSupabaseCircuitOpen()).toBe(false);
    expect(isRetryableHttpResponse(makeResponse(504))).toBe(false);
    expect(isSupabaseCircuitOpen()).toBe(false);
  });

  it("holds the circuit latched through the 13–17s window and until a successful probe", () => {
    jest.useFakeTimers();
    try {
      const t0 = Date.now();
      const timeout = new Error("Request timed out");
      timeout.name = "TimeoutError";
      noteSupabaseOriginDownIfClientTimeout(timeout);
      expect(isSupabaseCircuitOpen(t0)).toBe(true);
      expect(isSupabaseCircuitOpen(t0 + 13_000)).toBe(true);
      expect(isSupabaseCircuitOpen(t0 + 17_000)).toBe(true);
      expect(isSupabaseCircuitOpen(t0 + SUPABASE_CIRCUIT_COOLDOWN_MS - 1)).toBe(true);
      expect(isSupabaseCircuitOpen(t0 + SUPABASE_CIRCUIT_COOLDOWN_MS)).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("shared origin circuit admissions", () => {
  it("opens on TimeoutError, 503, 504, and PGRST003", () => {
    const timeout = new Error("Request timed out");
    timeout.name = "TimeoutError";
    expect(noteSupabaseOriginDownIfClientTimeout(timeout)).toBe(true);
    expect(isSupabaseCircuitOpen()).toBe(true);
    resetSupabaseCircuit();

    noteSupabaseOriginDown();
    expect(isOriginDownHttpStatus(503)).toBe(true);
    expect(isSupabaseCircuitOpen()).toBe(true);
    resetSupabaseCircuit();

    expect(isOriginDownHttpStatus(504)).toBe(true);
    noteSupabaseOriginDown();
    expect(isSupabaseCircuitOpen()).toBe(true);
    resetSupabaseCircuit();

    expect(isOriginDownError({ code: "PGRST003", message: "Timed out acquiring connection from connection pool" })).toBe(true);
    noteSupabaseOriginDown("PGRST003");
    expect(isSupabaseCircuitOpen()).toBe(true);
  });

  it("rejects a second caller during cooldown and allows only one half-open probe", () => {
    jest.useFakeTimers();
    const t0 = Date.now();
    try {
      noteSupabaseOriginDown();
      expect(admitSupabaseRequest(t0)).toBe("reject");
      expect(admitSupabaseRequest(t0 + 13_000)).toBe("reject");

      const afterCooldown = t0 + SUPABASE_CIRCUIT_COOLDOWN_MS;
      expect(admitSupabaseRequest(afterCooldown)).toBe("probe");
      expect(admitSupabaseRequest(afterCooldown)).toBe("reject");

      finishSupabaseCircuitProbe(true);
      expect(isSupabaseCircuitOpen()).toBe(false);
      expect(admitSupabaseRequest()).toBe("allow");
    } finally {
      jest.useRealTimers();
    }
  });

  it("re-opens on a failed half-open probe", () => {
    jest.useFakeTimers();
    const t0 = Date.now();
    try {
      noteSupabaseOriginDown();
      expect(admitSupabaseRequest(t0 + SUPABASE_CIRCUIT_COOLDOWN_MS)).toBe("probe");
      finishSupabaseCircuitProbe(false);
      expect(isSupabaseCircuitOpen()).toBe(true);
      expect(admitSupabaseRequest(Date.now())).toBe("reject");
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("bounded concurrency under 10/25/50/100 overlapping callers", () => {
  async function runFanout(callers: number) {
    const gate = createConcurrencyGate(6, 12);
    let maxInFlight = 0;
    let inFlight = 0;
    let rejected = 0;
    let ok = 0;
    const job = async () => {
      try {
        await gate.acquire();
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 2));
        inFlight -= 1;
        gate.release();
        ok += 1;
      } catch {
        rejected += 1;
      }
    };
    await Promise.all(Array.from({ length: callers }, () => job()));
    return { maxInFlight, rejected, ok, remaining: gate.activeCount };
  }

  it.each([10, 25, 50, 100])(
    "never exceeds 6 in-flight and rejects overflow at %s callers",
    async (n) => {
      const result = await runFanout(n);
      expect(result.maxInFlight).toBeLessThanOrEqual(6);
      expect(result.ok + result.rejected).toBe(n);
      expect(result.remaining).toBe(0);
      if (n > 18) expect(result.rejected).toBeGreaterThan(0);
    },
  );
});
