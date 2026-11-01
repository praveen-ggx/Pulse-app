/**
 * Reconnect recovery for the shared origin circuit: reconnecting only lets one probe
 * through early (never closes the circuit by itself), at most once per interval.
 */
import {
  SUPABASE_CIRCUIT_COOLDOWN_MS,
  SUPABASE_EXPEDITED_PROBE_MIN_INTERVAL_MS,
  admitSupabaseRequest,
  currentSupabaseProbeGeneration,
  expediteSupabaseCircuitProbe,
  finishSupabaseCircuitProbe,
  isSupabaseCircuitOpen,
  noteSupabaseHealthy,
  noteSupabaseOriginDown,
  onSupabaseCircuitClosed,
  releaseSupabaseCircuitProbe,
  resetSupabaseCircuit,
} from "@/lib/supabaseHttp.util";

describe("expediteSupabaseCircuitProbe", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
    resetSupabaseCircuit();
  });
  afterEach(() => {
    resetSupabaseCircuit();
    jest.useRealTimers();
  });

  it("does nothing while the circuit is closed", () => {
    expect(expediteSupabaseCircuitProbe()).toBe(false);
    expect(admitSupabaseRequest()).toBe("allow");
  });

  it("ends the cooldown early but keeps the circuit open until a probe succeeds", () => {
    noteSupabaseOriginDown();
    expect(admitSupabaseRequest()).toBe("reject");

    expect(expediteSupabaseCircuitProbe()).toBe(true);
    expect(isSupabaseCircuitOpen()).toBe(true);
    expect(admitSupabaseRequest()).toBe("probe");
    // Only one probe at a time.
    expect(admitSupabaseRequest()).toBe("reject");

    finishSupabaseCircuitProbe(true);
    expect(isSupabaseCircuitOpen()).toBe(false);
  });

  it("a failed expedited probe reopens the circuit for a full cooldown", () => {
    noteSupabaseOriginDown();
    expediteSupabaseCircuitProbe();
    expect(admitSupabaseRequest()).toBe("probe");
    finishSupabaseCircuitProbe(false);
    expect(admitSupabaseRequest()).toBe("reject");
    jest.setSystemTime(Date.now() + SUPABASE_CIRCUIT_COOLDOWN_MS + 1);
    expect(admitSupabaseRequest()).toBe("probe");
  });

  it("a flapping network gets at most one expedited probe per interval", () => {
    noteSupabaseOriginDown();
    expect(expediteSupabaseCircuitProbe()).toBe(true);
    admitSupabaseRequest(); // probe now in flight
    for (let i = 0; i < 10; i += 1) expect(expediteSupabaseCircuitProbe()).toBe(false);

    finishSupabaseCircuitProbe(false);
    expect(expediteSupabaseCircuitProbe()).toBe(false);
    jest.setSystemTime(Date.now() + SUPABASE_EXPEDITED_PROBE_MIN_INTERVAL_MS);
    expect(expediteSupabaseCircuitProbe()).toBe(true);
  });
});

describe("releaseSupabaseCircuitProbe", () => {
  beforeEach(() => resetSupabaseCircuit());
  afterEach(() => resetSupabaseCircuit());

  it("frees a probe that got no verdict, leaving the circuit latched", () => {
    const t0 = Date.now();
    noteSupabaseOriginDown();
    const after = t0 + SUPABASE_CIRCUIT_COOLDOWN_MS + 1;
    expect(admitSupabaseRequest(after)).toBe("probe");
    releaseSupabaseCircuitProbe(currentSupabaseProbeGeneration());
    expect(isSupabaseCircuitOpen(after)).toBe(true);
    expect(admitSupabaseRequest(after)).toBe("probe");
  });

  it("cannot free a newer probe held by another request", () => {
    const t0 = Date.now();
    noteSupabaseOriginDown();
    const after = t0 + SUPABASE_CIRCUIT_COOLDOWN_MS + 1;
    expect(admitSupabaseRequest(after)).toBe("probe");
    const staleGeneration = currentSupabaseProbeGeneration();
    releaseSupabaseCircuitProbe(staleGeneration);
    expect(admitSupabaseRequest(after)).toBe("probe"); // a second request now holds it
    releaseSupabaseCircuitProbe(staleGeneration); // late release from the first request
    expect(admitSupabaseRequest(after)).toBe("reject");
  });
});

describe("onSupabaseCircuitClosed", () => {
  beforeEach(() => resetSupabaseCircuit());
  afterEach(() => resetSupabaseCircuit());

  it("fires once when an open circuit closes, not on every healthy response", () => {
    const listener = jest.fn();
    const unsubscribe = onSupabaseCircuitClosed(listener);
    noteSupabaseHealthy();
    expect(listener).not.toHaveBeenCalled();

    noteSupabaseOriginDown();
    noteSupabaseHealthy();
    noteSupabaseHealthy();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    noteSupabaseOriginDown();
    noteSupabaseHealthy();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
