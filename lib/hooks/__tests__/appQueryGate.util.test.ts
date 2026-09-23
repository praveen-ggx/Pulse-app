import {
  APP_QUERY_GATE_URGENT_MAX_WAIT_MS,
  isAppQueryGateOpen,
  isEnabledListQueryPending,
} from "@/lib/hooks/appQueryGate.util";

describe("Load gate wait vs bootstrap", () => {
  it("does not open urgent market RPCs during the first seconds of bootstrap", () => {
    expect(APP_QUERY_GATE_URGENT_MAX_WAIT_MS).toBeGreaterThanOrEqual(12_000);
  });
});

describe("isAppQueryGateOpen", () => {
  const base = {
    orgId: "org-1",
    bootstrapReady: false,
    bootstrapStatus: "loading",
    urgent: false,
    quietElapsed: false,
    waitExpired: false,
  };

  it("stays closed until bootstrap is ready (non-urgent)", () => {
    expect(isAppQueryGateOpen(base)).toBe(false);
  });

  it("opens urgent queries as soon as bootstrap is ready", () => {
    expect(
      isAppQueryGateOpen({ ...base, bootstrapReady: true, urgent: true }),
    ).toBe(true);
  });

  it("opens immediately for indent review bids", () => {
    expect(isAppQueryGateOpen({ ...base, immediate: true })).toBe(true);
  });

  it("opens when bootstrap failed so Loads is not stuck on a spinner", () => {
    expect(
      isAppQueryGateOpen({ ...base, bootstrapStatus: "error", urgent: true }),
    ).toBe(true);
    expect(
      isAppQueryGateOpen({ ...base, bootstrapStatus: "error", urgent: false }),
    ).toBe(true);
  });

  it("opens after the max wait even if bootstrap never finishes", () => {
    expect(isAppQueryGateOpen({ ...base, waitExpired: true, urgent: true })).toBe(
      true,
    );
  });

  it("keeps non-urgent lists behind the quiet period after a healthy bootstrap", () => {
    expect(
      isAppQueryGateOpen({
        ...base,
        bootstrapReady: true,
        bootstrapStatus: "ready",
        quietElapsed: false,
      }),
    ).toBe(false);
    expect(
      isAppQueryGateOpen({
        ...base,
        bootstrapReady: true,
        bootstrapStatus: "ready",
        quietElapsed: true,
      }),
    ).toBe(true);
  });
});

describe("isEnabledListQueryPending", () => {
  it("does not treat a disabled query as pending", () => {
    expect(
      isEnabledListQueryPending({
        enabled: false,
        isLoading: false,
        isFetched: false,
        isError: false,
      }),
    ).toBe(false);
  });

  it("is pending while an enabled query has not settled", () => {
    expect(
      isEnabledListQueryPending({
        enabled: true,
        isLoading: true,
        isFetched: false,
        isError: false,
      }),
    ).toBe(true);
    expect(
      isEnabledListQueryPending({
        enabled: true,
        isLoading: false,
        isFetched: false,
        isError: false,
      }),
    ).toBe(true);
  });
});
